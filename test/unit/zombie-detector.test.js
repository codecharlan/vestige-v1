const assert = require('assert');
const ZombieDetector = require('../../zombie-detector');
const vscode = require('vscode');

suite('ZombieDetector Test Suite', () => {
    let mockGitAnalyzer;
    let detector;
    let showInformationMessageCalled = false;
    let showQuickPickCalled = false;
    let showTextDocumentCalled = false;

    // Mock vscode window
    const originalWindow = vscode.window;
    const originalWorkspace = vscode.workspace;

    setup(() => {
        mockGitAnalyzer = {
            detectZombieCode: async (repoPath) => []
        };
        detector = new ZombieDetector(mockGitAnalyzer);
        
        showInformationMessageCalled = false;
        showQuickPickCalled = false;
        showTextDocumentCalled = false;

        vscode.window.showInformationMessage = async (msg) => {
            showInformationMessageCalled = true;
            return;
        };
        vscode.window.showQuickPick = async (items) => {
            showQuickPickCalled = true;
            return items[0];
        };
        vscode.workspace.openTextDocument = async (file) => ({});
        vscode.window.showTextDocument = async (doc) => {
            showTextDocumentCalled = true;
        };
    });

    teardown(() => {
        vscode.window = originalWindow;
        vscode.workspace = originalWorkspace;
    });

    test('scan returns zombies from analyzer', async () => {
        const expectedZombies = [{ file: 'old.js', ageDays: 400 }];
        mockGitAnalyzer.detectZombieCode = async () => expectedZombies;
        
        const result = await detector.scan('/test/path');
        assert.deepStrictEqual(result, expectedZombies);
    });

    test('showReport displays info message when no zombies', async () => {
        await detector.showReport([]);
        assert.strictEqual(showInformationMessageCalled, true);
        assert.strictEqual(showQuickPickCalled, false);
    });

    test('showReport displays quickpick when zombies found', async () => {
        const zombies = [{ 
            file: 'old.js', 
            ageDays: 400,
            lastCommit: { message: 'init' }
        }];
        
        await detector.showReport(zombies);
        assert.strictEqual(showInformationMessageCalled, false);
        assert.strictEqual(showQuickPickCalled, true);
        assert.strictEqual(showTextDocumentCalled, true);
    });
});
