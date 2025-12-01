const vscode = require('vscode');

class ZombieDetector {
    constructor(gitAnalyzer) {
        this.gitAnalyzer = gitAnalyzer;
    }

    async scan(repoPath) {
        return await this.gitAnalyzer.detectZombieCode(repoPath);
    }

    async showReport(zombies) {
        if (zombies.length === 0) {
            vscode.window.showInformationMessage('No zombie code detected! 🧟');
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
            const doc = await vscode.workspace.openTextDocument(selected.file);
            await vscode.window.showTextDocument(doc);
        }
    }
}

module.exports = ZombieDetector;
