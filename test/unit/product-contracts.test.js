const assert = require('assert');
const fs = require('fs');
const path = require('path');

/**
 * Contracts behind the product decisions taken in the 2026-09 review.
 * These are deliberately about *what we promise the user*, so that a future
 * change quietly reintroducing a fabricated number or a per-person ranking
 * fails the suite rather than shipping.
 */
suite('Product Contracts Suite', () => {

    const src = (f) => fs.readFileSync(path.join(__dirname, '../../src', f), 'utf8');

    test('technical debt is never expressed as money', () => {
        // The old implementation multiplied an arbitrary score by $50/hr and
        // called the product an "estimated remediation cost".
        const analyzer = src('git-analyzer.ts');
        assert.ok(!/cost:\s*estimatedCost/.test(analyzer), 'git-analyzer must not return a cost field');
        assert.ok(!/estimatedCost\s*=/.test(analyzer), 'no cost should be computed at all');

        const calculator = src('debt-calculator.ts');
        assert.ok(!/\$\$\{/.test(calculator), 'debt-calculator must not format currency');
        assert.ok(calculator.includes('describeDebt'), 'debt must be describable by its inputs');

        const dashboard = src('dashboard-panel.ts');
        assert.ok(!/\$\$\{/.test(dashboard), 'dashboard must not render a currency figure');
    });

    test('no per-person leaderboard exists', () => {
        // Ranking named colleagues on git stats is an enterprise blocker and
        // is not supported by the evidence; private achievements are fine.
        assert.ok(
            !fs.existsSync(path.join(__dirname, '../../src/leaderboard-panel.ts')),
            'leaderboard-panel.ts must not exist'
        );
        const extension = src('extension.ts');
        assert.ok(!/leaderboardPanel/.test(extension), 'no leaderboard registration should remain');
        assert.ok(!/showLeaderboard/.test(extension), 'no leaderboard command should remain');
    });

    test('coupling surfaces use file coupling, not author proximity', () => {
        // findKnowledgeProximity returns AUTHOR names. Three surfaces used to
        // render them in tables headed "File".
        const analyzer = src('git-analyzer.ts');
        assert.ok(
            analyzer.includes('findFrequentCollaborators'),
            'author proximity must be named for what it returns'
        );
        assert.ok(
            !/knowledgeNeighbors:\s*graph/.test(analyzer),
            'analysis must not expose author names as knowledgeNeighbors'
        );
        assert.ok(analyzer.includes('coupledFiles'), 'analysis must expose real file coupling');

        const well = src('gravity-well-panel.ts');
        assert.ok(
            /analysis\.coupledFiles/.test(well),
            'gravity well must plot coupled files, not authors'
        );
    });

    test('co-change suggestions are bounded, evidenced and switchable off', () => {
        const extension = src('extension.ts');
        assert.ok(extension.includes('suggestCoupledFiles'), 'the feature must exist');
        assert.ok(
            extension.includes('coupledFileSuggestions'),
            'must honour a setting so users can turn it off'
        );
        assert.ok(
            extension.includes('couplingNotified'),
            'must be once-per-file-per-session rather than repeated'
        );
        assert.ok(
            /shared commits/.test(extension),
            'must state the evidence (shared commit count) in the message'
        );
        assert.ok(/\.slice\(0,\s*3\)/.test(extension), 'must show at most three suggestions');

        const pkg = JSON.parse(src('../package.json'));
        assert.ok(
            pkg.contributes.configuration.properties['vestige.coupledFileSuggestions'],
            'the setting must be declared so it is discoverable'
        );
    });

    test('AI answers carry the evidence they were drawn from', () => {
        const ai = src('ai-service.ts');
        assert.ok(ai.includes('_collectEvidence'), 'evidence must be assembled');
        assert.ok(
            /return\s*\{\s*answer,\s*evidence\s*\}/.test(ai),
            'askHistorian must return evidence alongside the answer'
        );

        const extension = src('extension.ts');
        assert.ok(
            /What this is based on/.test(extension),
            'the historian panel must render its sources'
        );
    });

    test('AI can be made unreachable, not merely idle', () => {
        // Corporate scanners flag installed AI components, not enabled ones.
        const ai = src('ai-service.ts');
        assert.ok(ai.includes('isAIDisabled'), 'a master switch must exist');
        assert.ok(
            /isAIDisabled\(\)\)\s*(return|throw)/.test(ai.replace(/\s+/g, ' ')) ||
            ai.includes('if (this.isAIDisabled())'),
            'the switch must short-circuit the model paths'
        );
    });

    test('CodeLens stays quiet by default', () => {
        const pkg = JSON.parse(src('../package.json'));
        const mode = pkg.contributes.configuration.properties['vestige.codeLensMode'];
        assert.ok(mode, 'codeLensMode must be declared');
        assert.strictEqual(mode.default, 'risk-only', 'the default must be the restrained mode');

        const lens = src('temporal-codelens.ts');
        assert.ok(lens.includes('MAX_LENSES_PER_FILE'), 'lens count must be bounded');
    });

    test('features are not gated behind earned XP', () => {
        const achievements = src('achievements.ts');
        // isFeatureUnlocked is retained for callers but must always allow.
        assert.ok(
            /isFeatureUnlocked\([^)]*\)\s*\{\s*return true;/.test(achievements.replace(/\/\*[\s\S]*?\*\//g, '')),
            'isFeatureUnlocked must unconditionally return true'
        );
    });
});
