const assert = require('assert');
const AIService = require('../../dist/ai-service');
const vscode = require('vscode');

suite('AIService Integration Test Suite', () => {
    let service;
    let mockGitAnalyzer;

    setup(() => {
        service = new AIService();
        // explainDiff uses repo-scoped analyzer methods, not the analyzer's
        // internal `git` handle (which is bound to the extension host's cwd).
        mockGitAnalyzer = {
            getCommitDiff: async () => 'diff content',
            getCommitMessage: async () => 'commit message'
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

    test('explainDiff surfaces git failures instead of silently succeeding', async () => {
        const failing = {
            getCommitDiff: async () => { throw new Error('no such commit'); },
            getCommitMessage: async () => 'commit message'
        };

        await assert.rejects(
            () => service.explainDiff('/path/to/file', 'hash', failing, '/repo/path'),
            /Could not retrieve commit details/
        );
    });
});
