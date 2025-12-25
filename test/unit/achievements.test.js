const assert = require('assert');
const achievements = require('../../achievements');

suite('Achievements Test Suite', () => {
    setup(() => {
        // Reset achievements state
        achievements.credits = 0;
        achievements.unlocked = [];
    });

    test('trackAction awards credits', () => {
        achievements.trackAction('test_action', 5);
        assert.strictEqual(achievements.getCredits(), 50);
    });

    test('isFeatureUnlocked handles credit-based locks', () => {
        assert.strictEqual(achievements.isFeatureUnlocked('wormhole'), false);
        achievements.addCredits(500);
        assert.strictEqual(achievements.isFeatureUnlocked('wormhole'), true);
    });

    test('isFeatureUnlocked handles achievement-based locks', () => {
        assert.strictEqual(achievements.isFeatureUnlocked('timeMachine'), false);
        achievements.unlocked.push('time_traveler');
        assert.strictEqual(achievements.isFeatureUnlocked('timeMachine'), true);
    });

    test('isFeatureUnlocked handles complexity-based locks', () => {
        assert.strictEqual(achievements.isFeatureUnlocked('ghostCursor'), false);
        achievements.unlocked = ['a1', 'a2', 'a3'];
        assert.strictEqual(achievements.isFeatureUnlocked('ghostCursor'), true);
    });
});
