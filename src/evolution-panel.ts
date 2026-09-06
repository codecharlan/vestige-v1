export {};
const vscode = require('vscode');
const path = require('path');

class EvolutionPanel { [key: string]: any;
    constructor(context, gitAnalyzer) {
        this.context = context;
        this.gitAnalyzer = gitAnalyzer;
        this.panel = null;
    }

    async show(filePath, commits, repoPath) {
        const fileName = path.basename(filePath);
        // The message handler is registered once — read the current paths from
        // `this`, or a reused panel serves the previous file's history.
        this.currentFilePath = filePath;
        this.currentRepoPath = repoPath;

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            this.panel.title = `Code Evolution: ${fileName}`;
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.evolution',
                `Code Evolution: ${fileName}`,
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.context.extensionUri]
                }
            );

            this.panel.webview.onDidReceiveMessage(
                async message => {
                    if (message.command === 'loadCommit') {
                        const content = await this.loadFileAtCommit(this.currentRepoPath, this.currentFilePath, message.hash);
                        if (!this.panel) return; // panel closed while git was running
                        this.panel.webview.postMessage({
                            command: 'commitContent',
                            hash: message.hash,
                            content: content
                        });
                    }
                },
                null,
                this.context.subscriptions
            );

            this.panel.onDidDispose(() => {
                this.panel = null;
            });
        }

        this.panel.webview.html = this.getWebviewContent(fileName, commits);
    }

    async loadFileAtCommit(repoPath, filePath, commitHash) {
        const simpleGit = require('simple-git');
        const git = simpleGit(repoPath);
        const relativePath = path.relative(repoPath, filePath);

        try {
            const content = await git.show([`${commitHash}:${relativePath}`]);
            return content;
        } catch (error) {
            return `// Error loading file at commit ${commitHash}`;
        }
    }

    getWebviewContent(fileName, commits) {
        const cssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'vestige.css'));
        const safeFileName = String(fileName).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const commitsJson = JSON.stringify(commits || []).replace(/</g, '\\u003c');
        const list = commits || [];
        const hasCommits = list.length > 0;
        const maxIndex = Math.max(0, list.length - 1);

        const body = hasCommits ? `
        <section class="v-section">
            <h2 class="v-section-title">Point in time</h2>
            <div class="v-card">
                <div class="v-row">
                    <span class="v-caption">Oldest</span>
                    <input type="range" class="v-range" id="commitSlider" min="0" max="${maxIndex}" value="${maxIndex}"
                           aria-label="Select a commit to view this file at">
                    <span class="v-caption">Newest</span>
                </div>
                <dl class="v-list" id="commitInfo" style="margin: var(--v-space-3) 0 0">
                    <div class="v-list-row"><dt class="v-caption">Commit</dt><dd class="v-mono" id="commitHash" style="margin: 0"></dd></div>
                    <div class="v-list-row"><dt class="v-caption">Author</dt><dd id="commitAuthor" style="margin: 0"></dd></div>
                    <div class="v-list-row"><dt class="v-caption">Date</dt><dd id="commitDate" style="margin: 0"></dd></div>
                    <div class="v-list-row"><dt class="v-caption">Message</dt><dd id="commitMessage" style="margin: 0; text-align: right"></dd></div>
                </dl>
            </div>
        </section>

        <section class="v-section">
            <h2 class="v-section-title">File contents at this commit</h2>
            <pre class="v-code" id="codeView" style="max-height: 60vh">Loading…</pre>
            <p class="v-caption" style="margin-top: var(--v-space-2)">Lines that are new relative to the previously viewed revision are highlighted.</p>
        </section>` : `
        <div class="v-empty">
            <p class="v-empty-title">No committed history for this file</p>
            <p class="v-empty-text">There is nothing to scrub through until this file has at least one commit. Commit it, then run <span class="v-mono">Vestige: Show Code Evolution</span> again.</p>
        </div>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'unsafe-inline'; font-src ${this.panel.webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Evolution</title>
    <link rel="stylesheet" href="${cssUri}">
    <style>
        .addition {
            display: block;
            background: var(--vscode-diffEditor-insertedTextBackground, var(--vscode-editor-selectionBackground));
            box-shadow: inset 2px 0 0 0 var(--v-good);
            padding-left: var(--v-space-1);
        }
    </style>
</head>
<body>
    <main class="v-page">
        <header class="v-header">
            <h1 class="v-title">Code Evolution</h1>
            <p class="v-subtitle"><span class="v-mono">${safeFileName}</span> — ${hasCommits ? `drag the slider to move through ${list.length} recorded revision${list.length === 1 ? '' : 's'} of this file.` : 'no recorded revisions yet.'}</p>
        </header>
        ${body}
    </main>

    <script>
        const vscode = acquireVsCodeApi();
        const commits = ${commitsJson};
        const slider = document.getElementById('commitSlider');

        let currentContent = {};
        let lastContent = "";

        if (slider) {
            slider.addEventListener('input', (e) => {
                const index = parseInt(e.target.value, 10);
                const commit = commits[index];
                if (!commit) return;
                updateCommitInfo(commit);
                loadCommitContent(commit.hash);
            });
        }

        function setText(id, text) {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        }

        function updateCommitInfo(commit) {
            if (!commit) return;
            setText('commitHash', String(commit.hash || '').substring(0, 7));
            setText('commitAuthor', commit.author_name || commit.author || 'Unknown');
            setText('commitDate', commit.date ? new Date(commit.date).toLocaleString() : 'unknown');
            setText('commitMessage', commit.message || 'No message');
        }

        function loadCommitContent(hash) {
            if (currentContent[hash]) {
                displayContent(currentContent[hash]);
            } else {
                setText('codeView', 'Loading…');
                vscode.postMessage({
                    command: 'loadCommit',
                    hash: hash
                });
            }
        }

        function displayContent(content) {
            const codeView = document.getElementById('codeView');
            if (!codeView) return;

            if (!lastContent) {
                codeView.textContent = content;
                lastContent = content;
                return;
            }

            // Line-level "what is new here" highlight relative to the last
            // revision the user looked at. Built with DOM nodes so no commit
            // content is ever interpreted as markup.
            const oldLines = new Set(lastContent.split('\\n'));
            codeView.textContent = '';
            content.split('\\n').forEach(line => {
                const span = document.createElement('span');
                if (!oldLines.has(line)) span.className = 'addition';
                span.textContent = line + '\\n';
                codeView.appendChild(span);
            });

            lastContent = content;

            const firstAddition = codeView.querySelector('.addition');
            if (firstAddition) {
                firstAddition.scrollIntoView({ block: 'center' });
            }
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'commitContent') {
                currentContent[message.hash] = message.content;
                displayContent(message.content);
            }
        });

        // Load initial commit (guard: files with no history render an empty state)
        if (commits.length > 0) {
            const initialIndex = commits.length - 1;
            updateCommitInfo(commits[initialIndex]);
            loadCommitContent(commits[initialIndex].hash);
        }
    </script>
</body>
</html>`;
    }

    dispose() {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}

module.exports = EvolutionPanel;
