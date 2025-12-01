const vscode = require('vscode');
const path = require('path');

class TimelinePanel {
    constructor(context) {
        this.context = context;
        this.panel = null;
    }

    /**
     * Update the timeline panel if it's visible
     */
    update(timeline, epochs, busFactor, decisions) {
        if (this.panel && this.panel.visible) {
            // Merge extra data into timeline object for getWebviewContent
            timeline.epochs = epochs;
            timeline.busFactor = busFactor;
            timeline.decisions = decisions;
            this.panel.webview.html = this.getWebviewContent(timeline, this.currentFileName);
        }
    }

    /**
     * Show the timeline panel
     */
    show(timeline, filePath, decisions = []) {
        const fileName = path.basename(filePath);
        this.currentFileName = fileName;

        // Attach decisions to timeline for rendering
        timeline.decisions = decisions;

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.timeline',
                `Vestige Timeline: ${fileName}`,
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'viewCommit':
                            vscode.commands.executeCommand(
                                'vestige.openFileAtCommit',
                                message.hash,
                                fileName,
                                timeline.repoPath
                            );
                            return;
                        case 'viewDecision':
                            vscode.commands.executeCommand(
                                'vestige.showLore' // We can reuse this or make it specific
                            );
                            return;
                    }
                },
                null,
                this.context.subscriptions
            );

            this.panel.onDidDispose(() => {
                this.panel = null;
            });
        }

        this.panel.webview.html = this.getWebviewContent(timeline, fileName);
    }

    /**
     * Generate the HTML content for the webview
     */
    getWebviewContent(timeline, fileName) {
        const commits = timeline.commits;
        const summary = timeline.summary;
        const coupling = timeline.coupling || [];
        const epochs = timeline.epochs || [];
        const busFactor = timeline.busFactor || null;
        const decisions = timeline.decisions || [];

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vestige Timeline</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        h1 {
            font-size: 1.5em;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .summary, .coupling, .epochs, .bus-factor {
            background: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .bus-factor.high-risk {
            border-left-color: #f48771;
        }
        .bus-factor.medium-risk {
            border-left-color: #f9c74f;
        }
        .bus-factor.low-risk {
            border-left-color: #90be6d;
        }
        .summary-stat {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
        }
        .summary-label {
            font-weight: bold;
            color: var(--vscode-descriptionForeground);
        }
        .epoch-badge {
            display: inline-block;
            padding: 4px 12px;
            margin: 4px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 12px;
            font-size: 0.85em;
        }
        .timeline {
            position: relative;
            margin: 30px 0;
            padding-left: 40px;
        }
        .timeline::before {
            content: '';
            position: absolute;
            left: 15px;
            top: 0;
            bottom: 0;
            width: 2px;
            background: var(--vscode-textSeparator-foreground);
        }
        .commit {
            position: relative;
            margin-bottom: 25px;
            padding: 15px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            transition: background 0.2s;
        }
        .commit:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .commit::before {
            content: '';
            position: absolute;
            left: -30px;
            top: 20px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--vscode-textLink-foreground);
            border: 2px solid var(--vscode-editor-background);
            z-index: 1;
        }
        .commit-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .commit-hash {
            font-family: monospace;
            color: var(--vscode-textLink-foreground);
            font-size: 0.9em;
        }
        .commit-date {
            color: var(--vscode-descriptionForeground);
            font-size: 0.85em;
        }
        .commit-author {
            color: var(--vscode-symbolIcon-classForeground);
            font-weight: 500;
            margin-bottom: 5px;
        }
        .commit-message {
            color: var(--vscode-foreground);
            line-height: 1.4;
        }
        .no-commits {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
        .author-badge {
            display: inline-block;
            padding: 2px 8px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 10px;
            font-size: 0.8em;
            margin-right: 5px;
        }
        .view-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 0.8em;
            margin-top: 8px;
        }
        .view-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        h2 { font-size: 1.1em; margin-top: 0; }
    </style>
</head>
<body>
    <h1>
        <span>🗿</span>
        <span>Vestige Timeline: ${fileName}</span>
    </h1>

    <div class="summary">
        <div class="summary-stat">
            <span class="summary-label">Total Commits:</span>
            <span>${summary.total}</span>
        </div>
        <div class="summary-stat">
            <span class="summary-label">Contributors:</span>
            <span>${summary.authors.length}</span>
        </div>
        <div class="summary-stat">
            <span class="summary-label">First Commit:</span>
            <span>${summary.firstCommit ? new Date(summary.firstCommit.date).toLocaleDateString() : 'N/A'}</span>
        </div>
        <div class="summary-stat">
            <span class="summary-label">Last Commit:</span>
            <span>${summary.lastCommit ? new Date(summary.lastCommit.date).toLocaleDateString() : 'N/A'}</span>
        </div>
        <div class="summary-stat">
            <span class="summary-label">Authors:</span>
            <span>
                ${summary.authors.map(a => `<span class="author-badge">${a}</span>`).join('')}
            </span>
        </div>
    </div>

    ${decisions.length > 0 ? `
    <div class="summary" style="border-left-color: #a29bfe;">
        <h2>📜 Lore Decisions</h2>
        ${decisions.map(d => `
            <div class="summary-stat" style="flex-direction: column; align-items: flex-start; margin-bottom: 10px;">
                <div style="font-weight: bold;">${d.title}</div>
                <div style="font-size: 0.9em; opacity: 0.8;">${d.status || 'Decided'} • ${d.date || 'No date'}</div>
                <div style="font-size: 0.9em; margin-top: 4px;">${d.decision ? d.decision.substring(0, 100) + '...' : ''}</div>
            </div>
        `).join('')}
    </div>
    ` : ''}

    ${busFactor ? `
    <div class="bus-factor ${busFactor.risk}-risk">
        <h2>👥 Team Health (Bus Factor)</h2>
        <div class="summary-stat">
            <span class="summary-label">Bus Factor:</span>
            <span>${busFactor.busFactor} ${busFactor.busFactor === 1 ? '⚠️ HIGH RISK' : busFactor.busFactor === 2 ? '⚠️ Medium Risk' : '✅ Healthy'}</span>
        </div>
        ${busFactor.contributors.slice(0, 3).map(c => `
            <div class="summary-stat">
                <span>${c.name}</span>
                <span>${c.percent}%</span>
            </div>
        `).join('')}
        ${busFactor.busFactor === 1 ? `<p style="margin-top:10px; font-size:0.9em;">⚠️ Only one person owns 50%+ of this code. Consider knowledge sharing!</p>` : ''}
    </div>
    ` : ''}

    ${epochs.length > 0 ? `
    <div class="epochs">
        <h2>📊 Code Seasons Detected</h2>
        ${epochs.map(e => `
            <span class="epoch-badge" title="${e.commits} commits">${e.name} (${e.period})</span>
        `).join('')}
    </div>
    ` : ''}

    ${coupling.length > 0 ? `
    <div class="coupling">
        <h2>🔗 Coupled Files</h2>
        ${coupling.map(c => `
            <div class="summary-stat">
                <span>${c.file}</span>
                <span class="summary-label">${c.frequency}%</span>
            </div>
        `).join('')}
    </div>
    ` : ''}

    <div class="timeline">
        ${commits.length === 0 ?
                '<div class="no-commits">No commit history found</div>' :
                commits.map(commit => `
                <div class="commit">
                    <div class="commit-header">
                        <span class="commit-hash">${commit.hash.substring(0, 7)}</span>
                        <span class="commit-date">${new Date(commit.date).toLocaleString()}</span>
                    </div>
                    <div class="commit-author">👤 ${commit.author}</div>
                    <div class="commit-message">${this.escapeHtml(commit.message)}</div>
                    <button class="view-btn" onclick="viewCommit('${commit.hash}')">👁️ View File at Commit</button>
                </div>
            `).join('')
            }
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function viewCommit(hash) {
            vscode.postMessage({
                command: 'viewCommit',
                hash: hash
            });
        }

        // Add interactivity if needed
        const commits = document.querySelectorAll('.commit');
        commits.forEach(commit => {
            commit.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                commit.style.background = 'var(--vscode-list-activeSelectionBackground)';
                setTimeout(() => {
                    commit.style.background = '';
                }, 200);
            });
        });
    </script>
</body>
</html>`;
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Dispose of the panel
     */
    dispose() {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}

module.exports = TimelinePanel;
