const vscode = require('vscode');
const simpleGit = require('simple-git');

class RewindManager {
    constructor(context) {
        this.context = context;
        this.originalBranch = null;
        this.isRewound = false;
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
        this.statusBar.command = 'vestige.stopRewind';
        this.statusBar.text = '$(debug-restart) Vestige Rewind Active';
        this.statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        context.subscriptions.push(this.statusBar);
    }

    async startRewind(repoPath, commitHash) {
        if (this.isRewound) {
            vscode.window.showWarningMessage('Already in Rewind mode. Stop it first.');
            return;
        }

        const git = simpleGit(repoPath);

        try {
            // Save current state
            const status = await git.status();
            if (!status.isClean()) {
                const proceed = await vscode.window.showWarningMessage(
                    'You have uncommitted changes. Stash them and proceed?',
                    'Yes', 'No'
                );
                if (proceed !== 'Yes') return;

                await git.stash(['push', '-m', 'Vestige Rewind Stash']);
            }

            this.originalBranch = status.current;

            // Checkout commit
            await git.checkout(commitHash);

            this.isRewound = true;
            this.statusBar.show();
            vscode.window.showInformationMessage(`⏪ Rewound to ${commitHash.substring(0, 7)}. Read-only mode recommended.`);

        } catch (error) {
            vscode.window.showErrorMessage(`Rewind failed: ${error.message}`);
        }
    }

    async stopRewind(repoPath) {
        if (!this.isRewound) return;

        const git = simpleGit(repoPath);

        try {
            // Restore branch
            if (this.originalBranch) {
                await git.checkout(this.originalBranch);
            } else {
                // If detached head before, maybe just stay? or ask?
                // For now assume we go back to main/master if original unknown, but we saved it.
                await git.checkout('main').catch(() => git.checkout('master'));
            }

            // Pop stash if we made one? 
            // We might want to ask user, but for simplicity let's leave it in stash list 
            // so we don't accidentally cause conflicts.

            this.isRewound = false;
            this.statusBar.hide();
            vscode.window.showInformationMessage('⏩ Returned to present time.');

        } catch (error) {
            vscode.window.showErrorMessage(`Return failed: ${error.message}`);
        }
    }
}

module.exports = RewindManager;
