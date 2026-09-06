export {};
const vscode = require('vscode');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_ENTRIES = 500;

class FileDecorator { [key: string]: any;
    constructor(gitAnalyzer) {
        this.gitAnalyzer = gitAnalyzer;
        this.onDidChangeFileDecorationsEmitter = new vscode.EventEmitter();
        this.onDidChangeFileDecorations = this.onDidChangeFileDecorationsEmitter.event;
        this.disposables = [];

        /** fsPath → { decoration, expiresAt } */
        this._cache = new Map();

        this.disposables.push(this.onDidChangeFileDecorationsEmitter);
        this.disposables.push(vscode.window.registerFileDecorationProvider(this));
    }

    async provideFileDecoration(uri, token) {
        // Only process git-tracked files
        if (uri.scheme !== 'file') return;

        // Serve from cache while fresh
        const cached = this._cache.get(uri.fsPath);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.decoration;
        }

        if (token?.isCancellationRequested) return;

        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (!workspaceFolder) return;

            // Lightweight analysis for explorer
            const stats = await this.gitAnalyzer.getFileStats(
                workspaceFolder.uri.fsPath,
                uri.fsPath
            );

            if (token?.isCancellationRequested) return;

            const decoration = this._buildDecoration(stats);
            this._storeInCache(uri.fsPath, decoration);
            return decoration;
        } catch (error) {
            // console.error(error);
            return;
        }
    }

    _buildDecoration(stats) {
        if (!stats) return undefined;

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
        return undefined;
    }

    _storeInCache(fsPath, decoration) {
        // Cap size — evict oldest entries first (Map preserves insertion order)
        while (this._cache.size >= CACHE_MAX_ENTRIES) {
            const oldestKey = this._cache.keys().next().value;
            this._cache.delete(oldestKey);
        }
        this._cache.set(fsPath, { decoration, expiresAt: Date.now() + CACHE_TTL_MS });
    }

    dispose() {
        this._cache.clear();
        this.disposables.forEach(d => d.dispose());
    }
}

module.exports = FileDecorator;
