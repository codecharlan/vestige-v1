const assert = require('assert');
const AIService = require('../../ai-service');
const vscode = require('vscode');

suite('AIService Test Suite', () => {
    let service;
    let originalGetConfiguration;

    setup(() => {
        service = new AIService();
        originalGetConfiguration = vscode.workspace.getConfiguration;

        // Mock global fetch
        global.fetch = async (url, options) => {
            return {
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'AI Explanation' } }]
                })
            };
        };
    });

    teardown(() => {
        vscode.workspace.getConfiguration = originalGetConfiguration;
        delete global.fetch;
    });

    test('explainCommit throws error if no API key', async () => {
        await assert.rejects(
            async () => await service.explainCommit('diff', 'msg', null),
            /API key not configured/
        );
    });

    test('explainCommit returns explanation', async () => {
        const result = await service.explainCommit('diff', 'msg', 'test-key');
        assert.strictEqual(result, 'AI Explanation');
    });

    test('explainText throws error if no API key configured', async () => {
        vscode.workspace.getConfiguration = (section) => ({
            get: (key) => null
        });

        await assert.rejects(
            async () => await service.explainText('prompt'),
            /API key not configured/
        );
    });

    test('explainText returns explanation when key configured', async () => {
        vscode.workspace.getConfiguration = (section) => ({
            get: (key) => 'config-key'
        });

        const result = await service.explainText('prompt');
        assert.strictEqual(result, 'AI Explanation');
    });

    test('analyzeStagnation returns archaeological hypothesis', async () => {
        const result = await service.analyzeStagnation('test.js', 365, 10, 'context');
        assert.ok(result.includes('ARCHAEOLOGICAL HYPOTHESIS'));
    });

    test('suggestRefactoring returns ROI intel', async () => {
        const result = await service.suggestRefactoring('test.js', 50, 100);
        assert.ok(result.includes('REFACTORING INTEL'));
    });
});
