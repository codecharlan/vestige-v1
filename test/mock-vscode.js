const mockVscode = {
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/test' }, name: 'test' }],
        getConfiguration: () => ({
            get: (key) => {
                if (key === 'openaiApiKey') return 'test-key';
                return null;
            }
        }),
        getWorkspaceFolder: () => ({ uri: { fsPath: '/test' }, name: 'test' })
    },
    Uri: {
        file: (path) => ({ fsPath: path, path }),
        parse: (path) => ({ path })
    },
    window: {
        showInformationMessage: async () => { },
        showErrorMessage: async () => { },
        showWarningMessage: async () => { },
        createWebviewPanel: () => ({
            webview: { html: '' },
            onDidDispose: () => { },
            reveal: () => { }
        }),
        ViewColumn: { One: 1 }
    },
    commands: {
        registerCommand: () => { }
    }
};

module.exports = mockVscode;
