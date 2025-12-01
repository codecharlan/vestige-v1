const vscode = require('vscode');

class DashboardPanel {
    constructor(context, repoAnalyzer) {
        this.context = context;
        this.repoAnalyzer = repoAnalyzer;
        this.panel = null;
    }

    async show(repoPath, metrics) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.dashboard',
                '📊 Vestige Team Dashboard',
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

        this.panel.webview.html = this.getWebviewContent(metrics);
    }

    getWebviewContent(metrics) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vestige Dashboard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        h1 {
            font-size: 1.8em;
            margin-bottom: 10px;
        }
        .health-score {
            font-size: 4em;
            text-align: center;
            margin: 30px 0;
            font-weight: bold;
        }
        .health-score.excellent { color: #90be6d; }
        .health-score.good { color: #f9c74f; }
        .health-score.poor { color: #f48771; }
        .metric-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        .metric-card {
            background: var(--vscode-textBlockQuote-background);
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid var(--vscode-textBlockQuote-border);
        }
        .metric-title {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 10px;
        }
        .metric-value {
            font-size: 2em;
            font-weight: bold;
        }
        .chart {
            margin: 30px 0;
            padding: 20px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
        }
        .bar {
            display: flex;
            align-items: center;
            margin: 10px 0;
        }
        .bar-label {
            width: 150px;
            font-size: 0.9em;
        }
        .bar-value {
            flex: 1;
            height: 30px;
            background: var(--vscode-button-background);
            border-radius: 4px;
            position: relative;
        }
        .bar-text {
            position: absolute;
            right: 10px;
            line-height: 30px;
            color: var(--vscode-button-foreground);
            font-weight: bold;
        }
    </style>
</head>
<body>
    <h1>📊 Vestige Team Dashboard</h1>
    
    <div class="health-score ${metrics.health.score >= 8 ? 'excellent' : metrics.health.score >= 5 ? 'good' : 'poor'}">
        ${metrics.health.score}/10
        <div style="font-size: 0.3em; color: var(--vscode-descriptionForeground);">Repository Health</div>
    </div>

    <div class="metric-grid">
        <div class="metric-card">
            <div class="metric-title">Average Bus Factor</div>
            <div class="metric-value">${metrics.health.metrics.avgBusFactor || 'N/A'}</div>
        </div>
        <div class="metric-card">
            <div class="metric-title">Fossil Code</div>
            <div class="metric-value">${metrics.health.metrics.fossilPercent || 0}%</div>
        </div>
        <div class="metric-card">
            <div class="metric-title">High Churn Files</div>
            <div class="metric-value">${metrics.health.metrics.churnPercent || 0}%</div>
        </div>
        <div class="metric-card">
            <div class="metric-title">Files Analyzed</div>
            <div class="metric-value">${metrics.health.metrics.filesAnalyzed || 0}</div>
        </div>
    </div>

    <div class="chart">
        <h2>📈 Health Breakdown</h2>
        <div class="bar">
            <div class="bar-label">Code Freshness</div>
            <div class="bar-value" style="width: ${100 - (metrics.health.metrics.fossilPercent || 0)}%">
                <span class="bar-text">${100 - (metrics.health.metrics.fossilPercent || 0)}%</span>
            </div>
        </div>
        <div class="bar">
            <div class="bar-label">Team Distribution</div>
            <div class="bar-value" style="width: ${Math.min(100, (metrics.health.metrics.avgBusFactor || 0) * 25)}%">
                <span class="bar-text">${metrics.health.metrics.avgBusFactor || 0}</span>
            </div>
        </div>
        <div class="bar">
            <div class="bar-label">Stability</div>
            <div class="bar-value" style="width: ${100 - (metrics.health.metrics.churnPercent || 0)}%">
                <span class="bar-text">${100 - (metrics.health.metrics.churnPercent || 0)}%</span>
            </div>
        </div>
    </div>

    <div style="margin-top: 40px; padding: 20px; background: var(--vscode-textBlockQuote-background); border-radius: 8px;">
        <h3>💡 Recommendations</h3>
        ${metrics.health.score < 5 ?
                '<p>⚠️ Your repository health is below average. Consider addressing high-churn files and improving code distribution across team members.</p>' :
                metrics.health.score < 8 ?
                    '<p>✅ Your repository is in good shape. Continue monitoring bus factor and reducing technical debt.</p>' :
                    '<p>🎉 Excellent repository health! Keep up the great practices.</p>'
            }
    </div>
</body>
</html>`;
    }

    dispose() {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}

module.exports = DashboardPanel;
