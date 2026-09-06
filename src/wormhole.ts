export {};
const vscode = require('vscode');

class WormholeManager { [key: string]: any;
    constructor(timeMachine) {
        this.timeMachine = timeMachine;
    }

    /**
     * God-Tier: Inject historical code into the present.
     */
    async openPortal(editor, commitHash, filePath) {
        if (!commitHash || !/^[0-9a-f]{4,40}$/i.test(String(commitHash))) {
            vscode.window.showWarningMessage('Temporal Wormhole needs a commit hash — open it from a timeline entry.');
            return;
        }

        vscode.window.showInformationMessage(`Opening Temporal Wormhole to [${commitHash.substring(0, 7)}]... 🕳️`);

        try {
            const repoPath = vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath;
            if (!repoPath) return;

            // Fetch the historical file content (source, never executed)
            const content = await this.timeMachine.getHistoricalContent(repoPath, filePath, commitHash);
            if (!content || !content.trim()) {
                vscode.window.showWarningMessage('The file was empty at that commit — nothing to restore.');
                return;
            }

            // Let the user confirm before their document is modified
            const action = await vscode.window.showInformationMessage(
                `Insert the historical version of this file (${content.split('\n').length} lines) at the cursor?`,
                'Insert', 'Preview', 'Cancel'
            );

            if (action === 'Preview') {
                const doc = await vscode.workspace.openTextDocument({ content, language: editor.document.languageId });
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, true);
                return;
            }
            if (action !== 'Insert') return;

            await editor.edit(editBuilder => {
                const position = editor.selection.active;
                editBuilder.insert(position, `\n// --- Restored via Temporal Wormhole [${commitHash.substring(0, 7)}] ---\n${content}\n// ---\n`);
            });
            vscode.window.showInformationMessage('Code fragment successfully restored from the past.');
        } catch (e) {
            vscode.window.showErrorMessage(`Wormhole failure: ${e.message}`);
        }
    }
}

module.exports = WormholeManager;
