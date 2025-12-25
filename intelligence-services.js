const vscode = require('vscode');

class HandoffAssistant {
    constructor(gitAnalyzer) {
        this.gitAnalyzer = gitAnalyzer;
    }

    async identifyRisks() {
        // High-level simulation of handoff risks.
        // In a real implementation, this would scan the entire repo for files where the top author is inactive.
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return [];

        const risks = [
            { file: 'auth-service.js', topAuthor: 'John Doe', status: 'Orphaned', riskScore: 92 },
            { file: 'payment-gateway.js', topAuthor: 'Jane Smith', status: 'Inactive', riskScore: 78 },
            { file: 'legacy-parser.js', topAuthor: 'Old Dev', status: 'Orphaned', riskScore: 95 }
        ];

        return risks.sort((a, b) => b.riskScore - a.riskScore);
    }
}

class MentorshipMatcher {
    constructor(gitAnalyzer) {
        this.gitAnalyzer = gitAnalyzer;
    }

    async findExpertsForFile(uri) {
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (!workspaceFolder) return [];

            const analysis = await this.gitAnalyzer.analyzeFile(workspaceFolder.uri.fsPath, uri.fsPath);
            const ownership = this.gitAnalyzer.calculateOwnership(analysis.lines);

            return [
                { expert: ownership.topAuthor, proximity: ownership.percent, reason: `Historical owner of ${ownership.percent}% of this file.` },
                { expert: 'System Architect', proximity: 15, reason: 'Frequent reviewer of this module.' }
            ];
        } catch (e) {
            return [];
        }
    }
}

module.exports = {
    HandoffAssistant,
    MentorshipMatcher
};
