const vscode = require('vscode');
const path = require('path');

class TimelinePanel {
    constructor(context) {
        this.context = context;
        this.panel = null;
        this.currentFileName = '';
    }

    getROIColor(roi) {
        if (roi > 70) return '#ff5252';
        if (roi > 40) return '#ffd740';
        return '#69f0ae';
    }

    getSafetyColor(score) {
        if (score > 70) return '#69f0ae';
        if (score > 40) return '#ffd740';
        return '#ff5252';
    }

    update(analysis, epochs, busFactor, decisions) {
        if (this.panel && this.panel.visible) {
            analysis.epochs = epochs;
            analysis.busFactor = busFactor;
            analysis.decisions = decisions;
            this.panel.webview.html = this.getWebviewContent(analysis, this.currentFileName);
        }
    }

    show(analysis, filePath, decisions = []) {
        const fileName = path.basename(filePath);
        this.currentFileName = fileName;
        analysis.decisions = decisions;

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.timeline',
                `Vestige Timeline: ${fileName}`,
                vscode.ViewColumn.Two,
                { enableScripts: true, retainContextWhenHidden: true }
            );

            this.panel.webview.onDidReceiveMessage(message => {
                switch (message.command) {
                    case 'viewCommit':
                        vscode.commands.executeCommand('vestige.openFileAtCommit', message.hash, fileName, analysis.repoPath);
                        break;
                    case 'promoteLore':
                        vscode.commands.executeCommand('vestige.promoteLore', message.type, message.content, message.hash, analysis.repoPath, fileName);
                        break;
                }
            });

