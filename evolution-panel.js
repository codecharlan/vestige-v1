const vscode = require('vscode');
const path = require('path');

class EvolutionPanel {
    constructor(context, gitAnalyzer) {
        this.context = context;
        this.gitAnalyzer = gitAnalyzer;
        this.panel = null;
    }

    async show(filePath, commits, repoPath) {
        const fileName = path.basename(filePath);

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.evolution',
                `Code Evolution: ${fileName}`,
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.webview.onDidReceiveMessage(
                async message => {
                    if (message.command === 'loadCommit') {
                        const content = await this.loadFileAtCommit(repoPath, filePath, message.hash);
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
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Evolution</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        h1 {
            font-size: 1.3em;
            margin-bottom: 20px;
        }
        .slider-container {
            margin: 20px 0;
            padding: 20px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
        }
        .slider {
            width: 100%;
            margin: 10px 0;
        }
        .commit-info {
            font-size: 0.9em;
            margin-top: 10px;
            padding: 10px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textBlockQuote-border);
        }
        .code-view {
            margin-top: 20px;
            padding: 15px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            white-space: pre;
            overflow-x: auto;
            max-height: 500px;
            overflow-y: auto;
        }
        .loading {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <h1>🎬 Code Evolution: ${fileName}</h1>

    <div class="slider-container">
        <div>
            <strong>Drag to travel through time:</strong>
        </div>
        <input type="range" min="0" max="${commits.length - 1}" value="${commits.length - 1}" class="slider" id="commitSlider">
        <div class="commit-info" id="commitInfo">
            <div><strong>Commit:</strong> <span id="commitHash"></span></div>
            <div><strong>Author:</strong> <span id="commitAuthor"></span></div>
            <div><strong>Date:</strong> <span id="commitDate"></span></div>
            <div><strong>Message:</strong> <span id="commitMessage"></span></div>
        </div>
    </div>

    <div class="code-view" id="codeView">
        <div class="loading">Loading code...</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const commits = ${JSON.stringify(commits)};
        const slider = document.getElementById('commitSlider');
        
        let currentContent = {};

        slider.addEventListener('input', (e) => {
            const index = parseInt(e.target.value);
            const commit = commits[index];
            updateCommitInfo(commit);
            loadCommitContent(commit.hash);
        });

        function updateCommitInfo(commit) {
            document.getElementById('commitHash').textContent = commit.hash.substring(0, 7);
            document.getElementById('commitAuthor').textContent = commit.author || commit.author_name;
            document.getElementById('commitDate').textContent = new Date(commit.date).toLocaleString();
            document.getElementById('commitMessage').textContent = commit.message;
        }

        function loadCommitContent(hash) {
            if (currentContent[hash]) {
                displayContent(currentContent[hash]);
            } else {
                document.getElementById('codeView').innerHTML = '<div class="loading">Loading...</div>';
                vscode.postMessage({
                    command: 'loadCommit',
                    hash: hash
                });
            }
        }

        function displayContent(content) {
            document.getElementById('codeView').textContent = content;
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'commitContent') {
                currentContent[message.hash] = message.content;
                displayContent(message.content);
            }
        });

        // Load initial commit
        const initialIndex = commits.length - 1;
        updateCommitInfo(commits[initialIndex]);
        loadCommitContent(commits[initialIndex].hash);
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
