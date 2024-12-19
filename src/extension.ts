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
        this.checkboxState = {
            state: vscode.TreeItemCheckboxState.Unchecked,
            tooltip: isDirectory ? 'No files selected' : 'Not selected'
        };

        // Configurar iconos
        if (isDirectory) {
            this.iconPath = {
                light: vscode.Uri.file(pathF.join(__dirname, '..', 'images', 'folder.png')),
                dark: vscode.Uri.file(pathF.join(__dirname, '..', 'images', 'folder.png'))
            };
        } else {
            this.iconPath = {
                light: vscode.Uri.file(pathF.join(__dirname, '..', 'images', 'file.png')),
                dark: vscode.Uri.file(pathF.join(__dirname, '..', 'images', 'file.png'))
            };
        }
    }

    iconPath?: vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri };
}


class FileExplorerProvider implements vscode.TreeDataProvider<CustomFileNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<CustomFileNode | CustomFileNode[] | void>();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    nodes: CustomFileNode[] = [];

    constructor(private rootPath: string) { }

    refresh(): void {
        this._onDidChangeTreeData.fire(this.nodes);
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
                    const dirNode = new CustomFileNode(
                        file,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        filePath,
                        true,
                        undefined
                    );
                    dirNode.children = this.getNodesRecursive(filePath);
                    return dirNode;
                } else {
                    return new CustomFileNode(
                        file,
                        vscode.TreeItemCollapsibleState.None,
                        filePath,
                        false,
                        undefined
                    );
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
                    const dirNode = new CustomFileNode(
                        file,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        filePath,
                        true,
                        undefined
                    );
                    dirNode.children = this.getNodesRecursive(filePath);
                    return dirNode;
                } else {
                    return new CustomFileNode(
                        file,
                        vscode.TreeItemCollapsibleState.None,
                        filePath,
                        false,
                        undefined
                    );
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
            if (!node.isDirectory && node.checkboxState?.state === vscode.TreeItemCheckboxState.Checked) {
                selectedFiles.push(node.path);
            }
            if (node.children) {
                node.children.forEach(child => getSelectedFilesRecursive(child));
            }
        }

        this.nodes.forEach(node => getSelectedFilesRecursive(node));
        return selectedFiles;
    }

    selectAll() {
        const newState = this.nodes[0]?.checkboxState?.state === vscode.TreeItemCheckboxState.Unchecked ?
            vscode.TreeItemCheckboxState.Checked :
            vscode.TreeItemCheckboxState.Unchecked;

        function selectOrUnselectAllRecursive(node: CustomFileNode, state: vscode.TreeItemCheckboxState) {
            node.checkboxState = {
                state: state,
                tooltip: node.isDirectory ?
                    (state === vscode.TreeItemCheckboxState.Checked ? 'All files selected' : 'No files selected') :
                    (state === vscode.TreeItemCheckboxState.Checked ? 'Selected' : 'Not selected')
            };
            if (node.children) {
                node.children.forEach(child => selectOrUnselectAllRecursive(child, state));
            }
        }

        this.nodes.forEach(node => selectOrUnselectAllRecursive(node, newState));
        this.refresh();
    }

    selectNode(element: [CustomFileNode, vscode.TreeItemCheckboxState]) {
        function updateParentState(node: CustomFileNode): vscode.TreeItemCheckboxState {
            if (!node.children || node.children.length === 0) {
                return node.checkboxState?.state || vscode.TreeItemCheckboxState.Unchecked;
            }

            const childStates = node.children.map(child =>
                child.checkboxState?.state || vscode.TreeItemCheckboxState.Unchecked
            );

            return childStates.every(state => state === vscode.TreeItemCheckboxState.Checked) ?
                vscode.TreeItemCheckboxState.Checked :
                vscode.TreeItemCheckboxState.Unchecked;
        }

        function selectOrUnselectRecursive(node: CustomFileNode, state: vscode.TreeItemCheckboxState) {
            if (node.isDirectory) {
                node.children?.forEach(child => selectOrUnselectRecursive(child, state));
                const resultState = updateParentState(node);
                const someChecked = node.children?.some(
                    child => child.checkboxState?.state === vscode.TreeItemCheckboxState.Checked
                );
                node.checkboxState = {
                    state: resultState,
                    tooltip: resultState === vscode.TreeItemCheckboxState.Checked ?
                        'All files selected' :
                        someChecked ? 'Some files selected' : 'No files selected'
                };
            } else {
                node.checkboxState = {
                    state: state,
                    tooltip: state === vscode.TreeItemCheckboxState.Checked ? 'Selected' : 'Not selected'
                };
            }
        }

        selectOrUnselectRecursive(element[0], element[1]);
        this.refresh();
    }

    async editFile(node: CustomFileNode) {
        try {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(node.path));
            await vscode.window.showTextDocument(document);
        } catch (error) {
            console.error(error);
            vscode.window.showErrorMessage(`Error opening file: ${error.message}`);
        }
    }

    private getFilePath(element: CustomFileNode): string {
        return `${this.rootPath}/${element.label}`;
    }
}

