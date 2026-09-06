export {};
const vscode = require('vscode');

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

class SkillTreePanel { [key: string]: any;
    constructor(context, achievements) {
        this.context = context;
        this.achievements = achievements;
        this.panel = null;
    }

    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.skillTree',
                'Vestige: Archaeology Skill Tree',
                vscode.ViewColumn.One,
                {
                    // Static page — no scripts. localResourceRoots only so the
                    // shared stylesheet can be resolved via asWebviewUri.
                    localResourceRoots: [this.context.extensionUri]
                }
            );
            this.panel.onDidDispose(() => { this.panel = null; });
        }

        this.panel.webview.html = this.getHtml();
    }

    getHtml() {
        const cssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'vestige.css'));
        const cspSource = this.panel.webview.cspSource;
        const progress = this.achievements.getProgress() || [];
        const credits = this.achievements.getCredits();

        const features = [
            { id: 'timeMachine', name: 'Time Machine', hint: 'Unlock the Time Traveler achievement' },
            { id: 'wormhole', name: 'Wormhole', hint: 'Earn 500 XP' },
            { id: 'ghostCursor', name: 'Ghost Cursor', hint: 'Unlock 3 achievements' },
            { id: 'aiArchaeologist', name: 'AI Archaeologist', hint: 'Earn 1000 XP' }
        ];

        const unlockedCount = progress.filter(item => item.unlocked).length;

        const achievementCards = progress.length === 0
            ? `<div class="v-empty">
                <p class="v-empty-title">No achievements are tracked yet</p>
                <p class="v-empty-text">Achievements appear here once Vestige has analyzed a file. Run <span class="v-mono">Vestige: Analyze Current File</span> to start earning XP.</p>
            </div>`
            : `<div class="v-grid v-grid--wide">
${progress.map(item => {
                const total = Number(item.total) || 0;
                const done = Number(item.progress) || 0;
                const pct = item.unlocked ? 100 : total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
                return `                <div class="v-card">
                    <div class="v-row v-row--between">
                        <span class="v-strong v-truncate">${escapeHtml(item.name)}</span>
                        <span class="v-badge ${item.unlocked ? 'v-badge--good' : ''}">${item.unlocked ? 'Unlocked' : `${done}/${total}`}</span>
                    </div>
                    <p class="v-caption" style="margin: var(--v-space-2) 0 var(--v-space-3)">${escapeHtml(item.description)}</p>
                    <div class="v-meter"><span class="v-meter-fill ${item.unlocked ? 'v-meter-fill--good' : ''}" style="width: ${pct}%"></span></div>
                </div>`;
            }).join('\n')}
            </div>`;

        const featureCards = features.map(feature => {
            const unlocked = this.achievements.isFeatureUnlocked(feature.id);
            return `                <div class="v-card">
                    <div class="v-row v-row--between">
                        <span class="v-strong v-truncate">${escapeHtml(feature.name)}</span>
                        <span class="v-badge ${unlocked ? 'v-badge--good' : ''}">${unlocked ? 'Unlocked' : 'Locked'}</span>
                    </div>
                    <p class="v-caption" style="margin: var(--v-space-2) 0 0">${unlocked ? 'Available now.' : escapeHtml(feature.hint)}</p>
                </div>`;
        }).join('\n');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Archaeology Skill Tree</title>
    <link rel="stylesheet" href="${cssUri}">
</head>
<body>
    <main class="v-page">
        <header class="v-header">
            <h1 class="v-title">Archaeology Skill Tree</h1>
            <p class="v-subtitle">XP accumulates as you explore your repository's history. Achievements unlock the advanced Vestige features listed below.</p>
        </header>

        <section class="v-section">
            <div class="v-grid">
                <div class="v-metric">
                    <span class="v-metric-value">${escapeHtml(credits)}</span>
                    <span class="v-metric-label">XP earned</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value">${unlockedCount}<span class="v-muted" style="font-size: var(--v-fs-body); font-weight: 400">/${progress.length}</span></span>
                    <span class="v-metric-label">Achievements unlocked</span>
                </div>
            </div>
        </section>

        <section class="v-section">
            <h2 class="v-section-title">Achievements</h2>
            ${achievementCards}
        </section>

        <section class="v-section">
            <h2 class="v-section-title">Feature unlocks</h2>
            <div class="v-grid v-grid--wide">
${featureCards}
            </div>
        </section>
    </main>
</body>
</html>`;
    }
}

module.exports = SkillTreePanel;
