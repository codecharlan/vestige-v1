export {};
const vscode = require('vscode');
const path = require('path');

class Decorators { [key: string]: any;
    constructor(context) {
        this.context = context;
        this.decorationTypes = {
            highChurn: vscode.window.createTextEditorDecorationType({
                gutterIconPath: vscode.Uri.file(this.getIconPath('fire.svg')),
                gutterIconSize: 'contain',
                overviewRulerColor: '#FF4D4D',
                overviewRulerLane: vscode.OverviewRulerLane.Right
            }),
            fossil: vscode.window.createTextEditorDecorationType({
                gutterIconPath: vscode.Uri.file(this.getIconPath('fossil.svg')),
                gutterIconSize: 'contain',
                overviewRulerColor: '#94A3B8',
                overviewRulerLane: vscode.OverviewRulerLane.Right
            }),
            recent: vscode.window.createTextEditorDecorationType({
                gutterIconPath: vscode.Uri.file(this.getIconPath('sparkle.svg')),
                gutterIconSize: 'contain',
                overviewRulerColor: '#60A5FA',
                overviewRulerLane: vscode.OverviewRulerLane.Right
            }),
            lore: vscode.window.createTextEditorDecorationType({
                gutterIconPath: vscode.Uri.file(this.getIconPath('scroll.svg')),
                gutterIconSize: 'contain',
                overviewRulerColor: '#FBBF24',
                overviewRulerLane: vscode.OverviewRulerLane.Left
            }),
            zombie: vscode.window.createTextEditorDecorationType({
                opacity: '0.4',
                fontStyle: 'italic',
                after: {
                    contentText: ' 🧟 Stagnant',
                    color: '#94A3B8',
                    margin: '0 0 0 1em'
                }
            }),
            implicitLore: vscode.window.createTextEditorDecorationType({
                gutterIconPath: vscode.Uri.file(this.getIconPath('ghost.svg')),
                gutterIconSize: 'contain',
                overviewRulerColor: '#60A5FA',
                overviewRulerLane: vscode.OverviewRulerLane.Left
            }),
            tribalGap: vscode.window.createTextEditorDecorationType({
                gutterIconPath: vscode.Uri.file(this.getIconPath('ghost.svg')),
                gutterIconSize: 'contain',
                overviewRulerColor: '#7E57C2',
                overviewRulerLane: vscode.OverviewRulerLane.Right,
                dark: { backgroundColor: 'rgba(126, 87, 194, 0.05)' }
            })
        };
    }

    getIconPath(iconName) {
        return path.join(this.context.extensionPath, 'images', iconName);
    }

