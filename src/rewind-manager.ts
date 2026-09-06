export {};
const vscode = require('vscode');
const simpleGit = require('simple-git');

const REWIND_STATE_KEY = 'vestige.rewindState';

class RewindManager { [key: string]: any;
    constructor(context) {
        this.context = context;
        this.originalBranch = null;
        this.isRewound = false;
        this.didStash = false;
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
        this.statusBar.command = 'vestige.stopRewind';
        this.statusBar.text = '$(debug-restart) Vestige Rewind Active';
        this.statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        context.subscriptions.push(this.statusBar);

        // Restore persisted rewind state so stopRewind still works after a
        // window reload mid-rewind.
        const saved = this.context?.workspaceState?.get(REWIND_STATE_KEY);
        if (saved && saved.isRewound) {
            this.isRewound = true;
            this.originalBranch = saved.originalBranch || null;
            this.didStash = !!saved.didStash;
            this.statusBar.show();
        }
    }

    async _persistState() {
        if (!this.context?.workspaceState) return;
        await this.context.workspaceState.update(REWIND_STATE_KEY, {
            isRewound: this.isRewound,
            originalBranch: this.originalBranch,
            didStash: this.didStash,
        });
    }

    async startRewind(repoPath, commitHash) {
        if (this.isRewound) {
            vscode.window.showWarningMessage('Already in Rewind mode. Stop it first.');
            return;
        }

        const git = simpleGit(repoPath);
        let stashed = false;

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
                stashed = true;
            }

            this.originalBranch = status.current;

            // Checkout commit
            await git.checkout(commitHash);

            this.isRewound = true;
            this.didStash = stashed;
            await this._persistState();
            this.statusBar.show();
            vscode.window.showInformationMessage(`⏪ Rewound to ${commitHash.substring(0, 7)}. Read-only mode recommended.`);

        } catch (error) {
            // If we stashed but the checkout failed, restore the user's changes
            if (stashed) {
                try {
                    await git.stash(['pop']);
                    stashed = false;
                } catch (popError) {
                    vscode.window.showErrorMessage(
                        `Rewind failed and your stashed changes could not be restored automatically: ${popError.message}. They are preserved in the stash list ('Vestige Rewind Stash').`
                    );
                }
            }
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

            // Restore stashed changes if we created the stash on startRewind
            if (this.didStash) {
                try {
                    await git.stash(['pop']);
                    this.didStash = false;
                    vscode.window.showInformationMessage('Your uncommitted changes were restored from the stash.');
                } catch (popError) {
                    this.didStash = false;
                    vscode.window.showErrorMessage(
                        `Could not restore your stashed changes automatically: ${popError.message}. They are preserved in the stash list ('Vestige Rewind Stash').`
                    );
                }
            }

            this.isRewound = false;
            this.originalBranch = null;
            await this._persistState();
            this.statusBar.hide();
            vscode.window.showInformationMessage('⏩ Returned to present time.');

        } catch (error) {
            vscode.window.showErrorMessage(`Return failed: ${error.message}`);
        }
    }
}

module.exports = RewindManager;
