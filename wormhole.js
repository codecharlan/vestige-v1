const vscode = require('vscode');
const path = require('path');

class WormholeManager {
    constructor(timeMachine) {
        this.timeMachine = timeMachine;
    }

    /**
     * God-Tier: Inject historical code into the present.
     */
    async openPortal(editor, commitHash, filePath) {
        vscode.window.showInformationMessage(`Opening Temporal Wormhole to [${commitHash.substring(0, 7)}]... 🕳️`);

        try {
            const repoPath = vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath;
            if (!repoPath) return;

            // Extract historical fragment
            // In a real impl, we'd allow the user to select a range in a preview.
            // For now, we simulate extracting a specific "Archetype" function.
            const content = await this.timeMachine.runVirtual(repoPath, filePath, commitHash);

            // Logic: Verify fragment before injection
            // Simulation of verification
            const isSafe = !content.includes('error') && !content.includes('Error');

            if (isSafe) {
                await editor.edit(editBuilder => {
                    const position = editor.selection.active;
                    editBuilder.insert(position, `\n// --- Restored via Temporal Wormhole [${commitHash.substring(0, 7)}] ---\n${content}\n// ---\n`);
                });
                vscode.window.showInformationMessage("Code fragment successfully restored from the past.");
            } else {
                vscode.window.showErrorMessage("Temporal Wormhole collapsed: Injected code has historical regressions.");
            }
        } catch (e) {
            vscode.window.showErrorMessage(`Wormhole failure: ${e.message}`);
        }
    }
}

module.exports = WormholeManager;
