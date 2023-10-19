//test
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as fse from 'fs-extra'
import * as pathF from 'path';
import { DefaultTemplateStorage, Storage, Template } from './storage';
import { CaseConverterEnum, generateTemplateFilesBatch } from 'generate-template-files';
const pattern = /__(\w+?)__(\(\w+Case\)|\w+Case|__|(?=__))?/g

class CustomFileNode implements vscode.TreeItem2 {
    checkboxState?: { state: vscode.TreeItemCheckboxState; tooltip?: string; };
    children: CustomFileNode[] = [];
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public path: string,
        public readonly isDirectory: boolean = false,
        public readonly command?: vscode.Command,
    ) {
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        this.checkboxState = { state: vscode.TreeItemCheckboxState.Unchecked };
        if (isDirectory) {
            this.iconPath = {
                light: vscode.Uri.file(pathF.join(__dirname, '..', 'images', 'folder.png')), // versión clara
                dark: vscode.Uri.file(pathF.join(__dirname, '..', 'images', 'folder.png'))  // versión oscura
            };
        } else {
            this.iconPath = {
                light: vscode.Uri.file(pathF.join(__dirname, '..', 'images', 'file.png')), // versión clara
                dark: vscode.Uri.file(pathF.join(__dirname, '..', 'images', 'file.png')) // versión oscura
            };
        }
    }
    iconPath?: vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri };
}

class FileExplorerProvider implements vscode.TreeDataProvider<CustomFileNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<CustomFileNode | CustomFileNode[] | void>();
    onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private rootPath: string) { }
    nodes: CustomFileNode[] = [];
    refresh(): void {
        this._onDidChangeTreeData.fire(
            this.nodes
        );
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    getTreeItem(element: CustomFileNode): vscode.TreeItem {
        return element;
    }


    getChildren(element?: CustomFileNode): Thenable<CustomFileNode[]> {
        if (!element) {
            const customNodes = this.getFileNodes(this.rootPath);
            this.nodes = customNodes;
            return Promise.resolve(customNodes);
        } else {
            return Promise.resolve(element.children);
        }
    }


    private getFileNodes(rootPath: string): CustomFileNode[] {
        try {
            const files = fs.readdirSync(rootPath);
            return files.map(file => {
                const filePath = `${rootPath}/${file}`;
                const isDirectory = fs.lstatSync(filePath).isDirectory();
                if (isDirectory) {
                    const dirNode = new CustomFileNode(file, vscode.TreeItemCollapsibleState.Collapsed, filePath, true, undefined);
                    dirNode.children = this.getNodesRecursive(filePath);
                    return dirNode;
                } else {
                    return new CustomFileNode(file, vscode.TreeItemCollapsibleState.None, filePath, false, undefined);
                }
            });
        } catch (error) {
            console.log(error);
            return [];
        }
    }

    private getNodesRecursive(dirPath: string): CustomFileNode[] {
        try {
            const files = fs.readdirSync(dirPath);
            return files.map(file => {
                const filePath = `${dirPath}/${file}`;
                const isDirectory = fs.lstatSync(filePath).isDirectory();
                if (isDirectory) {
                    const dirNode = new CustomFileNode(file, vscode.TreeItemCollapsibleState.Collapsed, filePath, true, undefined);
                    dirNode.children = this.getNodesRecursive(filePath);
                    return dirNode;
                } else {
                    return new CustomFileNode(file, vscode.TreeItemCollapsibleState.None, filePath, false, undefined);
                }
            });
        } catch (error) {
            console.log(error);
            return [];
        }
    }
    getSelectedFiles(): string[] {
        let selectedFiles: string[] = [];
        function getSelectedFilesRecursive(node: CustomFileNode) {
            if (node.checkboxState?.state === vscode.TreeItemCheckboxState.Checked && !node.isDirectory) {
                selectedFiles.push(node.path);
            }
            if (node.children) {
                node.children.forEach(child => getSelectedFilesRecursive(child));
            }
        }
        this.nodes.forEach(node => getSelectedFilesRecursive(node));
        return selectedFiles;
    }


    private getFilePath(element: CustomFileNode): string {
        return `${this.rootPath}/${element.label}`;
    }

    async editFile(node: CustomFileNode) {
        try {
            const filePath = node.path;
            const content = fs.readFileSync(filePath, 'utf-8');
            const document = await vscode.workspace.openTextDocument({ content });
            const editor = await vscode.window.showTextDocument(document);
            const newContent = editor.document.getText();
            fs.writeFileSync(filePath, newContent);
        } catch (error) {
            console.error(error);
        }
    }
    selectAll() {
        function selectOrUnselectAllRecursive(node: CustomFileNode, state: vscode.TreeItemCheckboxState) {
            node.checkboxState = { state: state };
            if (node.children) {
                node.children.forEach(child => selectOrUnselectAllRecursive(child, state));
            }
        }
        const state = this.nodes[0].checkboxState?.state === vscode.TreeItemCheckboxState.Unchecked ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
        this.nodes.forEach(node => selectOrUnselectAllRecursive(node, state));
        this.refresh();
    }
    selectNode(element: [CustomFileNode, vscode.TreeItemCheckboxState]) {
        function selectOrUnselectRecursive(node: CustomFileNode, state: vscode.TreeItemCheckboxState) {
            node.checkboxState = { state: state };
            if (node.children) {
                node.children.forEach(child => selectOrUnselectRecursive(child, state));
            }
        }
        selectOrUnselectRecursive(element[0], element[1]);
        this.refresh();
    }
}

