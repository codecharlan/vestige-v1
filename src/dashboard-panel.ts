export {};
const vscode = require('vscode');

class DashboardPanel { [key: string]: any;
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
                'Vestige Team Dashboard',
                vscode.ViewColumn.One,
                {
                    // Static page — no scripts needed, keep the surface minimal
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.context.extensionUri]
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = null;
            });
        }

        this.panel.webview.html = this.getWebviewContent(metrics);
    }

    getWebviewContent(metrics) {
        const cssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'vestige.css'));
        const esc = (v) => String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        const health = (metrics && metrics.health) || null;
        const m = (health && health.metrics) || {};
        const hasData = !!health && (m.filesAnalyzed || 0) > 0;

        // Health score tone drives the one accent colour on the page.
        const score = Number(health && health.score) || 0;
        const tone = score >= 8 ? 'good' : score >= 5 ? 'warn' : 'bad';

        const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
        const fossilPercent = clamp(m.fossilPercent);
        const churnPercent = clamp(m.churnPercent);
        const busFactor = Number(m.avgBusFactor) || 0;

        const breakdown = [
            { label: 'Code freshness', value: 100 - fossilPercent, display: `${100 - fossilPercent}%` },
            { label: 'Team distribution', value: clamp(busFactor * 25), display: busFactor ? String(busFactor) : 'N/A' },
            { label: 'Stability', value: 100 - churnPercent, display: `${100 - churnPercent}%` }
        ];

        const breakdownRows = breakdown.map(row => `
                    <tr>
                        <th scope="row">${esc(row.label)}</th>
                        <td>
                            <div class="v-meter"><span class="v-meter-fill v-meter-fill--${tone}" style="width: ${row.value}%"></span></div>
                        </td>
                        <td class="v-num v-mono">${esc(row.display)}</td>
                    </tr>`).join('');

        const hotspots = (m.hotspots || []);
        const hotspotSection = hotspots.length > 0 ? `
        <section class="v-section">
            <h2 class="v-section-title">Debt hotspots</h2>
            <div class="v-card">
                <p class="v-subtitle" style="margin-top: 0">These files are ranked relative to each other in this repository, by commit churn against file size and age. It is a starting point for where to look first — not a cost estimate, and not comparable to any other repository.</p>
                <div class="v-table-wrap">
                    <table class="v-table">
                        <thead>
                            <tr>
                                <th scope="col">File</th>
                                <th scope="col" class="v-num">Churn</th>
                                <th scope="col" class="v-num">Debt score</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${hotspots.map(h => `
                            <tr>
                                <td class="v-mono">${esc(h.file)}</td>
                                <td class="v-num">${esc(Number(h.churn) || 0)} commits</td>
                                <td class="v-num v-bad">${esc(h.debtScore)}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>` : '';

        const recommendation = score < 5
            ? 'Repository health is below average. Focus on the high-churn files listed above and spread ownership so no single file depends on one person.'
            : score < 8
                ? 'The repository is in good shape. Keep watching the bus factor and chip away at the debt hotspots as you touch those files.'
                : 'Excellent repository health. Current review and ownership practices are working — keep them.';

        const body = hasData ? `
        <section class="v-section">
            <h2 class="v-section-title">Repository health</h2>
            <div class="v-grid v-grid--wide">
                <div class="v-metric">
                    <span class="v-metric-value v-metric-value--${tone}">${esc(score)}<span class="v-muted" style="font-size: var(--v-fs-body); font-weight: 400">/10</span></span>
                    <span class="v-metric-label">Health score</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value">${esc(busFactor || 'N/A')}</span>
                    <span class="v-metric-label">Average bus factor</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value">${fossilPercent}%</span>
                    <span class="v-metric-label">Fossil code</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value">${churnPercent}%</span>
                    <span class="v-metric-label">High-churn files</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value">${esc(Number(m.filesAnalyzed) || 0)}</span>
                    <span class="v-metric-label">Files analyzed</span>
                </div>
            </div>
        </section>

        <section class="v-section">
            <h2 class="v-section-title">Health breakdown</h2>
            <div class="v-card">
                <div class="v-table-wrap">
                    <table class="v-table">
                        <thead>
                            <tr>
                                <th scope="col">Dimension</th>
                                <th scope="col">Level</th>
                                <th scope="col" class="v-num">Value</th>
                            </tr>
                        </thead>
                        <tbody>${breakdownRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        ${hotspotSection}

        <section class="v-section">
            <h2 class="v-section-title">Recommendation</h2>
            <div class="v-note v-note--${tone}">${esc(recommendation)}</div>
        </section>` : `
        <div class="v-empty">
            <p class="v-empty-title">No repository metrics yet</p>
            <p class="v-empty-text">Vestige could not analyze any files in this workspace. Open a folder that is a git repository with at least one commit, then run <span class="v-mono">Vestige: Show Team Dashboard</span> again.</p>
        </div>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; font-src ${this.panel.webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vestige Dashboard</title>
    <link rel="stylesheet" href="${cssUri}">
</head>
<body>
    <main class="v-page">
        <header class="v-header">
            <h1 class="v-title">Team Dashboard</h1>
            <p class="v-subtitle">Repository-wide health, ownership spread and technical debt, derived from this workspace's git history.</p>
        </header>
        ${body}
    </main>
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
