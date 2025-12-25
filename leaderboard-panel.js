const vscode = require('vscode');

class LeaderboardPanel {
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
                'vestige.leaderboard',
                '🏆 Vestige Leaderboard',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.context.extensionUri]
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = null;
            });
        }

        this.panel.webview.html = this.getWebviewContent();
    }

    getWebviewContent() {
        const cssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'vestige.css'));
        // Mock data for now, real implementation would sync with team server
        const teamData = [
            { name: 'Sarah', score: 1250, badges: 5, commits: 142, knowledge: { core: 70, ui: 10, api: 20 } },
            { name: 'Mike', score: 980, badges: 3, commits: 88, knowledge: { core: 20, ui: 60, api: 20 } },
            { name: 'You', score: 450, badges: 2, commits: 45, isYou: true, knowledge: { core: 10, ui: 10, api: 80 } },
            { name: 'Alex', score: 320, badges: 1, commits: 12, knowledge: { core: 5, ui: 80, api: 15 } }
        ];

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Team Leaderboard</title>
    <link rel="stylesheet" href="${cssUri}">
    <style>
        body { padding: 30px; }
        .leaderboard-item {
            display: flex;
            flex-direction: column;
            padding: 15px;
            margin: 10px 0;
            background: var(--vestige-glass);
            border: 1px solid var(--vestige-border);
            border-radius: 12px;
        }
        .main-row { display: flex; align-items: center; width: 100%; }
        .knowledge-row { 
            margin-top: 10px; 
            height: 4px; 
            background: rgba(255,255,255,0.05); 
            border-radius: 2px;
            display: flex;
            overflow: hidden;
        }
        .knowledge-segment { height: 100%; }
        .risk-card {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #ef4444;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 0.9em;
        }
        .rank { font-size: 1.2em; width: 30px; font-weight: bold; }
    </style>
</head>
<body>
    <h1>🏆 Team Leaderboard</h1>
    
    <div class="risk-card">
        <strong>⚠️ Bus Factor Alert</strong><br/>
        3 critical files have a Bus Factor of 1 (Sarah is the sole owner).
    </div>

    <div class="leaderboard">
        ${teamData.map((user, index) => `
            <div class="leaderboard-item">
                <div class="main-row">
                    <div class="rank">#${index + 1}</div>
                    <div class="avatar" style="background: ${index === 0 ? 'var(--vestige-gold)' : 'var(--vestige-surface)'}">${user.name[0]}</div>
                    <div class="info">
                        <div class="name">${user.name} ${user.isYou ? '(You)' : ''}</div>
                        <div class="stats">${user.badges} Badges | ${user.commits} Commits</div>
                    </div>
                    <div class="score">${user.score} XP</div>
                </div>
                <div class="knowledge-row" title="Knowledge Heatmap: Core, UI, API">
                    <div class="knowledge-segment" style="width: ${user.knowledge.core}%; background: #60A5FA;"></div>
                    <div class="knowledge-segment" style="width: ${user.knowledge.ui}%; background: #F472B6;"></div>
                    <div class="knowledge-segment" style="width: ${user.knowledge.api}%; background: #34D399;"></div>
                </div>
            </div>
        `).join('')}
    </div>
</body>
</html>`;
    }
}

module.exports = LeaderboardPanel;
