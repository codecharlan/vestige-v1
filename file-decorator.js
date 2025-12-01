const vscode = require('vscode');

class FileDecorator {
    constructor(gitAnalyzer) {
        this.gitAnalyzer = gitAnalyzer;
        this.onDidChangeFileDecorationsEmitter = new vscode.EventEmitter();
        this.onDidChangeFileDecorations = this.onDidChangeFileDecorationsEmitter.event;
        this.disposables = [];

        this.disposables.push(vscode.window.registerFileDecorationProvider(this));
    }

    async provideFileDecoration(uri) {
        // Only process git-tracked files
        if (uri.scheme !== 'file') return;

        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (!workspaceFolder) return;

            // Lightweight analysis for explorer
            const stats = await this.gitAnalyzer.getFileStats(
                workspaceFolder.uri.fsPath,
                uri.fsPath
            );

            if (!stats) return;

            const config = vscode.workspace.getConfiguration('vestige');
            const churnThreshold = config.get('churnThreshold') || 10;
            const fossilThreshold = config.get('fossilThreshold') || 365;

            // Heatmap Logic
            if (stats.commits > churnThreshold) {
                return {
                    badge: '🔥',
                    tooltip: `High Churn: ${stats.commits} changes`,
                    color: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground')
                };
            } else if (stats.ageDays > fossilThreshold) {
                return {
                    badge: '🗿',
                    tooltip: `Fossil: ${stats.ageDays} days old`,
                    color: new vscode.ThemeColor('gitDecoration.ignoredResourceForeground')
                };
            } else if (stats.ageDays < 7) {
                return {
                    badge: '✨',
                    tooltip: `New: ${stats.ageDays} days old`,
                    color: new vscode.ThemeColor('gitDecoration.addedResourceForeground')
                };
            }
        } catch (error) {
            // console.error(error);
            return;
        }
    }

    dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}

module.exports = FileDecorator;
