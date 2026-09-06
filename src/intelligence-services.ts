export {};
const vscode = require('vscode');

class HandoffAssistant { [key: string]: any;
    constructor(gitAnalyzer) {
        this.gitAnalyzer = gitAnalyzer;
    }

    /**
     * Identify handoff risks from real git data: files that many different
     * authors have touched recently ("hot potatoes") carry the highest
     * knowledge-transfer risk. Returns [] when nothing risky is found.
     */
    async identifyRisks(repoPath) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const root = repoPath || workspaceFolders?.[0]?.uri?.fsPath;
        if (!root) return [];

        try {
            const hotPotatoes = await this.gitAnalyzer.detectHotPotato(root);

            return hotPotatoes
                .map(hp => ({
                    file: hp.file,
                    authorCount: hp.authorCount,
                    commits: hp.commits,
                    status: 'High Author Turnover',
                    riskScore: Math.min(100, hp.authorCount * 10),
                }))
                .sort((a, b) => b.riskScore - a.riskScore);
        } catch (e) {
            console.error('Handoff risk analysis failed:', e);
            return [];
        }
    }
}

class MentorshipMatcher { [key: string]: any;
    constructor(gitAnalyzer) {
        this.gitAnalyzer = gitAnalyzer;
    }

    async findExpertsForFile(uri) {
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (!workspaceFolder) return [];

            const analysis = await this.gitAnalyzer.analyzeFile(workspaceFolder.uri.fsPath, uri.fsPath);
            const ownership = this.gitAnalyzer.calculateOwnership(analysis.lines);

            if (!ownership.topAuthor || ownership.topAuthor === 'None') return [];

            return [
                { expert: ownership.topAuthor, proximity: ownership.percent, reason: `Historical owner of ${ownership.percent}% of this file.` }
            ];
        } catch (e) {
            console.error('Expert lookup failed:', e);
            return [];
        }
    }
}

module.exports = {
    HandoffAssistant,
    MentorshipMatcher
};
