export {};
const vscode = require('vscode');

class GhostCursorManager { [key: string]: any;
    constructor() {
        this.isReplaying = false;
        this.decorationType = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: ' ⌨️',
                margin: '0 0 0 5px',
                color: '#60A5FA',
                fontWeight: 'bold'
            },
            backgroundColor: 'rgba(96, 165, 250, 0.1)'
        });
    }

    /**
     * God-Tier: Replay how a block of code was birthed.
     *
     * The replay happens in a scratch (untitled) document so the user's real
     * file is never modified by the animation.
     */
    async replay(editor, diff) {
        if (this.isReplaying) return;
        this.isReplaying = true;

        let ghostEditor = null;
        try {
            const lines = diff.split('\n');
            const additions = lines.filter(l => l.startsWith('+') && !l.startsWith('+++'));

            if (additions.length === 0) {
                vscode.window.showInformationMessage('No added lines in this commit to replay.');
                return;
            }

            vscode.window.showInformationMessage('Initiating Ghost Cursor replay... 👻');

            const ghostDoc = await vscode.workspace.openTextDocument({
                content: '',
                language: editor.document.languageId
            });
            ghostEditor = await vscode.window.showTextDocument(ghostDoc, vscode.ViewColumn.Beside, false);

            // Cap the replay so huge commits don't animate for minutes
            const replayLines = additions.slice(0, 40);

            for (const line of replayLines) {
                const content = line.substring(1);
                if (!content.trim()) continue;

                const lineNo = ghostEditor.document.lineCount - 1;
                const lineStart = new vscode.Position(lineNo, 0);

                // Replay character by character, advancing the insertion point
                for (let i = 0; i < content.length; i++) {
                    const insertAt = lineStart.translate(0, i);
                    await ghostEditor.edit(editBuilder => {
                        editBuilder.insert(insertAt, content[i]);
                    }, { undoStopBefore: false, undoStopAfter: false });

                    // Show ghost cursor decoration trailing the typed text
                    ghostEditor.setDecorations(this.decorationType, [new vscode.Range(lineStart, insertAt.translate(0, 1))]);

                    await new Promise(r => setTimeout(r, 15 + Math.random() * 35));
                }

                // New line at the end of the document
                const endPos = new vscode.Position(ghostEditor.document.lineCount - 1, ghostEditor.document.lineAt(ghostEditor.document.lineCount - 1).text.length);
                await ghostEditor.edit(editBuilder => {
                    editBuilder.insert(endPos, '\n');
                }, { undoStopBefore: false, undoStopAfter: false });
            }

            if (additions.length > replayLines.length) {
                vscode.window.showInformationMessage(`Ghost Cursor replay complete (first ${replayLines.length} of ${additions.length} added lines).`);
            } else {
                vscode.window.showInformationMessage('Ghost Cursor replay complete.');
            }
        } catch (e) {
            console.error('Ghost Cursor replay failed:', e);
        } finally {
            if (ghostEditor) {
                try { ghostEditor.setDecorations(this.decorationType, []); } catch (e) { }
            }
            this.isReplaying = false;
        }
    }

    dispose() {
        this.decorationType.dispose();
    }
}

module.exports = GhostCursorManager;
