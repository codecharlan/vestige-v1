const vscode = require('vscode');

class FlowPanel {
    constructor(context) {
        this.context = context;
        this.panel = null;
    }

    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.flow',
                '🌊 Code Flow Visualizer',
                vscode.ViewColumn.Two,
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
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Flow Visualizer</title>
    <link rel="stylesheet" href="${cssUri}">
    <style>
        body {
            padding: 30px;
            background-color: var(--vestige-bg);
            overflow: hidden;
        }
        .canvas-container {
            width: 100%;
            height: 500px;
            position: relative;
            border: 1px solid var(--vestige-border);
            border-radius: 12px;
            background: radial-gradient(circle at center, rgba(255,255,255,0.02) 0%, transparent 100%);
            backdrop-filter: var(--vestige-glass-blur);
        }
        .node {
            position: absolute;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #4caf50;
            transition: all 1s ease;
        }
        .controls {
            margin-top: 20px;
            display: flex;
            gap: 10px;
        }
        button {
            padding: 8px 16px;
            background: #007acc;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <h1>🌊 Code Flow Visualizer</h1>
    <p>Visualizing architectural evolution over the last 12 months.</p>
    
    <div class="canvas-container" id="canvas">
        <!-- Nodes will be animated here -->
    </div>

    <div class="controls">
        <button onclick="play()">▶ Play</button>
        <button onclick="pause()">⏸ Pause</button>
        <button onclick="reset()">⏮ Reset</button>
    </div>

    <script>
        const canvas = document.getElementById('canvas');
        const nodes = [];

        // Simulate nodes
        for(let i=0; i<20; i++) {
            const node = document.createElement('div');
            node.className = 'node';
            node.style.left = Math.random() * 90 + '%';
            node.style.top = Math.random() * 90 + '%';
            node.style.background = ['#4caf50', '#2196f3', '#f44336', '#ffc107'][Math.floor(Math.random()*4)];
            canvas.appendChild(node);
            nodes.push(node);
        }

        function play() {
            nodes.forEach(node => {
                node.style.left = Math.random() * 90 + '%';
                node.style.top = Math.random() * 90 + '%';
            });
            setTimeout(play, 2000);
        }
    </script>
</body>
</html>`;
    }
}

module.exports = FlowPanel;
