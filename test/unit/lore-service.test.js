const assert = require('assert');
const { LoreParser } = require('../../lore-service');

suite('LoreParser Test Suite', () => {
    let parser;

    setup(() => {
        parser = new LoreParser();
    });

    test('Parse simple key-values', () => {
        const content = `
title: "Test Decision"
status: Accepted
date: 2023-10-27
`;
        const decision = parser.parseLean(content);
        assert.strictEqual(decision.title, 'Test Decision');
        assert.strictEqual(decision.status, 'Accepted');
        assert.strictEqual(decision.date, '2023-10-27');
    });

    test('Parse multi-line strings', () => {
        const content = `
title: "Multi-line Test"
decision: """
This is a multi-line
decision text.
"""
`;
        const decision = parser.parseLean(content);
        assert.strictEqual(decision.title, 'Multi-line Test');
        assert.ok(decision.decision.includes('This is a multi-line'));
        assert.ok(decision.decision.includes('decision text.'));
    });

    test('Parse lists', () => {
        const content = `
related_code: [ "src/foo.js" "src/bar.js" ]
tags: [ api, security ]
`;
        const decision = parser.parseLean(content);
        assert.deepStrictEqual(decision.related_code, ['src/foo.js', 'src/bar.js']);
        assert.deepStrictEqual(decision.tags, ['api', 'security']);
    });

    test('Parse lists with escaped quotes (Robustness)', () => {
        const content = `
related_code: [ "src/foo.js" "src/path with \\"quotes\\".js" ]
`;
        const decision = parser.parseLean(content);
        assert.deepStrictEqual(decision.related_code, ['src/foo.js', 'src/path with "quotes".js']);
    });

    test('Parse mixed content', () => {
        const content = `
title: "Complex Decision"
related_code: [ "src/auth" ]
decision: """
We decided to use JWT.
"""
status: Done
`;
        const decision = parser.parseLean(content);
        assert.strictEqual(decision.title, 'Complex Decision');
        assert.deepStrictEqual(decision.related_code, ['src/auth']);
        assert.ok(decision.decision.includes('We decided to use JWT.'));
        assert.strictEqual(decision.status, 'Done');
    });
});