export function activate(context: vscode.ExtensionContext) {
    const storage = new Storage(context.globalState);
    const defaultTemplateStorage = new DefaultTemplateStorage(context.globalState);
    let selectedTemplate: Template | undefined;
    let fileExplorerProvider: FileExplorerProvider;
    vscode.commands.registerCommand('template.add', async () => {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: "select a folder with templates",
            canSelectFolders: true,
            canSelectFiles: false
        };
        const folderPath = await vscode.window.showOpenDialog(options);
        if (!folderPath || folderPath.length !== 1) {
            return;
        }

        const name = await vscode.window.showInputBox({
            placeHolder: "Ingrese un nombre para la plantilla"
        });
        if (!name) {
            return;
        }
        const template = storage.get(name);
        if (template) {
            const replace = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: `ya existe esa plantilla ${template.name} deseas reemplazar?` });
            if (!replace || replace === 'No') {
                return;
            }
        }
        const newTemplate = {
            name: name,
            path: folderPath[0].path
        };
        storage.save(newTemplate);
    });

    vscode.commands.registerCommand('template.listTemplates', () => {
        const templates = storage.list();
        if (templates.length === 0) {
            vscode.window.showInformationMessage('No hay plantillas disponibles');
            return;
        }
        const templateNames = templates.map(template => template.name);
        // show quick with options to delete 
        vscode.window.showQuickPick(templateNames, { placeHolder: 'Seleccione una plantilla' })
            .then((selectedTemplateName) => {
                if (!selectedTemplateName) {
                    return;
                }
                selectedTemplate = templates.find(template => template.name === selectedTemplateName);
                fileExplorerProvider = new FileExplorerProvider(selectedTemplate?.path ?? '');

                const tree = vscode.window.createTreeView('templates', { treeDataProvider: fileExplorerProvider });
                tree.onDidChangeSelection(e => {
                    if (!e.selection[0].isDirectory) {
                        const openPath = vscode.Uri.parse(e.selection[0].path); //A request file path
                        vscode.workspace.openTextDocument(openPath).then(doc => {
                            vscode.window.showTextDocument(doc);
                        });
                    }
                });
                tree.onDidChangeCheckboxState(e => {
                    fileExplorerProvider.selectNode(e.items[0]);
                });
            });
    });
    vscode.commands.registerCommand('template.deleteTemplates', () => {
        const templates = storage.list();
        if (templates.length === 0) {
            vscode.window.showInformationMessage('No hay plantillas disponibles');
            return;
        }
        const templateNames = templates.map(template => template.name);
        // show quick with options to delete 
        vscode.window.showQuickPick(templateNames, { placeHolder: 'Seleccione una plantilla a eliminar', canPickMany: true })
            .then((selectedTemplateName) => {
                if (!selectedTemplateName) {
                    return;
                }
                storage.deleteMany(selectedTemplateName);
            });
    }
    );
    vscode.commands.registerCommand('low-code-generator.generate', () => {
        const generateOptions = [
            'Generate selected files',
            'Generate project'
        ];
        const types = {
            'Generate selected files': 'ONLY_SELECTED',
            'Generate project': 'PROJECT'
        }
        vscode.window.showQuickPick(generateOptions, { placeHolder: 'Seleccione una opción' })
            .then((selectedOption) => {
                if (!selectedOption) {
                    return;
                }
                const type = types[selectedOption];
                generateLowCode(selectedTemplate, fileExplorerProvider, undefined, type);
            });
    });
    vscode.commands.registerCommand('low-code-generator.getSelectedFiles', () => {
        const test = fileExplorerProvider.getSelectedFiles();
        vscode.window.showInformationMessage(test.toString());
    })
    // vscode.commands.registerCommand('low-code-generator.generate', async () => {
    //     await generateLowCode(selectedTemplate, fileExplorerProvider, undefined);
    // });

    vscode.commands.registerCommand('template.selectAll', async (node: CustomFileNode) => {
        fileExplorerProvider.selectAll();
    });
    vscode.commands.registerCommand('template.selectDefault', async (node: CustomFileNode) => {
        if (selectedTemplate === undefined) {
            vscode.window.showErrorMessage('Not exist a template selected');
            return;
        }
        const defaultTemplate = defaultTemplateStorage.get();
        if (defaultTemplate === undefined) {
            vscode.window.showErrorMessage('Not exist a default template');
            return;
        }
        if (defaultTemplate.path !== selectedTemplate.path) {
            defaultTemplateStorage.save(selectedTemplate);
            fileExplorerProvider = new FileExplorerProvider(selectedTemplate.path);
            fileExplorerProvider.refresh();
        }

    });
    vscode.commands.registerCommand('extension.generate-low-code', async (uri: vscode.Uri) => {
        console.log(uri);
        if (selectedTemplate === undefined) {
            vscode.window.showErrorMessage('Not exist a template selected');
            return;
        }
        await generateLowCode(selectedTemplate, fileExplorerProvider, uri.fsPath, 'ONLY_SELECTED');
    });
}
function generateTemplateGenerator(outputPath: string, replacers: any) {
    generateTemplateFilesBatch(
        [
            {
                option: 'generate',
                defaultCase: CaseConverterEnum.PascalCase,
                entry: {
                    folderPath: `${__dirname}/template`,
                },
                dynamicReplacers: replacers,
                output: {
                    overwrite: true,
                    path: outputPath,
                    pathAndFileNameDefaultCase: CaseConverterEnum.KebabCase,
                },
            },
        ]
    ).catch((error) => {
        console.error(error);
        vscode.window.showErrorMessage('Error generating files');
    });
}


function findMatchesInFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const matches = [...content.matchAll(pattern)];
    return matches.map(match => match[1]);
}

let matches = new Set();
function findPatternsInDirectory(directoryPath) {

    const items = fs.readdirSync(directoryPath);
    for (const item of items) {
        const fullPath = pathF.join(directoryPath, item);
        const stats = fs.statSync(fullPath);

        // Si es un directorio, hacer una búsqueda recursiva
        if (stats.isDirectory()) {
            const nameMatches = [...item.matchAll(pattern)].map(match => match[1]);

            matches = new Set([...matches, ...nameMatches]);
            const dirMatches = findPatternsInDirectory(fullPath);
        } else {
            // Si es un archivo, buscar patrones en el contenido del archivo
            const fileMatches = findMatchesInFile(fullPath);
            matches = new Set([...matches, ...fileMatches]);

            // También buscar patrones en el nombre del archivo
            const nameMatches = [...item.matchAll(pattern)].map(match => match[1]);
            matches = new Set([...matches, ...nameMatches]);
        }
    }

    return matches;
}
function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

async function generateLowCode(selectedTemplate: Template | undefined, fileExplorerProvider: FileExplorerProvider, targetPath: string, type = 'PROJECT') {
    if (selectedTemplate === undefined) {
        vscode.window.showErrorMessage('Not exist a template selected');
    }
    const selectedFiles = fileExplorerProvider.getSelectedFiles();
    if (selectedFiles.length === 0) {
        vscode.window.showErrorMessage('Not exist files selected');
        return;
    }

    const copyTemplatePath = __dirname + "/template";
    const templatePath = selectedTemplate.path
    try {
        fse.removeSync(copyTemplatePath);
        selectedFiles.forEach(file => {
            const fileName = file.replace(templatePath, '');
            const targetFile = `${copyTemplatePath}${fileName}`;
            fse.copySync(file, targetFile, { overwrite: true });
        });
    } catch (error) {
        console.error(error);
    }
    if (!targetPath && type === 'PROJECT') {
        const options: vscode.OpenDialogOptions = {
            defaultUri: vscode.workspace.workspaceFolders[0].uri,
            canSelectMany: false,
            openLabel: "select a folder to generate code",
            canSelectFolders: true,
            canSelectFiles: false,
            title: 'select folder'
        };
        const folderPath = await vscode.window.showOpenDialog(options);
        if (!folderPath || folderPath.length !== 1) {
            return;
        }
        targetPath = folderPath[0].path;
    }
    let project;
    let module;
    let entity;
    const results = findPatternsInDirectory(copyTemplatePath);

    switch (type) {
        case 'PROJECT':
            project = await vscode.window.showInputBox({
                placeHolder: "Enter name for project"
            });
            if (!project) {
                return;
            }
            generateTemplateGenerator(
                `${vscode.workspace.workspaceFolders[0].uri.path}/__project__(snakeCase)`
                , [
                    { slot: '__project__', slotValue: project },
                ]);
            break;
        case 'ONLY_SELECTED':
            let slots = [];
            for (const iterator of results) {
                entity = await vscode.window.showInputBox({
                    placeHolder: `Enter name for ${capitalize(iterator)}`,
                });
                slots.push({ slot: `__${iterator}__`, slotValue: entity })
            }
            if (!entity) {
                return;
            }
            generateTemplateGenerator(
                targetPath ?? `${vscode.workspace.workspaceFolders[0].uri.path}`
                , slots);
            break;
        case 'MODULE':
            module = await vscode.window.showInputBox({
                placeHolder: "Enter name for module"
            });
            if (!module) {
                return;
            }
            generateTemplateGenerator(
                `${targetPath}/__module__(snakeCase)/__entity__(snakeCase)`
                , [
                    { slot: '__entity__', slotValue: entity },
                    { slot: '__module__', slotValue: module }
                ]);
            break;

        default:
            break;
    }


    // generateTemplateGenerator(targetPath, entity, module)
    vscode.window.showInformationMessage('Files generated');

    console.log("Hello World!")
}