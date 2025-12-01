const vscode = require('vscode');
const simpleGit = require('simple-git');

class VestigeDocumentProvider {
    constructor() {
        this.onDidChangeEmitter = new vscode.EventEmitter();
        this.onDidChange = this.onDidChangeEmitter.event;
    }

    async provideTextDocumentContent(uri) {
        // uri path is /commit/path/to/file
        // query is repoPath
        const repoPath = uri.query;
        const parts = uri.path.split('/');
        const commitHash = parts[1];
        const filePath = parts.slice(2).join('/');

        if (!repoPath || !commitHash || !filePath) {
            return 'Error: Invalid URI';
        }

        try {
            const git = simpleGit(repoPath);
            const content = await git.show([`${commitHash}:${filePath}`]);
            return content;
        } catch (error) {
            return `Error loading file at commit ${commitHash}: ${error.message}`;
        }
    }
}

module.exports = VestigeDocumentProvider;