export function activate(context: vscode.ExtensionContext) {
    const storage = new Storage(context.globalState);
    const defaultTemplateStorage = new DefaultTemplateStorage(context.globalState);
    let selectedTemplate: Template | undefined;
    let fileExplorerProvider: FileExplorerProvider;
    vscode.commands.registerCommand('template.add', async () => {
        // query to select a template folder or a project for make documentation

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
    vscode.commands.registerCommand('template-generator-pro.generate', () => {
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
    vscode.commands.registerCommand('template-generator-pro.getSelectedFiles', () => {
        const test = fileExplorerProvider.getSelectedFiles();
        vscode.window.showInformationMessage(test.toString());
    })
    // vscode.commands.registerCommand('template-generator-pro.generate', async () => {
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


let matches = new Set<string>();

function findPatternsInDirectory(directoryPath: string): Set<string> {
    matches = new Set<string>(); // Reiniciamos el Set para cada búsqueda
    const items = fs.readdirSync(directoryPath);
    for (const item of items) {
        const fullPath = pathF.join(directoryPath, item);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
            const nameMatches = [...item.matchAll(pattern)].map(match => match[1]);
            matches = new Set([...matches, ...nameMatches]);
            findPatternsInDirectory(fullPath);
        } else {
            const fileMatches = findMatchesInFile(fullPath);
            matches = new Set([...matches, ...fileMatches]);
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
    console.log('Starting generation with:', { type, targetPath });

    if (selectedTemplate === undefined) {
        vscode.window.showErrorMessage('Not exist a template selected');
        return;
    }
    console.log('Template selected:', selectedTemplate);

    const selectedFiles = fileExplorerProvider.getSelectedFiles();
    console.log('Selected files:', selectedFiles);

    if (selectedFiles.length === 0) {
        vscode.window.showErrorMessage('Not exist files selected');
        return;
    }

    const copyTemplatePath = __dirname + "/template";
    const templatePath = selectedTemplate.path;
    console.log('Paths:', { copyTemplatePath, templatePath });

    try {
        fse.removeSync(copyTemplatePath);
        selectedFiles.forEach(file => {
            const fileName = file.replace(templatePath, '');
            const targetFile = `${copyTemplatePath}${fileName}`;
            console.log('Copying file:', { from: file, to: targetFile });
            fse.copySync(file, targetFile, { overwrite: true });
        });

        // ... resto del código ...

        const results = findPatternsInDirectory(copyTemplatePath);
        console.log('Found patterns:', Array.from(results));

        const parametersArray = Array.from(results) as string[];
        const parameters = await showParametersInputBox(parametersArray, type);
        console.log('User input parameters:', parameters);

        if (parameters) {
            console.log('Generating with parameters:', {
                targetPath: targetPath ?? `${vscode.workspace.workspaceFolders[0].uri.path}`,
                parameters
            });

            generateTemplateGenerator(
                targetPath ?? `${vscode.workspace.workspaceFolders[0].uri.path}`,
                parameters
            );

            vscode.window.showInformationMessage('Files generated successfully!');
        }

    } catch (error) {
        console.error('Error in generation:', error);
        vscode.window.showErrorMessage('Error generating files: ' + error.message);
    }
}


async function showParametersInputBox(parameters: string[], type: string): Promise<{ slot: string; slotValue: string; }[]> {
    const panel = vscode.window.createWebviewPanel(
        'templateParameters',
        'Template Parameters',
        vscode.ViewColumn.One,
        { 
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = `<!DOCTYPE html>
    <html>
    <head>
        <style>
            :root {
                --border-radius: 6px;
                --spacing: 24px;
                --min-width: 600px;
                --max-width: 1200px;
            }
            
            body { 
                padding: 0;
                margin: 0;
                color: var(--vscode-foreground);
                font-family: var(--vscode-font-family);
                background: var(--vscode-editor-background);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .container {
                background: var(--vscode-sideBar-background);
                border-radius: var(--border-radius);
                padding: var(--spacing);
                width: clamp(var(--min-width), 90vw, var(--max-width));
                margin: var(--spacing);
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            
            @media (max-width: 640px) {
                :root {
                    --min-width: 95vw;
                }
                .container {
                    margin: 10px;
                    padding: 16px;
                }
            }
            
            .title {
                margin-bottom: var(--spacing);
                font-size: 1.4em;
                color: var(--vscode-foreground);
                font-weight: 600;
                text-align: center;
                border-bottom: 1px solid var(--vscode-input-border);
                padding-bottom: 16px;
            }
            
            .form-group {
                margin-bottom: 24px;
                background: var(--vscode-editor-background);
                padding: 16px;
                border-radius: var(--border-radius);
            }
            
            label {
                display: block;
                margin-bottom: 8px;
                font-weight: 500;
                color: var(--vscode-input-foreground);
            }
            
            input {
                width: 100%;
                padding: 10px 12px;
                border: 1px solid var(--vscode-input-border);
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border-radius: var(--border-radius);
                box-sizing: border-box;
                font-size: 14px;
                transition: border-color 0.2s ease;
            }
            
            input:focus {
                outline: none;
                border-color: var(--vscode-focusBorder);
            }
            
            input::placeholder {
                color: var(--vscode-input-placeholderForeground);
                opacity: 0.7;
            }
            
            .button-container {
                text-align: center;
                margin: var(--spacing) 0;
                padding-bottom: var(--spacing);
                border-bottom: 1px solid var(--vscode-input-border);
            }
            
            button {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 10px 24px;
                cursor: pointer;
                border-radius: var(--border-radius);
                font-size: 14px;
                font-weight: 500;
                transition: background-color 0.2s ease;
                min-width: 120px;
            }
            
            button:hover {
                background: var(--vscode-button-hoverBackground);
            }
            
            button:active {
                transform: translateY(1px);
            }
            
            .required-field {
                color: var(--vscode-inputValidation-errorBorder);
                margin-left: 4px;
            }

            .description-text {
                background-color: #2d2d2d;
                color: #d4d4d4;
                font-family: "Courier New", Courier, monospace;
                font-size: 12px;
                line-height: 1.5;
                padding: 15px;
                border-radius: 8px;
                border: 1px solid #3c3c3c;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                white-space: pre-line;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="title">Template Pro Parameters</div>
            <form id="parametersForm">
                ${parameters.map(param => `
                    <div class="form-group">
                        <label for="${param}">
                            ${param}
                            <span class="required-field">*</span>
                        </label>
                        <input 
                            type="text" 
                            id="${param}" 
                            name="${param}" 
                            required 
                            placeholder="Enter value for ${param}"
                            autocomplete="off"
                        >
                    </div>
                `).join('')}
                <div class="button-container">
                    <button type="submit">Generate Code</button>
                </div>
                <div class="description-text">
                    endpointName: The name of your API endpoint (e.g., users --> "mUsersNew" , orders --> "mOrdersList")
                    dbType: Database type for this endpoint (e.g., "main", "admin")
                    currentFolderName: Name of the current working directory where the code will be generated
                    operationFolderName: Folder name for the operation (e.g., "create", "update", "delete", "list", "new", "new")
                    dbTypeLetter: Single letter identifier for database type (e.g., "M" for MongoDB, "P" for PostgreSQL)
                </div>
            </form>
        </div>
        <script>
            const vscode = acquireVsCodeApi();
            
            // Adjust container width on resize
            function adjustContainerSize() {
                const container = document.querySelector('.container');
                const minWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--min-width'));
                const maxWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--max-width'));
                const idealWidth = Math.min(Math.max(window.innerWidth * 0.9, minWidth), maxWidth);
                container.style.width = idealWidth + 'px';
            }

            window.addEventListener('resize', adjustContainerSize);
            adjustContainerSize(); // Initial adjustment
            
            document.getElementById('parametersForm').addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const parameters = [];
                
                formData.forEach((value, key) => {
                    parameters.push({ 
                        slot: \`__\${key}__\`, 
                        slotValue: String(value).trim() 
                    });
                });
                
                vscode.postMessage({ parameters });
            });
            
            // Auto-focus first input
            const firstInput = document.querySelector('input');
            if (firstInput) {
                firstInput.focus();
            }
        </script>
    </body>
    </html>`;

    return new Promise<{ slot: string; slotValue: string; }[]>((resolve) => {
        panel.webview.onDidReceiveMessage(
            message => {
                panel.dispose();
                resolve(message.parameters);
            },
            undefined,
            []
        );
    });
}