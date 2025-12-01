

class BugAnalyzer {
    constructor(gitAnalyzer) {
        this.gitAnalyzer = gitAnalyzer;
    }

    async analyze(repoPath, filePath) {
        return await this.gitAnalyzer.findBugPatterns(repoPath, filePath);
    }

    getRiskLevel(bugStats) {
        if (!bugStats) return 'Unknown';
        if (bugStats.density > 0.2) return 'High'; // > 20% of commits are fixes
        if (bugStats.density > 0.1) return 'Medium';
        return 'Low';
    }
}

module.exports = BugAnalyzer;
