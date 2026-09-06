export {};
const vscode = require('vscode');
const path = require('path');

class PulsePanel { [key: string]: any;
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
                'Vestige: Architectural Pulse',
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
        const cspSource = this.panel.webview.cspSource;

        // Transform repoData into grid items
        const files = (repoData && repoData.files) || [];
        const grid = files.slice(0, 100).map(f => ({
            name: path.basename(f.path),
            height: Math.min(150, (f.size || 500) / 10),
            age: f.age || 0,
            activity: f.activity || 0
        }));

        const hotCount = grid.filter(g => g.activity > 0.7).length;
        const fossilCount = grid.filter(g => g.age > 730).length;

        const body = grid.length === 0 ? `
        <div class="v-empty">
            <p class="v-empty-title">No files to plot</p>
            <p class="v-empty-text">The pulse view builds one block per analyzed file, and this workspace returned none. Open a git repository with committed source files and run <span class="v-mono">Vestige: Show Architectural Pulse</span> again.</p>
        </div>` : `
        <section class="v-section">
            <div class="v-grid">
                <div class="v-metric">
                    <span class="v-metric-value">${grid.length}</span>
                    <span class="v-metric-label">Files plotted</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value ${hotCount > 0 ? 'v-metric-value--warn' : ''}">${hotCount}</span>
                    <span class="v-metric-label">Recently churning</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value">${fossilCount}</span>
                    <span class="v-metric-label">Untouched 2y+</span>
                </div>
            </div>
        </section>

        <section class="v-section">
            <h2 class="v-section-title">City map</h2>
            <div class="v-card">
                <div class="pulse-stage">
                    <canvas id="pulseCanvas" role="img" aria-label="Isometric map of repository files: block height is file size, colour is recent churn"></canvas>
                </div>
                <div class="v-row v-row--between" style="margin-top: var(--v-space-3); flex-wrap: wrap">
                    <div class="v-toolbar">
                        <span class="v-badge v-badge--accent">Active</span>
                        <span class="v-badge v-badge--warn">Churning</span>
                        <span class="v-badge">Fossil (2y+)</span>
                    </div>
                    <span class="v-caption v-mono" id="hoverFile" aria-live="polite">Hover a block to see its file name</span>
                </div>
                <p class="v-caption" style="margin: var(--v-space-3) 0 0">One block per file. Height tracks file size; colour tracks how recently the file changed.</p>
            </div>
        </section>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'unsafe-inline'; font-src ${cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Architectural Pulse</title>
    <link rel="stylesheet" href="${cssUri}">
    <style>
        .pulse-stage {
            position: relative;
            height: 420px;
            border: 1px solid var(--v-border);
            border-radius: var(--v-radius-sm);
            background: var(--v-surface-sunken);
            overflow: hidden;
        }
        .pulse-stage canvas {
            display: block;
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>
    <main class="v-page">
        <header class="v-header">
            <h1 class="v-title">Architectural Pulse</h1>
            <p class="v-subtitle">An isometric map of this repository: one block per file, sized by file length and coloured by how recently it changed.</p>
        </header>
        ${body}
    </main>

    <script>
        const canvas = document.getElementById('pulseCanvas');
        const grid = ${JSON.stringify(grid).replace(/</g, '\\u003c')};

        if (canvas && grid.length > 0) {
            const ctx = canvas.getContext('2d');
            const hoverFile = document.getElementById('hoverFile');
            const gridSize = Math.ceil(Math.sqrt(grid.length));
            const tileW = 46;
            const tileH = 23;
            let width = 0;
            let height = 0;

            // Resolve the current theme's colours once, so the canvas repaints
            // in whatever theme the user is running rather than a fixed palette.
            function themeColor(token, fallback) {
                const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
                return value || fallback;
            }
            let palette = readPalette();

            function readPalette() {
                return {
                    active: themeColor('--v-info', 'steelblue'),
                    hot: themeColor('--v-warn', 'orange'),
                    fossil: themeColor('--v-text-muted', 'gray')
                };
            }

            function resize() {
                const rect = canvas.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                width = rect.width;
                height = rect.height;
                canvas.width = Math.max(1, Math.round(width * dpr));
                canvas.height = Math.max(1, Math.round(height * dpr));
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                palette = readPalette();
                render();
            }

            const tilePositions = [];

            canvas.addEventListener('mousemove', (e) => {
                const rect = canvas.getBoundingClientRect();
                const px = e.clientX - rect.left;
                const py = e.clientY - rect.top;
                let found = null;
                for (const t of tilePositions) {
                    if (Math.abs(px - t.x) < tileW / 2 && py < t.y && py > t.y - t.h - tileH) {
                        found = t;
                    }
                }
                if (hoverFile) {
                    hoverFile.textContent = found ? found.name : 'Hover a block to see its file name';
                }
            });

            canvas.addEventListener('mouseleave', () => {
                if (hoverFile) hoverFile.textContent = 'Hover a block to see its file name';
            });

            function drawTile(x, y, h, color) {
                ctx.save();
                ctx.translate(x, y);
                ctx.fillStyle = color;

                // Right face
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, -h);
                ctx.lineTo(tileW / 2, -h + tileH / 2);
                ctx.lineTo(tileW / 2, tileH / 2);
                ctx.closePath();
                ctx.fill();

                // Left face
                ctx.globalAlpha = 0.75;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, -h);
                ctx.lineTo(-tileW / 2, -h + tileH / 2);
                ctx.lineTo(-tileW / 2, tileH / 2);
                ctx.closePath();
                ctx.fill();

                // Top face
                ctx.globalAlpha = 1;
                ctx.beginPath();
                ctx.moveTo(0, -h);
                ctx.lineTo(tileW / 2, -h - tileH / 2);
                ctx.lineTo(0, -h - tileH);
                ctx.lineTo(-tileW / 2, -h - tileH / 2);
                ctx.closePath();
                ctx.fill();

                ctx.restore();
            }

            function render() {
                ctx.clearRect(0, 0, width, height);

                const startX = width / 2;
                const startY = height / 2 - (gridSize * tileH / 2) + 40;

                tilePositions.length = 0;
                grid.forEach((item, i) => {
                    const row = Math.floor(i / gridSize);
                    const col = i % gridSize;

                    const x = startX + (col - row) * (tileW / 2);
                    const y = startY + (col + row) * (tileH / 2);
                    tilePositions.push({ x: x, y: y, h: item.height, name: item.name });

                    const color = item.age > 730
                        ? palette.fossil
                        : (item.activity > 0.7 ? palette.hot : palette.active);

                    drawTile(x, y, item.height, color);
                });
            }

            window.addEventListener('resize', resize);
            resize();
        }
    </script>
</body>
</html>`;
    }

    dispose() {
        if (this.panel) this.panel.dispose();
    }
}

module.exports = PulsePanel;
