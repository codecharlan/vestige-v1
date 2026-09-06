const assert = require('assert');

/**
 * Regression tests for the security defects fixed in the 2026-09 audit.
 * These guard against reintroducing shell injection, code execution of
 * repo history, and unescaped git data in webview HTML.
 */
suite('Security Regression Suite', () => {

    test('time-travel panel never builds a shell string for git show', () => {
        const source = require('fs').readFileSync(
            require('path').join(__dirname, '../../src/time-travel-panel.ts'), 'utf8');

        // exec() interpolating a hash is the original injection vector
        assert.ok(!/\bexec\(/.test(source.replace(/execFile\(/g, '')),
            'time-travel-panel must use execFile, not exec');
        assert.ok(source.includes("execFile('git'"), 'should invoke git via execFile arg vector');
        assert.ok(/\[0-9a-f\]\{7,40\}/.test(source), 'commit hash must be validated');
    });

    test('time machine does not execute historical code', () => {
        const source = require('fs').readFileSync(
            require('path').join(__dirname, '../../src/time-machine.ts'), 'utf8');

        assert.ok(!source.includes('node "'), 'must not run historical files with node');
        assert.ok(!/\bexec\(/.test(source.replace(/execFile\(/g, '')),
            'must not use shell exec');
        assert.ok(source.includes("execFile('git'"), 'content must be fetched via git show');
    });

    test('wormhole inserts real content, not placeholder text', () => {
        const source = require('fs').readFileSync(
            require('path').join(__dirname, '../../src/wormhole.ts'), 'utf8');

        assert.ok(!source.includes('simulated'), 'must not insert simulated content');
        assert.ok(source.includes('getHistoricalContent'), 'must fetch real historical content');
    });

    test('every script-enabled webview declares a Content-Security-Policy', () => {
        const fs = require('fs');
        const path = require('path');
        const srcDir = path.join(__dirname, '../../src');

        const missing = fs.readdirSync(srcDir)
            .filter(f => f.endsWith('-panel.ts'))
            .filter(f => {
                const source = fs.readFileSync(path.join(srcDir, f), 'utf8');
                const hasWebview = source.includes('createWebviewPanel');
                return hasWebview && !source.includes('Content-Security-Policy');
            });

        assert.deepStrictEqual(missing, [], `panels missing CSP: ${missing.join(', ')}`);
    });

    test('timeline panel escapes git-derived data injected into HTML', () => {
        const source = require('fs').readFileSync(
            require('path').join(__dirname, '../../src/timeline-panel.ts'), 'utf8');

        // escapeJs was unsafe for inline attributes and has been removed
        assert.ok(!source.includes('escapeJs('), 'unsafe escapeJs helper must not return');
        assert.ok(source.includes('attrArgs('), 'inline handler args must be JSON+HTML encoded');
        // </script> breakout guard on inlined JSON
        assert.ok(source.includes("replace(/</g, '\\\\u003c')"),
            'inlined JSON must escape < to prevent script breakout');
    });

    test('document provider validates commit hashes', () => {
        const source = require('fs').readFileSync(
            require('path').join(__dirname, '../../src/document-provider.ts'), 'utf8');
        assert.ok(/\[0-9a-f\]\{4,40\}/.test(source), 'commit segment must be validated');
    });
});
