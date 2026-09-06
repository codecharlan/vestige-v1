export {};
const vscode = require('vscode');
const path = require('path');
const { execFile } = require('child_process');

class TimeTravelPanel { [key: string]: any;
    constructor(context) {
        this.context = context;
        this.panel = null;
        this.currentFileName = '';
        this.repoPath = '';
    }

    show(filePath, repoPath, commits = []) {
        const fileName = path.basename(filePath);
        this.currentFileName = fileName;
        this.repoPath = repoPath;

        // Use the relative path from the repo root for git show
        this.relativePath = path.relative(repoPath, filePath);

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            this.panel.title = `Time Travel: ${fileName}`;
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.timeTravel',
                `Time Travel: ${fileName}`,
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.context.extensionUri]
                }
            );

            this.panel.webview.onDidReceiveMessage(message => {
                switch (message.command) {
                    case 'fetchCommitFile':
                        this.fetchCommitContent(message.hash);
                        break;
                }
            });

            this.panel.onDidDispose(() => { this.panel = null; });
        }

        this.panel.webview.html = this.getWebviewContent(commits, fileName);
    }

    fetchCommitContent(hash) {
        if (!this.panel) return;

        // The hash comes from webview postMessage — treat it as untrusted.
        if (!/^[0-9a-f]{7,40}$/i.test(String(hash))) {
            this.panel.webview.postMessage({ command: 'setContent', content: 'Error: invalid commit hash.' });
            return;
        }

        // execFile with an argument vector — nothing is shell-interpreted
        execFile('git', ['show', `${hash}:${this.relativePath}`],
            { cwd: this.repoPath, maxBuffer: 1024 * 1024 * 10 },
            (err, stdout, stderr) => {
                if (!this.panel) return; // panel closed while git was running
                if (err) {
                    this.panel.webview.postMessage({ command: 'setContent', content: `Error fetching content:\n${stderr || err.message}` });
                    return;
                }
                this.panel.webview.postMessage({ command: 'setContent', content: stdout });
            });
    }

    _escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    getWebviewContent(commits, fileName) {
        // Reverse commits so oldest is 0, newest is length-1
        const chronologicalCommits = [...commits].reverse();
        const hasCommits = chronologicalCommits.length > 0;
        // Prevent </script> in commit messages from breaking out of the script block
        const commitsJson = JSON.stringify(chronologicalCommits).replace(/</g, '\\u003c');
        const cssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'vestige.css'));
        const cspSource = this.panel.webview.cspSource;
        const maxIndex = Math.max(0, chronologicalCommits.length - 1);

        const body = hasCommits ? `
        <section class="v-section">
            <h2 class="v-section-title">Point in time</h2>
            <div class="v-card">
                <div class="v-row">
                    <span class="v-caption">Oldest</span>
                    <input type="range" class="v-range" id="timelineSlider" min="0" max="${maxIndex}" value="${maxIndex}"
                           aria-label="Select a revision of this file">
                    <span class="v-caption">Newest</span>
                </div>
                <div class="v-note" id="commitInfo" style="margin-top: var(--v-space-3)">Loading revision…</div>
            </div>
        </section>

        <section class="v-section v-flex-fill">
            <h2 class="v-section-title">File contents at this revision</h2>
            <pre class="v-code v-code-fill" id="codeView">Select a point in time…</pre>
        </section>` : `
        <div class="v-empty">
            <p class="v-empty-title">No committed history for this file</p>
            <p class="v-empty-text">Time travel replays a file from its commits, and this one has none yet. Commit the file, then run <span class="v-mono">Vestige: Open Time Travel Scrubbing</span> again.</p>
        </div>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'unsafe-inline'; font-src ${cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Time Travel Scrubbing</title>
    <link rel="stylesheet" href="${cssUri}">
    <style>
        /* The code pane grows to fill the panel and scrolls on its own. */
        .v-page--fill {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
        }
        .v-flex-fill {
            display: flex;
            flex-direction: column;
            flex: 1 1 auto;
            min-height: 160px;
        }
        .v-code-fill {
            flex: 1 1 auto;
        }
        .v-commit-hash {
            font-family: var(--v-font-mono);
            font-weight: 600;
            color: var(--v-accent);
        }
    </style>
</head>
<body>
    <main class="v-page v-page--fill">
        <header class="v-header">
            <h1 class="v-title">Time Travel</h1>
            <p class="v-subtitle"><span class="v-mono">${this._escapeHtml(fileName)}</span> — ${hasCommits ? `scrub through ${chronologicalCommits.length} historical version${chronologicalCommits.length === 1 ? '' : 's'} of this file.` : 'no committed history found yet.'}</p>
        </header>
        ${body}
    </main>

    <script>
        const vscode = acquireVsCodeApi();
        const commits = ${commitsJson};
        const slider = document.getElementById('timelineSlider');
        const commitInfo = document.getElementById('commitInfo');
        const codeView = document.getElementById('codeView');

        function updateCommitInfo(index) {
            const commit = commits[index];
            if (!commit || !commitInfo) return;

            const date = commit.date ? new Date(commit.date).toLocaleString() : 'unknown date';
            const author = commit.author_name || commit.author || 'Unknown';

            // Built from DOM nodes: commit messages are never parsed as markup.
            commitInfo.textContent = '';

            const line1 = document.createElement('div');
            const hash = document.createElement('span');
            hash.className = 'v-commit-hash';
            hash.textContent = String(commit.hash || '').substring(0, 7);
            line1.appendChild(hash);
            const when = document.createElement('span');
            when.className = 'v-muted';
            when.textContent = '  ·  ' + date;
            line1.appendChild(when);
            commitInfo.appendChild(line1);

            const line2 = document.createElement('div');
            const who = document.createElement('span');
            who.className = 'v-strong';
            who.textContent = author;
            line2.appendChild(who);
            const msg = document.createElement('span');
            msg.textContent = ': ' + (commit.message || 'No message');
            line2.appendChild(msg);
            commitInfo.appendChild(line2);

            if (codeView) codeView.textContent = 'Fetching this revision…';
            vscode.postMessage({ command: 'fetchCommitFile', hash: commit.hash });
        }

        // Initial load
        if (commits.length > 0 && slider) {
            updateCommitInfo(slider.value);

            // Slider events
            slider.addEventListener('input', (e) => {
                updateCommitInfo(e.target.value);
            });
        }

        // Messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'setContent' && codeView) {
                codeView.textContent = message.content;
            }
        });
    </script>
</body>
</html>`;
    }

    dispose() {
        if (this.panel) this.panel.dispose();
    }
}

module.exports = TimeTravelPanel;
