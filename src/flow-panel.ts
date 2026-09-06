export {};
const vscode = require('vscode');

function _escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

class FlowPanel { [key: string]: any;
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
                'vestige.flow',
                'Vestige Code Flow',
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

        const commits = await this.gitAnalyzer.getRecentCommits(repoPath, 100);
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

    getWebviewContent() {
        const cssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'vestige.css'));
        const cspSource = this.panel.webview.cspSource;
        const monthsJson = JSON.stringify(this.months).replace(/</g, '\\u003c');
        const totalCommits = this.months.reduce((sum, m) => sum + m.count, 0);

        const body = totalCommits === 0 ? `
        <div class="v-empty">
            <p class="v-empty-title">Nothing to replay</p>
            <p class="v-empty-text">None of the 100 most recent commits fall inside the last 12 months, so there is no activity to animate. Commit some work and reopen this panel.</p>
        </div>` : `
        <section class="v-section">
            <h2 class="v-section-title">Activity replay</h2>
            <div class="v-card">
                <div class="flow-stage" id="canvas" role="img" aria-label="Commit activity per month over the last 12 months"></div>
                <div class="v-toolbar" style="margin-top: var(--v-space-3)">
                    <button type="button" class="v-btn v-btn--primary" id="playBtn">Play</button>
                    <button type="button" class="v-btn" id="pauseBtn">Pause</button>
                    <button type="button" class="v-btn" id="resetBtn">Reset</button>
                </div>
                <p class="v-caption" style="margin: var(--v-space-3) 0 0">Each dot represents a share of that month's commits; taller stacks mean busier months. Press Play to replay the last year month by month.</p>
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
                        <tbody>
${this.months.map(m => `                            <tr><th scope="row">${_escapeHtml(m.label)}</th><td class="v-num">${m.count}</td></tr>`).join('\n')}
                        </tbody>
                    </table>
                </div>
            </details>
        </section>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'unsafe-inline'; font-src ${cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Flow</title>
    <link rel="stylesheet" href="${cssUri}">
    <style>
        .flow-stage {
            position: relative;
            height: 340px;
            border: 1px solid var(--v-border);
            border-radius: var(--v-radius-sm);
            background: var(--v-surface-sunken);
            overflow: hidden;
        }
        .month-column {
            position: absolute;
            top: 0;
            bottom: 0;
            border-right: 1px solid var(--v-border);
        }
        .month-column:last-of-type {
            border-right: none;
        }
        .month-label,
        .month-count {
            position: absolute;
            width: 100%;
            text-align: center;
            font-size: var(--v-fs-caption);
            color: var(--v-text-muted);
        }
        .month-label {
            bottom: var(--v-space-2);
        }
        .month-count {
            top: var(--v-space-2);
            opacity: 0;
            transition: opacity 0.4s ease;
        }
        .month-column.lit .month-count {
            opacity: 1;
            color: var(--v-text);
        }
        .flow-dot {
            position: absolute;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            opacity: 0;
            transition: opacity 0.5s ease;
        }
        .flow-dot.visible {
            opacity: 1;
        }
        .flow-dot--a { background: var(--v-info); }
        .flow-dot--b { background: var(--v-good); }
        .flow-dot--c { background: var(--v-alt); }
        .flow-dot--d { background: var(--v-warn); }
    </style>
</head>
<body>
    <main class="v-page">
        <header class="v-header">
            <h1 class="v-title">Code Flow</h1>
            <p class="v-subtitle">Commit activity over the last 12 months — ${totalCommits} commits from the 100 most recent in this repository.</p>
        </header>
        ${body}
    </main>

    <script>
        const months = ${monthsJson};
        const canvas = document.getElementById('canvas');
        const dotTones = ['flow-dot--a', 'flow-dot--b', 'flow-dot--c', 'flow-dot--d'];
        const maxCount = Math.max(1, ...months.map(m => m.count));
        const colWidth = 100 / months.length;

        const columns = canvas ? months.map((month, i) => {
            const col = document.createElement('div');
            col.className = 'month-column';
            col.style.left = (i * colWidth) + '%';
            col.style.width = colWidth + '%';

            const label = document.createElement('div');
            label.className = 'month-label';
            label.textContent = month.label;
            col.appendChild(label);

            const count = document.createElement('div');
            count.className = 'month-count';
            count.textContent = month.count + (month.count === 1 ? ' commit' : ' commits');
            col.appendChild(count);

            canvas.appendChild(col);
            return col;
        }) : [];

        let timer = null;
        let monthIndex = 0;
        const particles = [];

        function spawnMonth(i) {
            const month = months[i];
            columns[i].classList.add('lit');
            if (month.count === 0) return;
            // Dot count proportional to real activity (1..20)
            const dots = Math.max(1, Math.round((month.count / maxCount) * 20));
            for (let d = 0; d < dots; d++) {
                const node = document.createElement('div');
                node.className = 'flow-dot ' + dotTones[d % dotTones.length];
                node.style.left = (i * colWidth + 1 + Math.random() * (colWidth - 3)) + '%';
                node.style.bottom = (14 + (d / Math.max(1, dots)) * 62 + Math.random() * 6) + '%';
                canvas.appendChild(node);
                particles.push(node);
                requestAnimationFrame(() => node.classList.add('visible'));
            }
        }

        function play() {
            if (!canvas) return;
            if (timer !== null) return; // already running — do not stack loops
            if (monthIndex >= months.length) return;
            timer = setInterval(() => {
                if (monthIndex >= months.length) {
                    clearInterval(timer);
                    timer = null;
                    return;
                }
                spawnMonth(monthIndex);
                monthIndex++;
            }, 500);
        }

        function pause() {
            if (timer !== null) {
                clearInterval(timer);
                timer = null;
            }
        }

        function reset() {
            pause();
            monthIndex = 0;
            particles.forEach(p => p.remove());
            particles.length = 0;
            columns.forEach(c => c.classList.remove('lit'));
        }

        const playBtn = document.getElementById('playBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const resetBtn = document.getElementById('resetBtn');
        if (playBtn) playBtn.addEventListener('click', play);
        if (pauseBtn) pauseBtn.addEventListener('click', pause);
        if (resetBtn) resetBtn.addEventListener('click', reset);

        // Users who prefer reduced motion get the finished picture immediately.
        if (canvas && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            months.forEach((m, i) => spawnMonth(i));
            monthIndex = months.length;
        }
    </script>
</body>
</html>`;
    }
}

module.exports = FlowPanel;
