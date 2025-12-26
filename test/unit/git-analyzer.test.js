const assert = require('assert');
const GitAnalyzer = require('../../git-analyzer');
const vscode = require('vscode');

suite('GitAnalyzer Unit Test Suite', () => {
    let analyzer;

    setup(() => {
        analyzer = new GitAnalyzer();
        // Mock git to avoid filesystem checks
        analyzer.git = {
            raw: async () => '',
            revparse: async () => 'stable-hash'
        };
    });

    test('calculateOwnership handles empty lines', () => {
        const result = analyzer.calculateOwnership([]);
        assert.strictEqual(result.topAuthor, 'None');
        assert.strictEqual(result.percent, 0);
    });

    test('calculateOwnership correctly identifies top author', () => {
        const lines = [
            { author: 'Alice' },
            { author: 'Alice' },
            { author: 'Bob' }
        ];
        const result = analyzer.calculateOwnership(lines);
        assert.strictEqual(result.topAuthor, 'Alice');
        assert.strictEqual(result.percent, 67);
    });

    test('calculateOriginalityIndex calculates correctly', () => {
        const oldDate = new Date();
        oldDate.setFullYear(oldDate.getFullYear() - 3);
        const lines = [
            { author: 'Alice', date: new Date() },
            { author: 'Bob', date: oldDate }
        ];
        const result = analyzer.calculateOriginalityIndex(lines);
        assert.strictEqual(result, 50);
    });

    test('analyzeFile uses cache if available', async () => {
        const mockContext = {
            globalState: {
                get: (key) => JSON.stringify({ filePath: 'test.js', stability: 100 }),
                update: () => { }
            }
        };

        const result = await analyzer.analyzeFile('.', 'test.js', false, mockContext);
        assert.strictEqual(result.stability, 100);
    });
});
