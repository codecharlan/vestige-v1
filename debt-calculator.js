

class DebtCalculator {
    constructor(gitAnalyzer) {
        this.gitAnalyzer = gitAnalyzer;
    }

    async calculateDebt(repoPath, filePath) {
        return await this.gitAnalyzer.calculateTechnicalDebt(repoPath, filePath);
    }

    /**
     * Predictive Forecasting: Estimate debt in X days based on current churn velocity.
     */
    forecastDebtHorizon(debt, days = 180) {
        if (!debt) return null;

        const velocity = debt.churn / (debt.age || 1); // Commits per day
        const predictedChurn = debt.churn + (velocity * days);

        // Use the same formula logic from GitAnalyzer
        const complexityFactor = debt.complexity / 100;
        const churnFactor = Math.max(1, predictedChurn / 5);
        const ageFactor = Math.max(1, (debt.age + days) / 30);

        const predictedScore = (complexityFactor * churnFactor * Math.log(ageFactor)).toFixed(1);
        const predictedCost = Math.round(predictedScore * 50);

        return {
            score: parseFloat(predictedScore),
            cost: predictedCost,
            increasePercent: Math.round(((predictedScore - debt.score) / debt.score) * 100) || 0
        };
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
