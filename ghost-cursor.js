const vscode = require('vscode');

class GhostCursorManager {
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
     */
    async replay(editor, diff) {
        if (this.isReplaying) return;
        this.isReplaying = true;

        const lines = diff.split('\n');
        const additions = lines.filter(l => l.startsWith('+') && !l.startsWith('+++'));

        vscode.window.showInformationMessage('Initiating Ghost Cursor replay... 👻');

        for (const line of additions) {
            const content = line.substring(1);
            if (!content.trim()) continue;

            const position = editor.selection.active;

            // Replay character by character
            for (let i = 0; i < content.length; i++) {
                const char = content[i];
                await editor.edit(editBuilder => {
                    editBuilder.insert(position, char);
                }, { undoStopBefore: false, undoStopAfter: false });

                // Show ghost cursor decoration
                const nextPos = position.translate(0, i + 1);
                editor.setDecorations(this.decorationType, [new vscode.Range(position, nextPos)]);

                await new Promise(r => setTimeout(r, 20 + Math.random() * 50));
            }

            // New line
            await editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, '\n');
            }, { undoStopBefore: false, undoStopAfter: false });
        }

        editor.setDecorations(this.decorationType, []);
        this.isReplaying = false;
        vscode.window.showInformationMessage('Ghost Cursor replay complete.');
    }
}

module.exports = GhostCursorManager;
