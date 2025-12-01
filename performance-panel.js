const vscode = require('vscode');

class PerformancePanel {
    constructor(context) {
        this.context = context;
        this.panel = null;
    }

    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.performance',
                '⚡ Performance Timeline',
                vscode.ViewColumn.Two,
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
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Timeline</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
        }
        .chart-container {
            height: 300px;
            margin: 20px 0;
            background: var(--vscode-editor-inactiveSelectionBackground);
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
        }
    </style>
</head>
<body>
    <h1>⚡ Performance Timeline</h1>
    <p>Tracking build times and bundle sizes over the last 30 days.</p>
    
    <div class="chart-container">
        [Chart Placeholder - Would use Chart.js in production]
    </div>

    <h3>🚨 Regressions Detected</h3>
    <ul>
        <li>⚠️ <strong>Bundle Size</strong> increased by 15% in commit <code>a1b2c3d</code></li>
        <li>⚠️ <strong>Build Time</strong> spiked to 45s on Oct 12</li>
    </ul>
</body>
</html>`;
    }
}

module.exports = PerformancePanel;
