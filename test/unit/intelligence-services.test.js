const assert = require('assert');
const { HandoffAssistant, MentorshipMatcher } = require('../../intelligence-services');
const vscode = require('vscode');

suite('IntelligenceServices Unit Test Suite', () => {
    let gitAnalyzer;

    setup(() => {
        gitAnalyzer = {
            analyzeFile: async () => ({ lines: [] }),
            calculateOwnership: () => ({ topAuthor: 'Test', percent: 100 })
        };

        // Mock vscode.workspace
        vscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file('/test') }];
        vscode.workspace.getWorkspaceFolder = () => ({ uri: vscode.Uri.file('/test') });
    });

    test('HandoffAssistant identifies risks', async () => {
        const assistant = new HandoffAssistant(gitAnalyzer);
        const risks = await assistant.identifyRisks();
        assert.ok(Array.isArray(risks));
        assert.ok(risks.length > 0);
        assert.strictEqual(risks[0].status, 'Orphaned');
    });

    test('MentorshipMatcher recommends experts', async () => {
        const matcher = new MentorshipMatcher(gitAnalyzer);
        const experts = await matcher.findExpertsForFile(vscode.Uri.file('test.js'));
        assert.ok(Array.isArray(experts));
        assert.ok(experts.length > 0);
        assert.strictEqual(experts[0].expert, 'Test');
    });
});