    applyDecorations(editor, analysis, decisions = []) {
        if (!editor || !analysis) return;

        const config = vscode.workspace.getConfiguration('vestige');
        const fossilThreshold = config.get('fossilThreshold');

        const fossilRanges = [];
        const recentRanges = [];
        const loreRanges = [];
        const zombieRanges = [];
        const heatRanges = [];
        const implicitLoreRanges = [];

        const now = new Date();
        const oneDay = 24 * 60 * 60 * 1000;

        // 1. Lore & Heat (Line 0)
        if (decisions.length > 0 || analysis.ownershipHeat) {
            let hoverContent = '';
            if (decisions.length > 0) {
                hoverContent += `**Lore Decisions**\n\n` + decisions.map(d => `📜 **${d.title}**`).join('\n') + `\n\n[View Details](command:vestige.showLore)\n\n---\n\n`;
            }
            if (analysis.ownershipHeat) {
                const heat = analysis.ownershipHeat;
                if (heat.isHotPotato) hoverContent += `🔥 **Hot Potato Alert**: High author churn, low ownership density.\n\n`;
                if (heat.isBusRisk) hoverContent += `🚌 **Bus Factor Risk**: Single owner has ${heat.topOwnerPercent}% control.\n\n`;
            }

            const hoverMessage = new vscode.MarkdownString(hoverContent);
            hoverMessage.isTrusted = true;

            heatRanges.push({
                range: new vscode.Range(0, 0, 0, 0),
                hoverMessage
            });
        }

        // 2. Line Annotations
        analysis.lines.forEach(line => {
            if (!line.date) return;

            const lineDate = new Date(line.date);
            const ageDays = Math.round(Math.abs((now.getTime() - lineDate.getTime()) / oneDay));
            const range = new vscode.Range(line.lineNo - 1, 0, line.lineNo - 1, 0);

            const hoverMessage = new vscode.MarkdownString(
                `**Vestige Info**\n\n` +
                `- **Author**: ${line.author}\n` +
                `- **Date**: ${lineDate.toLocaleDateString()}\n` +
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

        // 3. Ghost Shadows (Recent Deletions)
        if (analysis.deletedChunks) {
            const lastLine = Math.max(0, editor.document.lineCount - 1);
            analysis.deletedChunks.forEach(chunk => {
                // chunk.content is already a joined string; chunk.line can exceed
                // the current document length (the deletion shrank the file)
                const lineNo = Math.min(Math.max(0, (chunk.line || 1) - 1), lastLine);
                const range = new vscode.Range(lineNo, 0, lineNo, 0);
                const shadowText = Array.isArray(chunk.content) ? chunk.content.join('\n') : String(chunk.content || '');
                const hoverMessage = new vscode.MarkdownString(
                    `👻 **Ghost Shadow** (Deleted code)\n\n\`\`\`\n${shadowText}\n\`\`\`\n\n---\n*Removed by ${chunk.author} in ${(chunk.hash || '').substring(0, 7)}*`
                );
                fossilRanges.push({ range, hoverMessage }); // Add to fossil for icon
            });
        }

        // 4. Zombie Methods
        if (analysis.zombieMethods) {
            analysis.zombieMethods.forEach(zombie => {
                const range = new vscode.Range(zombie.range.start.line, 0, zombie.range.end.line, 0);
                zombieRanges.push({
                    range,
                    hoverMessage: `🧟 **Zombie Method**: '${zombie.name}' hasn't been touched in ${zombie.ageDays} days while the file evolves.`
                });
            });
        }

        // 5. Implicit Lore (Ghost Lore)
        if (analysis.implicitLore) {
            analysis.implicitLore.forEach(lore => {
                const line = analysis.lines.find(l => l.hash === lore.hash);
                if (line) {
                    const range = new vscode.Range(line.lineNo - 1, 0, line.lineNo - 1, 0);
                    const hoverMessage = new vscode.MarkdownString(
                        `👻 **Implicit Lore Discovery** (${lore.type})\n\n` +
                        `*"${lore.content}"*\n\n---\n` +
                        `*Found in commit ${lore.hash.substring(0, 7)} by ${lore.author}*\n\n` +
                        `[Promote to Permanent Decision](command:vestige.promoteLore?${encodeURIComponent(JSON.stringify([lore.type, lore.content, lore.hash, analysis.repoPath, path.basename(editor.document.uri.fsPath)]))})`
                    );
                    hoverMessage.isTrusted = true;
                    implicitLoreRanges.push({ range, hoverMessage });
                }
            });
        }

        // 7. Elite-C: Echoed Reviews
        if (analysis.echoedReviews) {
            analysis.echoedReviews.forEach(review => {
                const line = analysis.lines.find(l => l.hash === review.hash);
                if (line) {
                    const range = new vscode.Range(line.lineNo - 1, 0, line.lineNo - 1, 0);
                    const hoverMessage = new vscode.MarkdownString(
                        `💬 **Echoed Review**\n\n` +
                        `*"${review.content}"*\n\n---\n` +
                        `*Historical commentary from ${review.author} (${review.hash.substring(0, 7)})*`
                    );
                    implicitLoreRanges.push({ range, hoverMessage });
                }
            });
        }

        // 6. Elite-B: Fossil Zones & Knowledge Gaps
        const fossilZoneRanges = [];
        const knowledgeGapRanges = [];

        if (analysis.fossilZones) {
            analysis.fossilZones.forEach(zone => {
                const range = new vscode.Range(zone.start - 1, 0, zone.end - 1, 0);
                fossilZoneRanges.push({
                    range,
                    hoverMessage: new vscode.MarkdownString(`🗿 **Fossil Restoration Alert**\n\nThis block hasn't been touched in >500 days. Original author: **${zone.author}**.\n\n*Review context before modifying ancient logic.*`)
                });
            });
        }

        if (analysis.knowledgeGaps) {
            analysis.knowledgeGaps.forEach(gap => {
                const range = new vscode.Range(gap.start - 1, 0, gap.end - 1, 0);
                knowledgeGapRanges.push({
                    range,
                    hoverMessage: new vscode.MarkdownString(`⚠️ **Tribal Knowledge Gap**\n\nThe original author (**${gap.author}**) is no longer active in this file. Knowledge density is low.`)
                });
            });
        }

        editor.setDecorations(this.decorationTypes.fossil, fossilRanges.concat(fossilZoneRanges));
        editor.setDecorations(this.decorationTypes.recent, recentRanges);
        editor.setDecorations(this.decorationTypes.lore, loreRanges.concat(heatRanges));
        editor.setDecorations(this.decorationTypes.zombie, zombieRanges);
        editor.setDecorations(this.decorationTypes.implicitLore, implicitLoreRanges);
        editor.setDecorations(this.decorationTypes.tribalGap, knowledgeGapRanges);
    }

    clearDecorations() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            Object.values(this.decorationTypes).forEach(d => editor.setDecorations(d, []));
        }
    }

    dispose() {
        Object.values(this.decorationTypes).forEach((d: any) => d.dispose());
    }
}

module.exports = Decorators;
