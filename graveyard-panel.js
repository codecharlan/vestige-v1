const vscode = require('vscode');
const path = require('path');

class GraveyardProvider {
    constructor(gitAnalyzer) {
        this.gitAnalyzer = gitAnalyzer;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.deletedFiles = [];
        this.repoPath = null;
    }

    async refresh(repoPath) {
        this.repoPath = repoPath;
        this.deletedFiles = await this.gitAnalyzer.findDeletedFiles(repoPath);
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) {
            // Root level - show all deleted files
            return this.deletedFiles.map(file => {
                const item = new vscode.TreeItem(
                    path.basename(file.path),
                    vscode.TreeItemCollapsibleState.None
                );
                item.description = `Deleted ${file.deletedAt}`;
                item.tooltip = `Deleted by ${file.deletedBy} on ${file.deletedAt}\nCommit: ${file.commit}`;
                item.contextValue = 'deletedFile';
                item.command = {
                    command: 'vestige.viewDeletedFile',
                    title: 'View Deleted File',
                    arguments: [file]
                };
                item.iconPath = new vscode.ThemeIcon('trash');

                // Store file data for commands
                item.file = file;

                return item;
            });
        }
        return [];
    }
}

class GraveyardPanel {
    constructor(context, gitAnalyzer) {
        this.context = context;
        this.gitAnalyzer = gitAnalyzer;
        this.provider = new GraveyardProvider(gitAnalyzer);

        this.treeView = vscode.window.createTreeView('vestige.graveyard', {
            treeDataProvider: this.provider
        });

        context.subscriptions.push(this.treeView);
    }

    async refresh(repoPath) {
        await this.provider.refresh(repoPath);
    }

    dispose() {
        this.treeView.dispose();
    }
}

module.exports = GraveyardPanel;
