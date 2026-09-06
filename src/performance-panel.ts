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

class PerformancePanel { [key: string]: any;
    constructor(context, gitAnalyzer) {
        this.context = context;
        this.gitAnalyzer = gitAnalyzer;
        this.panel = null;
        this.months = [];
    }

    async show(repoPath) {
        this.repoPath = repoPath;

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.performance',
                'Vestige Activity Timeline',
                vscode.ViewColumn.Two,
                {
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.context.extensionUri]
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = null;
            });
        }

        const commits = await this.gitAnalyzer.getRecentCommits(repoPath, 500);
        this.months = this.bucketByMonth(commits);
        this.panel.webview.html = this.getWebviewContent();
    }

    bucketByMonth(commits) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();
        const months = [];
        const index = {};

        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            index[key] = months.length;
            months.push({
                label: `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`,
                count: 0
            });
        }

        commits.forEach(commit => {
            const d = new Date(commit.date);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (index[key] !== undefined) {
                months[index[key]].count++;
            }
        });

        return months;
    }

    renderChart() {
        const months = this.months;
        const width = 720;
        const height = 260;
        const margin = { top: 24, right: 8, bottom: 32, left: 8 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;
        const maxCount = Math.max(1, ...months.map(m => m.count));
        const slot = plotWidth / months.length;
        const barWidth = Math.max(8, slot - 12);
        const baseline = margin.top + plotHeight;

        const bars = months.map((month, i) => {
            const barHeight = month.count === 0 ? 0 : Math.max(2, (month.count / maxCount) * plotHeight);
            const x = margin.left + i * slot + (slot - barWidth) / 2;
            const y = baseline - barHeight;
            const label = escapeHtml(month.label);
            const isPeak = month.count === maxCount && month.count > 0;
            return `
        <g>
            <title>${label}: ${month.count} commit${month.count === 1 ? '' : 's'}</title>
            ${month.count > 0 ? `<rect class="v-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="2"/>` : ''}
            ${isPeak ? `<text class="v-value-label" x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle">${month.count}</text>` : ''}
            <text class="v-axis-label" x="${(x + barWidth / 2).toFixed(1)}" y="${baseline + 18}" text-anchor="middle">${label}</text>
        </g>`;
        }).join('');

        return `<svg class="v-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Commits per month for the last 12 months">
        <line class="v-axis-line" x1="${margin.left}" y1="${baseline}" x2="${width - margin.right}" y2="${baseline}"/>
        ${bars}
    </svg>`;
    }

    getWebviewContent() {
        const cssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'vestige.css'));
        const cspSource = this.panel.webview.cspSource;
        const totalCommits = this.months.reduce((sum, m) => sum + m.count, 0);
        const busiest = this.months.reduce((best, m) => (m.count > best.count ? m : best), { label: '—', count: 0 });
        const activeMonths = this.months.filter(m => m.count > 0).length;

        const rows = this.months.map(m => `
                            <tr><th scope="row">${escapeHtml(m.label)}</th><td class="v-num">${m.count}</td></tr>`).join('');

        const body = totalCommits === 0 ? `
        <div class="v-empty">
            <p class="v-empty-title">No commits in the last 12 months</p>
            <p class="v-empty-text">Either this workspace has no git history, or every commit in the 500 most recent is older than a year. Commit some work and reopen this panel to see activity here.</p>
        </div>` : `
        <section class="v-section">
            <h2 class="v-section-title">Summary</h2>
            <div class="v-grid">
                <div class="v-metric">
                    <span class="v-metric-value">${totalCommits}</span>
                    <span class="v-metric-label">Commits charted</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value">${activeMonths}</span>
                    <span class="v-metric-label">Active months</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value">${busiest.count}</span>
                    <span class="v-metric-label">Peak — ${escapeHtml(busiest.label)}</span>
                </div>
            </div>
        </section>

        <section class="v-section">
            <h2 class="v-section-title">Commits per month</h2>
            <div class="v-card">
                <div class="v-table-wrap">${this.renderChart()}</div>
            </div>
        </section>

        <section class="v-section">
            <details class="v-details">
                <summary>View as table</summary>
                <div class="v-table-wrap">
                    <table class="v-table">
                        <thead>
                            <tr>
                                <th scope="col">Month</th>
                                <th scope="col" class="v-num">Commits</th>
                            </tr>
                        </thead>
                        <tbody>${rows}
                        </tbody>
                    </table>
                </div>
            </details>
        </section>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Activity Timeline</title>
    <link rel="stylesheet" href="${cssUri}">
</head>
<body>
    <main class="v-page">
        <header class="v-header">
            <h1 class="v-title">Activity Timeline</h1>
            <p class="v-subtitle">Commits per month over the last 12 months, taken from the 500 most recent commits in this repository.</p>
        </header>
        ${body}
    </main>
</body>
</html>`;
    }
}

module.exports = PerformancePanel;
