export {};


/**
 * DebtCalculator — a *relative ranking signal* for where to look first.
 *
 * The score is churn × complexity(as line count) × log(age). That is a real,
 * if crude, number derived from git history, and it is useful for one thing
 * only: ordering the files of a single repository against each other so a
 * human knows which ones to open first.
 *
 * It is NOT a measurement. There is no validated mapping from any git-derived
 * metric to actual technical debt — Google tested 117 candidate metrics against
 * engineers' own reports of debt and found none of them predictive, and Martin
 * Fowler's position is that debt "cannot be objectively measured". Scores are
 * therefore not comparable across repositories, and absolutely must never be
 * presented as money or as hours: multiplying an arbitrary score by an
 * invented hourly rate produces a confident-looking figure with no basis,
 * which destroys the user's trust in the honest metrics shown beside it.
 *
 * Present the level, the inputs (see `describeDebt`) and the raw score. Never
 * a currency amount, never a remediation-time estimate.
 */
class DebtCalculator { [key: string]: any;
    constructor(gitAnalyzer) {
        this.gitAnalyzer = gitAnalyzer;
    }

    async calculateDebt(repoPath, filePath) {
        return await this.gitAnalyzer.calculateTechnicalDebt(repoPath, filePath);
    }

    /**
     * Predictive Forecasting: project the debt *score* forward based on current
     * churn velocity. Returns a relative score only — no cost, no hours.
     */
    forecastDebtHorizon(debt, days = 180) {
        if (!debt) return null;

        const velocity = debt.churn / (debt.age || 1); // Commits per day
        const predictedChurn = debt.churn + (velocity * days);

        // Use the same formula logic from GitAnalyzer
        const complexityFactor = debt.complexity / 100;
        const churnFactor = Math.max(1, predictedChurn / 5);
        const ageFactor = Math.max(1, (debt.age + days) / 30);

        const predictedScore = parseFloat((complexityFactor * churnFactor * Math.log(ageFactor)).toFixed(1));

        return {
            score: predictedScore,
            increasePercent: debt.score ? Math.round(((predictedScore - debt.score) / debt.score) * 100) : 0
        };
    }

    /**
     * Describe the inputs behind the score in one plain sentence, so the
     * reasoning is visible instead of hidden behind a single opaque figure.
     * e.g. "High churn (47 commits) on 320 lines, last changed 12 days ago".
     */
    describeDebt(debt) {
        if (!debt) return 'No history available for this file';

        const commits = Number(debt.churn) || 0;
        const lines = Number(debt.complexity) || 0;
        const ageDays = Number(debt.age) || 0;

        const churnLabel = commits > 40
            ? 'Very high churn'
            : commits > 20
                ? 'High churn'
                : commits > 8
                    ? 'Moderate churn'
                    : 'Low churn';

        const lastChanged = ageDays <= 0
            ? 'last changed today'
            : ageDays === 1
                ? 'last changed 1 day ago'
                : `last changed ${ageDays} days ago`;

        const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

        return `${churnLabel} (${plural(commits, 'commit')}) on ${plural(lines, 'line')}, ${lastChanged}`;
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
