export {};
const vscode = require('vscode');
const path = require('path');

class GravityWellPanel { [key: string]: any;
    constructor(context) {
        this.context = context;
        this.panel = null;
    }

    show(analysis) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.gravityWell',
                'Vestige: Gravity Well',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.context.extensionUri]
                }
            );
            this.panel.onDidDispose(() => { this.panel = null; });
        }

        this.panel.webview.html = this.getWebviewContent(analysis);
    }

    getWebviewContent(analysis) {
        // Real file coupling. This previously read `knowledgeNeighbors`, which
        // holds author names, and rendered them in a table headed "File".
        const coupled = (analysis && analysis.coupledFiles) || [];
        const data = coupled.map(n => ({
            name: n.file,
            strength: n.frequency,
            coChanges: n.count,
            // Closer orbit = changes together more often.
            distance: Math.max(14, 100 - (Number(n.frequency) || 0))
        }));

        const cssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'vestige.css'));
        const cspSource = this.panel.webview.cspSource;
        const esc = (v) => String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const fileLabel = analysis && analysis.filePath ? path.basename(analysis.filePath) : 'Current file';

        const strongest = data.reduce((best, d) => ((Number(d.strength) || 0) > (Number(best.strength) || 0) ? d : best), { name: '—', strength: 0 });

        const couplingRows = data
            .slice()
            .sort((a, b) => (Number(b.strength) || 0) - (Number(a.strength) || 0))
            .map(d => `                            <tr>
                                <td class="v-mono">${esc(d.name)}</td>
                                <td class="v-num">${esc(d.strength)}%</td>
                                <td class="v-num">${esc(d.coChanges)}</td>
                            </tr>`).join('\n');

        const body = data.length === 0 ? `
        <div class="v-empty">
            <p class="v-empty-title">No coupled files found</p>
            <p class="v-empty-text">The gravity well plots files that keep getting committed alongside this one. Vestige found no such neighbours yet — this usually means the file is new or has only ever been committed on its own.</p>
        </div>` : `
        <section class="v-section">
            <div class="v-grid">
                <div class="v-metric">
                    <span class="v-metric-value">${data.length}</span>
                    <span class="v-metric-label">Coupled files</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value">${esc(strongest.strength)}%</span>
                    <span class="v-metric-label">Strongest co-change</span>
                </div>
            </div>
        </section>

        <section class="v-section">
            <h2 class="v-section-title">Orbit view</h2>
            <div class="v-card">
                <div class="well-stage" id="stage">
                    <div class="v-empty" id="fallback">
                        <p class="v-empty-title">3D view unavailable</p>
                        <p class="v-empty-text">The 3D engine could not be loaded, which usually means this editor has no network access. The coupled files are listed in the table below.</p>
                    </div>
                </div>
                <div class="v-row v-row--between" style="margin-top: var(--v-space-3); flex-wrap: wrap">
                    <span class="v-caption">Orbit radius is inverse to coupling strength: closer files change together more often.</span>
                    <span class="v-caption v-mono" id="hoverName" aria-live="polite">Hover a satellite to see its file name</span>
                </div>
            </div>
        </section>

        <section class="v-section">
            <h2 class="v-section-title">Coupled files</h2>
            <div class="v-card">
                <div class="v-table-wrap">
                    <table class="v-table">
                        <thead>
                            <tr>
                                <th scope="col">File</th>
                                <th scope="col" class="v-num">Co-change rate</th>
                                <th scope="col" class="v-num">Shared commits</th>
                            </tr>
                        </thead>
                        <tbody>
${couplingRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; font-src ${cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gravity Well</title>
    <link rel="stylesheet" href="${cssUri}">
    <style>
        .well-stage {
            position: relative;
            height: 420px;
            border: 1px solid var(--v-border);
            border-radius: var(--v-radius-sm);
            background: var(--v-surface-sunken);
            overflow: hidden;
        }
        .well-stage canvas {
            display: block;
            width: 100%;
            height: 100%;
        }
        /* Hidden once the 3D engine reports for duty. */
        .well-stage--ready > .v-empty {
            display: none;
        }
    </style>
</head>
<body>
    <main class="v-page">
        <header class="v-header">
            <h1 class="v-title">Gravity Well</h1>
            <p class="v-subtitle">Files that orbit <span class="v-mono">${esc(fileLabel)}</span> — the ones git history shows are repeatedly changed together with it.</p>
        </header>
        ${body}
    </main>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script>
        const stage = document.getElementById('stage');
        const neighbors = ${JSON.stringify(data).replace(/</g, '\\u003c')};

        if (stage && neighbors.length > 0 && typeof THREE !== 'undefined') {
            // Resolve theme colours so the scene matches the editor's theme.
            function themeColor(token, fallback) {
                const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
                return value || fallback;
            }
            const coreColor = new THREE.Color(themeColor('--v-info', 'steelblue'));
            const satColor = new THREE.Color(themeColor('--v-alt', 'slateblue'));
            const orbitColor = new THREE.Color(themeColor('--v-border', 'gray'));

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setPixelRatio(window.devicePixelRatio || 1);
            stage.appendChild(renderer.domElement);
            stage.classList.add('well-stage--ready');

            scene.add(new THREE.AmbientLight(0xffffff, 0.6));
            const pointLight = new THREE.PointLight(0xffffff, 1.1, 400);
            pointLight.position.set(40, 60, 80);
            scene.add(pointLight);

            // Core: the file being analyzed.
            const core = new THREE.Mesh(
                new THREE.SphereGeometry(3, 32, 32),
                new THREE.MeshPhongMaterial({ color: coreColor, shininess: 40 })
            );
            scene.add(core);

            // Satellites: each coupled file, orbiting closer the stronger the coupling.
            const satellites = [];
            neighbors.forEach(n => {
                const size = Math.max(0.6, n.strength / 10);
                const sat = new THREE.Mesh(
                    new THREE.SphereGeometry(size, 20, 20),
                    new THREE.MeshPhongMaterial({ color: satColor, shininess: 20 })
                );

                const angle = Math.random() * Math.PI * 2;
                sat.position.x = Math.cos(angle) * n.distance;
                sat.position.z = Math.sin(angle) * n.distance;
                sat.userData = { angle: angle, distance: n.distance, speed: 0.003 + Math.random() * 0.004, name: n.name };
                satellites.push(sat);
                scene.add(sat);

                const curve = new THREE.EllipseCurve(0, 0, n.distance, n.distance);
                const points = curve.getPoints(64);
                const lineGeo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, 0, p.y)));
                const lineMat = new THREE.LineBasicMaterial({ color: orbitColor, transparent: true, opacity: 0.5 });
                scene.add(new THREE.LineLoop(lineGeo, lineMat));
            });

            camera.position.set(0, 45, 115);
            camera.lookAt(scene.position);

            function resize() {
                const rect = stage.getBoundingClientRect();
                const w = Math.max(1, rect.width);
                const h = Math.max(1, rect.height);
                renderer.setSize(w, h, false);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
            }
            window.addEventListener('resize', resize);
            resize();

            const mouse = new THREE.Vector2(-2, -2);
            const raycaster = new THREE.Raycaster();
            const hoverName = document.getElementById('hoverName');
            const idleHint = 'Hover a satellite to see its file name';

            renderer.domElement.addEventListener('mousemove', (event) => {
                const rect = renderer.domElement.getBoundingClientRect();
                mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            });

            renderer.domElement.addEventListener('mouseleave', () => {
                mouse.set(-2, -2);
                if (hoverName) hoverName.textContent = idleHint;
            });

            const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            function frame() {
                requestAnimationFrame(frame);

                if (!reduceMotion) {
                    satellites.forEach(s => {
                        s.userData.angle += s.userData.speed;
                        s.position.x = Math.cos(s.userData.angle) * s.userData.distance;
                        s.position.z = Math.sin(s.userData.angle) * s.userData.distance;
                    });
                    core.rotation.y += 0.002;
                }

                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObjects(satellites);
                if (hoverName) {
                    hoverName.textContent = intersects.length > 0
                        ? (intersects[0].object.userData.name || idleHint)
                        : idleHint;
                }

                renderer.render(scene, camera);
            }
            frame();
        }
    </script>
</body>
</html>`;
    }

    dispose() {
        if (this.panel) this.panel.dispose();
    }
}

module.exports = GravityWellPanel;
