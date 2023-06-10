//test
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as fse from 'fs-extra'

import { DefaultTemplateStorage, Storage, Template } from './storage';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { exec } from 'child_process';
import { CaseConverterEnum, generateTemplateFilesBatch } from 'generate-template-files';
import { emit } from 'process';

class CustomFileNode extends vscode.TreeItem2 {
    checkboxState?: { state: vscode.TreeItemCheckboxState; tooltip?: string; };
    children: CustomFileNode[] = [];
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public path: string,
        public readonly isDirectory: boolean = false,
        public readonly command?: vscode.Command,
    ) {
        super(label, collapsibleState);

        this.checkboxState = { state: vscode.TreeItemCheckboxState.Unchecked };
        // if (isDirectory) {
        //     this.checkboxState = { state: vscode.TreeItemCheckboxState.Unchecked };
        // }
    }
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
    vscode.commands.registerCommand('low-code-generator.getSelectedFiles', () => {
        const test = fileExplorerProvider.getSelectedFiles();
        vscode.window.showInformationMessage(test.toString());
    })
    vscode.commands.registerCommand('low-code-generator.generate', async () => {
        await generateLowCode(selectedTemplate,fileExplorerProvider,undefined);
    });

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
        await generateLowCode(selectedTemplate,fileExplorerProvider,uri.fsPath);
    });
}
function generateTemplateGenerator(outputPath: string, entity: string, module: string) {
    generateTemplateFilesBatch(
        [
            {
                option: 'generate',
                defaultCase: CaseConverterEnum.PascalCase,
                entry: {
                    folderPath: `${__dirname}/template`,
                },
                dynamicReplacers: [
                    { slot: '__entity__', slotValue: entity },
                    { slot: '__module__', slotValue: module }
                ],
                output: {
                    overwrite: true,
                    path: `${outputPath}/__module__(snakeCase)/__entity__(snakeCase)`,
                    pathAndFileNameDefaultCase: CaseConverterEnum.KebabCase,
                },
            },
        ]
    ).catch((error) => {
        console.error(error);
        vscode.window.showErrorMessage('Error generating files');
    });
}

async function generateLowCode(selectedTemplate: Template | undefined, fileExplorerProvider: FileExplorerProvider, targetPath: string) {
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

    const entity = await vscode.window.showInputBox({
        placeHolder: "Enter name for entity"
    });
    if (!entity) {
        return;
    }

    const module = await vscode.window.showInputBox({
        placeHolder: "Enter name for module"
    });
    if (!module) {
        return;
    }
    if (!targetPath) {
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

    generateTemplateGenerator(targetPath, entity, module)
    vscode.window.showInformationMessage('Files generated');

    console.log("Hello World!")
}