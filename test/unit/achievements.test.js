const assert = require('assert');
const AchievementSystem = require('../../achievements');
const vscode = require('vscode');

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

    test('isFeatureUnlocked handles credit-based locks', async () => {
        assert.strictEqual(achievements.isFeatureUnlocked('wormhole'), false);
        await achievements.addCredits(500);
        assert.strictEqual(achievements.isFeatureUnlocked('wormhole'), true);
    });

    test('isFeatureUnlocked handles achievement-based locks', async () => {
        assert.strictEqual(achievements.isFeatureUnlocked('timeMachine'), false);
        // Simulate achievement unlock
        await mockStorage.update('vestige.unlocked', ['time_traveler']);
        assert.strictEqual(achievements.isFeatureUnlocked('timeMachine'), true);
    });

    test('isFeatureUnlocked handles complexity-based locks', async () => {
        assert.strictEqual(achievements.isFeatureUnlocked('ghostCursor'), false);
        await mockStorage.update('vestige.unlocked', ['a1', 'a2', 'a3']);
        assert.strictEqual(achievements.isFeatureUnlocked('ghostCursor'), true);
    });
});
