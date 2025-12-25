const assert = require('assert');
const AIService = require('../../ai-service');
const vscode = require('vscode');

suite('AIService Integration Test Suite', () => {
    let service;
    let mockGitAnalyzer;

    setup(() => {
        service = new AIService();
        mockGitAnalyzer = {
            git: {
                show: async () => 'diff content',
                raw: async () => 'commit message'
            }
        };
        // Mock vscode config
        vscode.workspace.getConfiguration = () => ({
            get: (key) => 'test-api-key'
        });

        global.fetch = async () => ({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'Explanation' } }] })
        });
    });

    test('explainDiff exists and handles git interactions', async () => {
        if (typeof service.explainDiff !== 'function') {
            throw new Error('explainDiff is not a function');
        }

        const result = await service.explainDiff('/path/to/file', 'hash', mockGitAnalyzer, '/repo/path');
        assert.strictEqual(result, 'Explanation');
    });
});
