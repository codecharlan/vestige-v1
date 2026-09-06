export {};
const vscode = require('vscode');
const path = require('path');

class ZombieDetector { [key: string]: any;
    constructor(gitAnalyzer) {
        this.gitAnalyzer = gitAnalyzer;
        this.repoPath = null;
    }

    async scan(repoPath) {
        this.repoPath = repoPath;
        return await this.gitAnalyzer.detectZombieCode(repoPath);
    }

    async showReport(zombies, repoPath) {
        const root = repoPath || this.repoPath;

        if (zombies.length === 0) {
            vscode.window.showInformationMessage('No zombie code detected! ✅');
            return;
        }

        const items = zombies.map(z => ({
            label: `🧟 ${z.file}`,
            description: `${z.ageDays} days old`,
            detail: `Last commit: ${z.lastCommit.message}`,
            file: z.file
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Found ${zombies.length} zombie files. Select to inspect.`,
        });

        if (selected) {
            const absolutePath = root ? path.join(root, selected.file) : selected.file;
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath));
            await vscode.window.showTextDocument(doc);
        }
    }
}

module.exports = ZombieDetector;
