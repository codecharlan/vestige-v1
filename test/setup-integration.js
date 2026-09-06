/**
 * Harness for the integration suite.
 *
 * Deliberately different from `setup.js`: that one stubs `simple-git` to
 * return empty strings, which makes a malformed git query indistinguishable
 * from an empty repository. These tests exist to catch exactly that, so only
 * the `vscode` module is faked here — git runs for real.
 */
const mockVscode = require('./mock-vscode');
const Module = require('module');

const originalRequire = Module.prototype.require;
Module.prototype.require = function (request) {
    if (request === 'vscode') {
        return mockVscode;
    }
    // simple-git is intentionally NOT intercepted.
    return originalRequire.apply(this, arguments);
};

console.log('Integration harness: real git, mocked vscode');
