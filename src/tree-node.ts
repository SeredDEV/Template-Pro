/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface BaseTreeNode {
	reveal(element: TreeNode, options?: { select?: boolean; focus?: boolean; expand?: boolean | number }): Thenable<void>;
	refresh(treeNode?: TreeNode): void;
	view: vscode.TreeView<TreeNode>;
}

export type TreeNodeParent = TreeNode | BaseTreeNode;

export const EXPANDED_QUERIES_STATE = 'expandedQueries';
export function dispose<T extends vscode.Disposable>(disposables: T[]): T[] {
	disposables.forEach(d => d.dispose());
	return [];
}
export abstract class TreeNode implements vscode.Disposable {
	protected children: TreeNode[];
	childrenDisposables: vscode.Disposable[];
	parent: TreeNodeParent;
	label?: string;
	accessibilityInformation?: vscode.AccessibilityInformation;
	id?: string;

	constructor() { }
	abstract getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem>;
	getParent(): TreeNode | undefined {
		if (this.parent instanceof TreeNode) {
			return this.parent;
		}
	}

	async reveal(
		treeNode: TreeNode,
		options?: { select?: boolean; focus?: boolean; expand?: boolean | number },
	): Promise<void> {
		try {
			await this.parent.reveal(treeNode || this, options);
		} catch (e) {
            console.log(e);
		}
	}

	refresh(treeNode?: TreeNode): void {
		return this.parent.refresh(treeNode);
	}

	async cachedChildren(): Promise<TreeNode[]> {
		if (this.children && this.children.length) {
			return this.children;
		}
		return this.getChildren();
	}

	async getChildren(): Promise<TreeNode[]> {
		if (this.children && this.children.length) {
			dispose(this.children);
			this.children = [];
		}
		return [];
	}

	updateFromCheckboxChanged(_newState: vscode.TreeItemCheckboxState): void { }


	dispose(): void {
		if (this.childrenDisposables) {
			dispose(this.childrenDisposables);
			this.childrenDisposables = [];
		}
	}
}

export class LabelOnlyNode extends TreeNode {
	public readonly label: string = '';
	constructor(label: string) {
		super();
		this.label = label;
	}
	getTreeItem(): vscode.TreeItem {
		return new vscode.TreeItem(this.label);
	}

}


/**
 * File change node whose content is stored in memory and resolved when being revealed.
 */
export class FileChangeNode extends TreeNode implements vscode.TreeItem2 {
	public iconPath?:
		| string
		| vscode.Uri
		| { light: string | vscode.Uri; dark: string | vscode.Uri }
		| vscode.ThemeIcon;
	public fileChangeResourceUri: vscode.Uri;
	public contextValue: string;
	public command: vscode.Command;
	public opts: vscode.TextDocumentShowOptions;

	public checkboxState: { state: vscode.TreeItemCheckboxState; tooltip?: string; accessibilityInformation: vscode.AccessibilityInformation };

	public childrenDisposables: vscode.Disposable[] = [];
    getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        return this;
    }
}