const vscode = require('vscode');
const path = require('path');

class PulsePanel {
    constructor(context) {
        this.context = context;
        this.panel = null;
    }

    show(repoData) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.pulse',
                'Vestige: SimCity Activity Pulse',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.context.extensionUri]
                }
            );
            this.panel.onDidDispose(() => { this.panel = null; });
        }

        this.panel.webview.html = this.getWebviewContent(repoData);
    }

    getWebviewContent(repoData) {
        const cssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'vestige.css'));
        // Transform repoData into grid items
        const files = repoData.files || [];
        const grid = files.slice(0, 100).map(f => ({
            name: path.basename(f.path),
            height: Math.min(150, (f.size || 500) / 10),
            age: f.age || 0,
            activity: f.activity || 0
        }));

        return `<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="${cssUri}">
    <style>
        body { margin: 0; background: #020617; overflow: hidden; }
        #label { position: absolute; top: 20px; left: 20px; color: #60A5FA; font-size: 1.5em; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
        #stats { position: absolute; bottom: 20px; left: 20px; font-size: 0.9em; }
        canvas { display: block; }
    </style>
</head>
<body>
    <div id="label">🏙️ Architectural Pulse</div>
    <div id="stats">Scale: 1 Building = 1 File | Height = Complexity | Pulse = Recent Churn</div>
    <canvas id="pulseCanvas"></canvas>
    <script>
        const canvas = document.getElementById('pulseCanvas');
        const ctx = canvas.getContext('2d');
        let width, height;

        const grid = ${JSON.stringify(grid)};
        const gridSize = Math.ceil(Math.sqrt(grid.length));
        const tileW = 60;
        const tileH = 30;
        const ghostTrails = []; // Store historical peaks

        function resize() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resize);
        resize();

        function drawTile(x, y, h, color, pulse, isGhost = false) {
            ctx.save();
            ctx.translate(x, y);

            // Phase Zenith: Neon Glow & Sentient Details
            const isHot = pulse > 0.7;
            const glow = Math.sin(Date.now() / 200) * pulse * 10;
            
            if (isGhost) {
                ctx.globalAlpha = 0.2;
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = color;
            }

            // Draw Sides with Premium Gradients
            const gradRight = ctx.createLinearGradient(0, 0, tileW/2, tileH/2);
            gradRight.addColorStop(0, color + '44');
            gradRight.addColorStop(1, color + 'AA');
            ctx.fillStyle = gradRight;
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(0, -h); ctx.lineTo(tileW/2, -h + tileH/2); ctx.lineTo(tileW/2, tileH/2);
            ctx.fill();
            if (isGhost) ctx.stroke();

            const gradLeft = ctx.createLinearGradient(0, 0, -tileW/2, tileH/2);
            gradLeft.addColorStop(0, color + '77');
            gradLeft.addColorStop(1, color + 'CC');
            ctx.fillStyle = gradLeft;
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(0, -h); ctx.lineTo(-tileW/2, -h + tileH/2); ctx.lineTo(-tileW/2, tileH/2);
            ctx.fill();
            if (isGhost) ctx.stroke();

            // Draw Top with Glow
            ctx.fillStyle = color;
            if (isHot && !isGhost) {
                ctx.shadowBlur = 15 + glow;
                ctx.shadowColor = color;
                
                // Add "Heatmap Bloom" ground effect
                const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, tileW);
                bloom.addColorStop(0, color + '44');
                bloom.addColorStop(1, 'transparent');
                ctx.fillStyle = bloom;
                ctx.beginPath();
                ctx.ellipse(0, 0, tileW/2, tileH/2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = color;
            }
            
            ctx.beginPath();
            ctx.moveTo(0, -h);
            ctx.lineTo(tileW/2, -h - tileH/2);
            ctx.lineTo(0, -h - tileH);
            ctx.lineTo(-tileW/2, -h - tileH/2);
            ctx.closePath();
            ctx.fill();

            // Archeological Detail: Window Lights
            if (h > 40 && !isGhost) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                for(let i=10; i < h - 5; i+=10) {
                    ctx.fillRect(tileW/6, -i, 2, 2);
                    ctx.fillRect(-tileW/6, -i, 2, 2);
                }
            }

            ctx.restore();
        }

        function render() {
            ctx.clearRect(0, 0, width, height);
            
            // Background Atmosphere (Stars)
            ctx.fillStyle = '#1e293b';
            for(let i=0; i<100; i++) {
                const x = (Math.sin(i) * 0.5 + 0.5) * width;
                const y = (Math.cos(i) * 0.5 + 0.5) * height;
                ctx.globalAlpha = Math.random() * 0.5;
                ctx.fillRect(x, y, 1, 1);
            }
            ctx.globalAlpha = 1.0;

            const startX = width / 2;
            const startY = height / 2 - (gridSize * tileH / 2);

            grid.forEach((item, i) => {
                const row = Math.floor(i / gridSize);
                const col = i % gridSize;

                const x = startX + (col - row) * (tileW / 2);
                const y = startY + (col + row) * (tileH / 2);

                const color = item.age > 730 ? '#475569' : (item.activity > 0.7 ? '#F472B6' : '#60A5FA');
                
                // Render Ghost Trails for High Hotspots
                if (item.activity > 0.9) {
                    if (!ghostTrails[i] || ghostTrails[i].h < item.height) {
                        ghostTrails[i] = { h: item.height, color, opacity: 0.5 };
                    }
                }
                
                if (ghostTrails[i]) {
                    drawTile(x, y, ghostTrails[i].h, ghostTrails[i].color, 0, true);
                    ghostTrails[i].opacity -= 0.001;
                    if (ghostTrails[i].opacity <= 0) delete ghostTrails[i];
                }

                drawTile(x, y, item.height, color, item.activity);
            });

            requestAnimationFrame(render);
        }
        render();
    </script>
</body>
</html>`;
    }
}

module.exports = PulsePanel;