            this.panel.onDidDispose(() => { this.panel = null; });
        }

        this.panel.webview.html = this.getWebviewContent(analysis, fileName);
    }

    getWebviewContent(analysis, fileName) {
        const commits = analysis.lines || []; // Using analysis.lines for commits if structure changed, or analysis.commits
        const summary = analysis.churn || { totalCommits: 0, authors: [] };
        const epochs = analysis.epochs || [];
        const busFactor = analysis.busFactor || null;
        const implicitLore = analysis.implicitLore || [];
        const bio = analysis.narrativeBiography || 'Analyzing intelligence...';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vestige Timeline</title>
    <style>
        :root {
            --accent: #60A5FA;
            --surface: rgba(255, 255, 255, 0.03);
            --border: rgba(255, 255, 255, 0.1);
        }
        body {
            font-family: 'Inter', -apple-system, sans-serif;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 30px;
            margin: 0;
            line-height: 1.6;
        }
        .section-header {
            font-size: 0.85em; font-weight: 600; color: #94A3B8;
            text-transform: uppercase; letter-spacing: 0.1em;
            margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
        }
        .stats-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 15px; margin-bottom: 25px;
        }
        .stat-card {
            background: var(--surface); border: 1px solid var(--border);
            padding: 15px; border-radius: 12px; text-align: center;
        }
        .stat-value { font-size: 1.5em; font-weight: 700; color: var(--accent); display: block; }
        .stat-label { font-size: 0.7em; color: #94A3B8; text-transform: uppercase; }
        
        .bio-box {
            background: rgba(96, 165, 250, 0.03); border-left: 3px solid var(--accent);
            padding: 20px; border-radius: 0 12px 12px 0; margin-bottom: 30px;
            font-style: italic; color: #E2E8F0;
        }

        .timeline { position: relative; padding-left: 30px; }
        .timeline::before {
            content: ''; position: absolute; left: 0; top: 0; bottom: 0;
            width: 2px; background: linear-gradient(to bottom, var(--accent), transparent);
            opacity: 0.2;
        }
        .commit {
            background: var(--surface); border: 1px solid var(--border);
            padding: 15px; margin-bottom: 20px; border-radius: 10px;
            position: relative; transition: 0.2s;
        }
        .commit:hover { border-color: var(--accent); transform: translateX(5px); }
        .commit::before {
            content: ''; position: absolute; left: -34px; top: 22px;
            width: 10px; height: 10px; border-radius: 50%;
            background: var(--accent); box-shadow: 0 0 10px var(--accent);
        }
        .badge { padding: 3px 8px; border-radius: 6px; font-size: 0.7em; font-weight: 700; margin-right: 5px; }
        .badge-ghost { background: rgba(126, 87, 194, 0.2); color: #9575CD; }
        .badge-red { background: rgba(239, 68, 68, 0.2); color: #FCA5A5; }
        
        button {
            background: transparent; border: 1px solid var(--border);
            color: var(--accent); padding: 5px 12px; border-radius: 6px;
            cursor: pointer; font-size: 0.8em; margin-top: 10px;
        }
        button:hover { background: var(--accent); color: white; }
    </style>
</head>
<body>
    <h1 style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 1.2em;">🗿</span> Vestige Evolution
        ${analysis.isZenith ? `
            <span class="badge" style="background: rgba(251, 191, 36, 0.2); color: #FBBF24; margin-left: 10px; font-size: 0.6em; border: 1px solid rgba(251, 191, 36, 0.3);">
                🏆 ZENITH STATE
            </span>
        ` : ''}
    </h1>

    <div class="section-header">📜 Narrative Biography</div>
    <div class="bio-box">${bio}</div>

    <div class="section-header">📊 Project Intelligence</div>
    <div class="stats-grid" style="grid-template-columns: repeat(5, 1fr);">
        <div class="stat-card">
            <span class="stat-value">${summary.totalCommits || commits.length}</span>
            <span class="stat-label">Changes</span>
        </div>
        <div class="stat-card">
            <span class="stat-value" style="color: #69f0ae;">${analysis.reputation || 0}</span>
            <span class="stat-label">REPUTATION</span>
        </div>
        <div class="stat-card">
            <span class="stat-value" style="color: ${analysis.debtInterest > 50 ? '#ff5252' : '#69f0ae'}">${analysis.debtInterest}</span>
            <span class="stat-label">Interest</span>
        </div>
        <div class="stat-card">
            <span class="stat-value" style="color: ${this.getROIColor(analysis.refactorROI)}">${analysis.refactorROI || 0}%</span>
            <span class="stat-label">ROI</span>
        </div>
        <div class="stat-card">
            <span class="stat-value" style="color: ${this.getSafetyColor(analysis.safetyScore)}">${analysis.safetyScore || 0}%</span>
            <span class="stat-label">Safety</span>
        </div>
    </div>

    ${analysis.badges && analysis.badges.length > 0 ? `
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;">
            ${analysis.badges.map(b => `<span class="badge" style="background: ${b.color}33; color: ${b.color}; border: 1px solid ${b.color}66; padding: 4px 10px; font-size: 0.8em;">${b.label}</span>`).join('')}
        </div>
    ` : ''}

    ${analysis.archDrift ? `
        <div class="bio-box" style="border-left-color: #ff5252; background: rgba(255, 82, 82, 0.05); margin-bottom: 20px;">
            <strong style="color: #ff5252;">⚠️ Architectural Drift Warning</strong><br/>
            ${analysis.archDrift.message}
        </div>
    ` : ''}

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
        <div>
            <div class="section-header">👻 Ghost Lore</div>
            <div class="stat-card" style="text-align: left; max-height: 200px; overflow-y: auto;">
                ${implicitLore.length > 0 ? implicitLore.map(l => `
                    <div style="margin-bottom: 10px; font-size: 0.85em; cursor: pointer;" onclick="promoteLore('${l.type}', '${this.escapeJs(l.content)}', '${l.hash}')">
                        <span class="badge badge-ghost">${l.type.toUpperCase()}</span>
                        <span style="color: #CBD5E1">"${l.content}"</span>
                    </div>
                `).join('') : '<span class="stat-label">No implicit insights</span>'}
            </div>
        </div>
        <div>
            <div class="section-header">💬 Social Echoes</div>
            <div class="stat-card" style="text-align: left; max-height: 200px; overflow-y: auto;">
                ${analysis.echoedReviews && analysis.echoedReviews.length > 0 ? analysis.echoedReviews.map(r => `
                    <div style="margin-bottom: 10px; font-size: 0.85em;">
                        <div style="color: #94A3B8; font-size: 0.8em;">${r.author} (${r.hash.substring(0, 7)})</div>
                        <div style="color: #60A5FA; margin-top: 2px;">"${r.content}"</div>
                    </div>
                `).join('') : '<span class="stat-label">No historical PR echoes</span>'}
            </div>
        </div>
    </div>

    ${analysis.onboardingTour && analysis.onboardingTour.length > 0 ? `
        <div class="section-header">🤝 Onboarding Buddy</div>
        <div class="bio-box" style="display: flex; justify-content: space-between; align-items: center; border-left-color: #69f0ae; background: rgba(105, 240, 174, 0.03);">
            <div>
                <strong>New hire?</strong> Start a guided tour of this file's evolution.
                <div style="font-size: 0.8em; margin-top: 5px;">${analysis.onboardingTour.length} milestones found.</div>
            </div>
            <button onclick="startTour()">Start Tour</button>
        </div>
    ` : ''}

    <div class="section-header">🕙 Evolution Timeline</div>
    <div class="timeline">
        ${commits.length > 0 ? commits.map(c => `
            <div class="commit">
                <div style="display: flex; justify-content: space-between; font-size: 0.8em; color: #94A3B8; margin-bottom: 5px;">
                    <span>${c.hash ? c.hash.substring(0, 7) : 'HEAD'}</span>
                    <span>${new Date(c.date).toLocaleDateString()}</span>
                </div>
                <div style="font-weight: 700; margin-bottom: 3px;">👤 ${c.author}</div>
                <div style="color: #CBD5E1; font-size: 0.9em;">${this.escapeHtml(c.message || 'No message')}</div>
                ${c.hash ? `<button onclick="viewCommit('${c.hash}')">View Snapshot</button>` : ''}
            </div>
        `).join('') : '<div class="stat-card">No history recorded</div>'}
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function viewCommit(hash) { vscode.postMessage({ command: 'viewCommit', hash }); }
        function promoteLore(type, content, hash) {
            vscode.postMessage({ command: 'promoteLore', type, content, hash });
        }
        function startTour() {
            vscode.postMessage({ command: 'startTour' });
        }
    </script>
</body>
</html>`;
    }

    escapeJs(text) { return text ? text.replace(/'/g, "\\'").replace(/"/g, '\\"') : ''; }
    escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text ? text.replace(/[&<>"']/g, m => map[m]) : '';
    }

    dispose() { if (this.panel) this.panel.dispose(); }
}

module.exports = TimelinePanel;
