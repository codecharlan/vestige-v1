const assert = require('assert');
const DebtCalculator = require('../../dist/debt-calculator');

suite('DebtCalculator Test Suite', () => {
    let mockGitAnalyzer;
    let calculator;

    setup(() => {
        mockGitAnalyzer = {
            calculateTechnicalDebt: async (repoPath, filePath) => ({
                score: 55,
                complexity: 320,
                churn: 47,
                age: 12
            })
        };
        calculator = new DebtCalculator(mockGitAnalyzer);
    });

    test('calculateDebt returns debt from analyzer', async () => {
        const result = await calculator.calculateDebt('/repo', '/file.js');
        assert.deepStrictEqual(result, { score: 55, complexity: 320, churn: 47, age: 12 });
    });

    test('describeDebt states the inputs behind the score', () => {
        const description = calculator.describeDebt({ churn: 47, complexity: 320, age: 12 });

        // The point of the sentence is that the reasoning is visible: the
        // reader should see the commit count, the size and the recency.
        assert.ok(description.includes('47 commits'), `missing churn input: ${description}`);
        assert.ok(description.includes('320 lines'), `missing size input: ${description}`);
        assert.ok(description.includes('12 days ago'), `missing age input: ${description}`);
        assert.ok(/churn/i.test(description), `missing churn qualifier: ${description}`);
    });

    test('describeDebt never presents debt as money or hours', () => {
        const description = calculator.describeDebt({ churn: 47, complexity: 320, age: 12 });

        assert.ok(!description.includes('$'), `currency leaked into output: ${description}`);
        assert.ok(!/\b(hour|hours|hr|hrs|cost|USD)\b/i.test(description), `time/money estimate leaked: ${description}`);
    });

    test('describeDebt singularizes correctly and handles same-day changes', () => {
        assert.ok(calculator.describeDebt({ churn: 1, complexity: 1, age: 0 })
            .includes('1 commit) on 1 line, last changed today'));
        assert.ok(calculator.describeDebt({ churn: 3, complexity: 40, age: 1 })
            .includes('last changed 1 day ago'));
    });

    test('describeDebt handles null without inventing a figure', () => {
        const description = calculator.describeDebt(null);
        assert.strictEqual(description, 'No history available for this file');
        assert.ok(!description.includes('$'));
    });

    test('formatDebt no longer exists', () => {
        // Removed deliberately: it multiplied an arbitrary score by an invented
        // hourly rate and rendered the product as a currency amount.
        assert.strictEqual(typeof calculator.formatDebt, 'undefined');
    });

    test('getDebtLevel returns correct levels', () => {
        assert.strictEqual(calculator.getDebtLevel({ score: 60 }), 'Critical');
        assert.strictEqual(calculator.getDebtLevel({ score: 25 }), 'High');
        assert.strictEqual(calculator.getDebtLevel({ score: 15 }), 'Medium');
        assert.strictEqual(calculator.getDebtLevel({ score: 5 }), 'Low');
        assert.strictEqual(calculator.getDebtLevel(null), 'Unknown');
    });

    test('forecastDebtHorizon projects the score, not a cost', () => {
        const mockDebt = {
            churn: 50,
            age: 365,
            complexity: 200,
            score: 20
        };
        const forecast = calculator.forecastDebtHorizon(mockDebt, 180);

        assert.ok(forecast.score > mockDebt.score);
        assert.ok(forecast.increasePercent > 0);
        assert.ok(!('cost' in forecast), 'forecast must not carry a cost field');
    });

    test('forecastDebtHorizon handles null', () => {
        assert.strictEqual(calculator.forecastDebtHorizon(null), null);
    });
});
