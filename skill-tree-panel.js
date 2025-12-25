const vscode = require('vscode');

class SkillTreePanel {
    constructor(context) {
        this.context = context;
        this.panel = null;
    }

    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.skillTree',
                'Vestige: Archaeology Skill Tree',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );
            this.panel.onDidDispose(() => { this.panel = null; });
        }

        this.panel.webview.html = this.getHtml();
    }

    getHtml() {
        return `<!DOCTYPE html>
<html>
<head>
    <style>
        body { background: #0F172A; color: white; font-family: 'Inter', sans-serif; padding: 40px; }
        .tree { display: flex; flex-direction: column; align-items: center; gap: 40px; }
        .node { 
            width: 120px; height: 120px; 
            border-radius: 50%; 
            display: flex; align-items: center; justify-content: center; 
            text-align: center; font-size: 0.8em; 
            border: 2px solid #334155;
            background: rgba(255,255,255,0.05);
            transition: all 0.3s;
        }
        .unlocked { border-color: #10B981; box-shadow: 0 0 15px rgba(16, 185, 129, 0.3); }
        .locked { filter: grayscale(1); opacity: 0.5; }
        .connector { width: 2px; height: 40px; background: #334155; }
    </style>
</head>
<body>
    <div class="tree">
        <div class="node unlocked">Basic Blame</div>
        <div class="connector"></div>
        <div class="node unlocked">Bus Factor</div>
        <div class="connector"></div>
        <div class="node locked">Zombie Detection</div>
        <div class="connector"></div>
        <div class="node locked">Time Travel</div>
    </div>
</body>
</html>`;
    }
}

module.exports = SkillTreePanel;
