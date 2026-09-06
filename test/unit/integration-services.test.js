const assert = require('assert');
const IntegrationServices = require('../../dist/integration-services');
const vscode = require('vscode');

/**
 * These replace two tests that only asserted "it didn't throw" — which passed
 * just as happily when the methods faked success without making a request.
 * Each case here checks what the user is actually told.
 */
suite('IntegrationServices Unit Test Suite', () => {
    let service;
    let warned;
    let informed;
    let errored;
    let originalFetch;

    setup(() => {
        service = new IntegrationServices({ extensionUri: vscode.Uri.file('/test') });
        warned = [];
        informed = [];
        errored = [];
        originalFetch = global.fetch;
        vscode.window.showWarningMessage = async (msg) => { warned.push(msg); return undefined; };
        vscode.window.showInformationMessage = async (msg) => { informed.push(msg); };
        vscode.window.showErrorMessage = async (msg) => { errored.push(msg); };
    });

    teardown(() => {
        global.fetch = originalFetch;
    });

    test('warns and sends nothing when no webhook is configured', async () => {
        vscode.workspace.getConfiguration = () => ({ get: () => null });
        let called = false;
        global.fetch = async () => { called = true; return { ok: true }; };

        const sent = await service.notifyWebhook('hello');

        assert.strictEqual(sent, false, 'must report that nothing was sent');
        assert.strictEqual(called, false, 'must not attempt a request without a webhook');
        assert.ok(warned.length > 0, 'must tell the user nothing was shared');
    });

    test('posts the message and reports success', async () => {
        vscode.workspace.getConfiguration = () => ({ get: () => 'https://hooks.example.com/abc' });
        let body = null;
        global.fetch = async (url, opts) => { body = JSON.parse(opts.body); return { ok: true }; };

        const sent = await service.notifyWebhook('a message');

        assert.strictEqual(sent, true);
        assert.strictEqual(body.text, 'a message', 'the message must actually be transmitted');
        assert.ok(informed.length > 0, 'must confirm to the user');
    });

    test('reports a rejected webhook instead of claiming success', async () => {
        vscode.workspace.getConfiguration = () => ({ get: () => 'https://hooks.example.com/abc' });
        global.fetch = async () => ({ ok: false, status: 403 });

        const sent = await service.notifyWebhook('a message');

        assert.strictEqual(sent, false);
        assert.ok(errored.some(m => /403/.test(m)), 'must surface the status code');
        assert.strictEqual(informed.length, 0, 'must never report success on a rejection');
    });

    test('reports a network failure instead of claiming success', async () => {
        vscode.workspace.getConfiguration = () => ({ get: () => 'https://hooks.example.com/abc' });
        global.fetch = async () => { throw new Error('ENOTFOUND'); };

        const sent = await service.notifyWebhook('a message');

        assert.strictEqual(sent, false);
        assert.ok(errored.length > 0);
        assert.strictEqual(informed.length, 0);
    });

    test('integrations that were never implemented are gone, not stubbed', () => {
        // These only ever reported "not configured". A menu entry that can
        // only ever decline is worse than no menu entry.
        assert.strictEqual(typeof service.createJiraTicket, 'undefined');
        assert.strictEqual(typeof service.syncToConfluence, 'undefined');
    });
});
