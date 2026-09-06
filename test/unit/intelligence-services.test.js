const assert = require('assert');
const { HandoffAssistant, MentorshipMatcher } = require('../../dist/intelligence-services');
const vscode = require('vscode');

suite('IntelligenceServices Unit Test Suite', () => {
    let gitAnalyzer;

    setup(() => {
        gitAnalyzer = {
            analyzeFile: async () => ({ lines: [] }),
            calculateOwnership: () => ({ topAuthor: 'Test', percent: 100 }),
            detectHotPotato: async () => ([
                { file: 'src/churny.js', authorCount: 7, commits: 42 }
            ])
        };

        // Mock vscode.workspace
        vscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file('/test') }];
        vscode.workspace.getWorkspaceFolder = () => ({ uri: vscode.Uri.file('/test') });
    });

    test('HandoffAssistant identifies risks from real hot-potato data', async () => {
        const assistant = new HandoffAssistant(gitAnalyzer);
        const risks = await assistant.identifyRisks('/test');
        assert.ok(Array.isArray(risks));
        assert.ok(risks.length > 0);
        assert.strictEqual(risks[0].file, 'src/churny.js');
        assert.strictEqual(risks[0].authorCount, 7);
        assert.ok(risks[0].riskScore > 0);
    });

    test('HandoffAssistant returns empty list when analysis fails', async () => {
        const assistant = new HandoffAssistant({
            detectHotPotato: async () => { throw new Error('boom'); }
        });
        const risks = await assistant.identifyRisks('/test');
        assert.deepStrictEqual(risks, []);
    });

    test('MentorshipMatcher recommends experts', async () => {
        const matcher = new MentorshipMatcher(gitAnalyzer);
        const experts = await matcher.findExpertsForFile(vscode.Uri.file('test.js'));
        assert.ok(Array.isArray(experts));
        assert.ok(experts.length > 0);
        assert.strictEqual(experts[0].expert, 'Test');
    });
});
