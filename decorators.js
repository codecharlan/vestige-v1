const vscode = require('vscode');
const path = require('path');

class Decorators {
    constructor(context) {
        this.context = context;
        this.decorationTypes = {
            highChurn: vscode.window.createTextEditorDecorationType({
                gutterIconPath: vscode.Uri.file(this.getIconPath('fire.svg')),
                gutterIconSize: 'contain',
                overviewRulerColor: 'red',
                overviewRulerLane: vscode.OverviewRulerLane.Right
            }),
            fossil: vscode.window.createTextEditorDecorationType({
                gutterIconPath: vscode.Uri.file(this.getIconPath('fossil.svg')),
                gutterIconSize: 'contain',
                overviewRulerColor: 'grey',
                overviewRulerLane: vscode.OverviewRulerLane.Right
            }),
            recent: vscode.window.createTextEditorDecorationType({
                gutterIconPath: vscode.Uri.file(this.getIconPath('sparkle.svg')),
                gutterIconSize: 'contain',
                overviewRulerColor: 'green',
                overviewRulerLane: vscode.OverviewRulerLane.Right
            }),
            lore: vscode.window.createTextEditorDecorationType({
                gutterIconPath: vscode.Uri.file(this.getIconPath('scroll.svg')),
                gutterIconSize: 'contain',
                overviewRulerColor: 'yellow',
                overviewRulerLane: vscode.OverviewRulerLane.Left
            })
        };
    }

    getIconPath(iconName) {
        return path.join(this.context.extensionPath, 'images', iconName);
    }

    applyDecorations(editor, analysis, decisions = []) {
        const config = vscode.workspace.getConfiguration('vestige');
        const fossilThreshold = config.get('fossilThreshold');

        const fossilRanges = [];
        const recentRanges = [];
        const loreRanges = [];

        const now = new Date();
        const oneDay = 24 * 60 * 60 * 1000;

        // Apply Lore decorations to the first line if decisions exist
        if (decisions.length > 0) {
            const decisionText = decisions.map(d => `📜 **${d.title}**`).join('\n');
            const hoverMessage = new vscode.MarkdownString(
                `**Lore Decisions**\n\n${decisionText}\n\n[View Details](command:vestige.showLore)`
            );
            hoverMessage.isTrusted = true;

            loreRanges.push({
                range: new vscode.Range(0, 0, 0, 0),
                hoverMessage
            });
        }

        analysis.lines.forEach(line => {
            if (!line.date) return;

            const ageDays = Math.round(Math.abs((now - line.date) / oneDay));
            const range = new vscode.Range(line.lineNo - 1, 0, line.lineNo - 1, 1000);

            const hoverMessage = new vscode.MarkdownString(
                `**Vestige Info**\n\n` +
                `- **Author**: ${line.author}\n` +
                `- **Date**: ${line.date.toLocaleDateString()}\n` +
                `- **Commit**: ${line.hash.substring(0, 7)}\n` +
                `- **Age**: ${ageDays} days old`
            );

            const decoration = { range, hoverMessage };

            if (ageDays > fossilThreshold) {
                fossilRanges.push(decoration);
            } else if (ageDays < 7) {
                recentRanges.push(decoration);
            }
        });

        editor.setDecorations(this.decorationTypes.fossil, fossilRanges);
        editor.setDecorations(this.decorationTypes.recent, recentRanges);
        editor.setDecorations(this.decorationTypes.lore, loreRanges);
    }

    clearDecorations() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            Object.values(this.decorationTypes).forEach(d => editor.setDecorations(d, []));
        }
    }

    dispose() {
        Object.values(this.decorationTypes).forEach(d => d.dispose());
    }
}

module.exports = Decorators;
