const assert = require('assert');
const DebtCalculator = require('../../debt-calculator');

suite('DebtCalculator Test Suite', () => {
    let mockGitAnalyzer;
    let calculator;

    setup(() => {
        mockGitAnalyzer = {
            calculateTechnicalDebt: async (repoPath, filePath) => ({
                cost: 1000,
                score: 55
            })
        };
        calculator = new DebtCalculator(mockGitAnalyzer);
    });

    test('calculateDebt returns debt from analyzer', async () => {
        const result = await calculator.calculateDebt('/repo', '/file.js');
        assert.deepStrictEqual(result, { cost: 1000, score: 55 });
    });

    test('formatDebt formats currency correctly', () => {
        const debt = { cost: 1500 };
        assert.strictEqual(calculator.formatDebt(debt), '$1,500');
    });

    test('formatDebt handles null', () => {
        assert.strictEqual(calculator.formatDebt(null), 'N/A');
    });

    test('getDebtLevel returns correct levels', () => {
        assert.strictEqual(calculator.getDebtLevel({ score: 60 }), 'Critical');
        assert.strictEqual(calculator.getDebtLevel({ score: 25 }), 'High');
        assert.strictEqual(calculator.getDebtLevel({ score: 15 }), 'Medium');
        assert.strictEqual(calculator.getDebtLevel({ score: 5 }), 'Low');
        assert.strictEqual(calculator.getDebtLevel(null), 'Unknown');
    });

    test('forecastDebtHorizon calculates future debt', () => {
        const mockAnalysis = {
            lines: { length: 200 },
            churn: { totalCommits: 50 },
            interestRate: 20
        };
        const forecast = calculator.forecastDebtHorizon(mockAnalysis, 180);
        assert.ok(forecast.score > mockAnalysis.interestRate);
        assert.ok(forecast.cost > 0);
        assert.ok(forecast.increasePercent > 0);
    });
});
