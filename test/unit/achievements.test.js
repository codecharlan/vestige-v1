const assert = require('assert');
const AchievementSystem = require('../../dist/achievements');

suite('Achievements Test Suite', () => {
    let achievements;
    let mockStorage;

    setup(() => {
        const state = {};
        mockStorage = {
            get: (key) => state[key],
            update: async (key, value) => { state[key] = value; }
        };
        const mockContext = { globalState: mockStorage };
        achievements = new AchievementSystem(mockContext);
    });

    test('trackAction awards credits', async () => {
        await achievements.trackAction('viewOldFile', 1);
        assert.strictEqual(achievements.getCredits(), 10);
    });

    /**
     * Features must never be withheld pending XP. These tests previously
     * asserted the opposite — that the Time Machine, Wormhole, Ghost Cursor
     * and AI Archaeologist stayed locked until the user had earned enough
     * credits — which meant a new install advertised features it refused to
     * run. The contract is now: achievements reward usage, they never gate it.
     */
    test('features are available immediately on a fresh install', () => {
        assert.strictEqual(achievements.getCredits(), 0);
        ['wormhole', 'timeMachine', 'ghostCursor', 'aiArchaeologist'].forEach(feature => {
            assert.strictEqual(
                achievements.isFeatureUnlocked(feature), true,
                `${feature} must not be gated behind XP`
            );
        });
    });

    test('features stay available after earning credits', async () => {
        await achievements.addCredits(500);
        assert.strictEqual(achievements.isFeatureUnlocked('wormhole'), true);
        assert.strictEqual(achievements.isFeatureUnlocked('aiArchaeologist'), true);
    });

    test('unknown feature ids are permitted rather than blocked', () => {
        assert.strictEqual(achievements.isFeatureUnlocked('somethingNew'), true);
    });

    test('achievement progress is still tracked and reportable', async () => {
        await achievements.trackAction('viewOldFile', 1);
        const progress = achievements.getProgress();
        assert.ok(Array.isArray(progress), 'getProgress must return a list');
        assert.ok(progress.length > 0, 'there should be achievements to report');
        assert.ok(achievements.getCredits() > 0, 'credits should accrue from usage');
    });
});
