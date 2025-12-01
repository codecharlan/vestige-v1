

class DebtCalculator {
    constructor(gitAnalyzer) {
        this.gitAnalyzer = gitAnalyzer;
    }

    async calculateDebt(repoPath, filePath) {
        return await this.gitAnalyzer.calculateTechnicalDebt(repoPath, filePath);
    }

    formatDebt(debt) {
        if (!debt) return 'N/A';
        return `$${debt.cost.toLocaleString()}`;
    }

    getDebtLevel(debt) {
        if (!debt) return 'Unknown';
        if (debt.score > 50) return 'Critical';
        if (debt.score > 20) return 'High';
        if (debt.score > 10) return 'Medium';
        return 'Low';
    }
}

module.exports = DebtCalculator;
