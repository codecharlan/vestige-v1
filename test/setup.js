const path = require('path');

// Mock VS Code
const mockVscode = require('./mock-vscode');

// Hook into require
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request) {
    if (request === 'vscode') {
        return mockVscode;
    }
    if (request === 'simple-git') {
        return () => ({
            raw: async () => '',
            revparse: async () => 'stable-hash',
            log: async () => ({ all: [], total: 0 })
        });
    }
    return originalRequire.apply(this, arguments);
};

console.log('VS Code Mock Initialized');
