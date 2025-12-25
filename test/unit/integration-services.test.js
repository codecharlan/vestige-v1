const assert = require('assert');
const IntegrationServices = require('../../integration-services');
const vscode = require('vscode');

suite('IntegrationServices Unit Test Suite', () => {
    let service;

    setup(() => {
        service = new IntegrationServices({ extensionUri: vscode.Uri.file('/test') });
    });

    test('createJiraTicket shows information message', async () => {
        // Since we simulate messages, we just ensure it doesn't throw
        await service.createJiraTicket('test.js', 'Description');
    });

    test('notifySlack checks for webhook configuration', async () => {
        // Mocking config to return null
        const originalGet = vscode.workspace.getConfiguration('').get;
        vscode.workspace.getConfiguration = () => ({ get: () => null });

        await service.notifySlack('message');
        // If it reaches here without error, it handled the missing config gracefully
    });
});
