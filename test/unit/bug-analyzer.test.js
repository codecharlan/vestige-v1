const assert = require('assert');
const BugAnalyzer = require('../../bug-analyzer');

suite('BugAnalyzer Test Suite', () => {
    let mockGitAnalyzer;
    let analyzer;

    setup(() => {
        mockGitAnalyzer = {
            findBugPatterns: async (repoPath, filePath) => ({
                density: 0.25
            })
        };
        analyzer = new BugAnalyzer(mockGitAnalyzer);
    });

    test('analyze returns bug stats from analyzer', async () => {
        const result = await analyzer.analyze('/repo', '/file.js');
        assert.deepStrictEqual(result, { density: 0.25 });
    });

    test('getRiskLevel returns correct levels', () => {
        assert.strictEqual(analyzer.getRiskLevel({ density: 0.25 }), 'High');
        assert.strictEqual(analyzer.getRiskLevel({ density: 0.15 }), 'Medium');
        assert.strictEqual(analyzer.getRiskLevel({ density: 0.05 }), 'Low');
        assert.strictEqual(analyzer.getRiskLevel(null), 'Unknown');
    });
});
