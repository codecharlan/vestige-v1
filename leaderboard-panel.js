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
                    retainContextWhenHidden: true
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = null;
            });
        }

        this.panel.webview.html = this.getWebviewContent();
    }

    getWebviewContent() {
        // Mock data for now, real implementation would sync with team server
        const teamData = [
            { name: 'Sarah', score: 1250, badges: 5 },
            { name: 'Mike', score: 980, badges: 3 },
            { name: 'You', score: 450, badges: 2 },
            { name: 'Alex', score: 320, badges: 1 }
        ];

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Team Leaderboard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }
        .leaderboard-item {
            display: flex;
            align-items: center;
            padding: 15px;
            margin: 10px 0;
            background: var(--vscode-textBlockQuote-background);
            border-radius: 8px;
        }
        .rank {
            font-size: 1.5em;
            width: 40px;
            font-weight: bold;
        }
        .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: var(--vscode-button-background);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 15px;
            font-size: 1.2em;
        }
        .info {
            flex: 1;
        }
        .name {
            font-weight: bold;
            font-size: 1.1em;
        }
        .stats {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }
        .score {
            font-size: 1.2em;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
    </style>
</head>
<body>
    <h1>🏆 Team Leaderboard</h1>
    
    <div class="leaderboard">
        ${teamData.map((user, index) => `
            <div class="leaderboard-item">
                <div class="rank">#${index + 1}</div>
                <div class="avatar">${user.name[0]}</div>
                <div class="info">
                    <div class="name">${user.name} ${index === 2 ? '(You)' : ''}</div>
                    <div class="stats">${user.badges} Badges Unlocked</div>
                </div>
                <div class="score">${user.score} XP</div>
            </div>
        `).join('')}
    </div>
</body>
</html>`;
    }
}

module.exports = LeaderboardPanel;
