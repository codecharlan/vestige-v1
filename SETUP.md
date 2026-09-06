# 🗿 Vestige - Setup Guide

## Quick Start

### 1. Installation

```bash
npm install
npm run compile
```

This will install:
- `simple-git` (for git operations)
- VS Code types, TypeScript, ESLint, Mocha (for development)

### 2. Run in VS Code

1. Open this folder in VS Code
2. Press **F5** (Start Debugging)
3. A new "Extension Development Host" window opens
4. Open any git-tracked file
5. Watch Vestige analyze it! 🗿

### 3. AI features (optional)

The AI features (Historian, Archaeologist, Resurrection Mode, commit explanations)
need an OpenAI API key. Store it securely with:

`Ctrl+Shift+P` → **Vestige: Set OpenAI API Key 🔐**

The key is kept in VS Code Secret Storage (not settings.json). The legacy
`vestige.openaiApiKey` setting still works as a fallback but is not recommended.

### 4. Testing & linting

```bash
npm run test:unit     # mocha unit tests (fast, no VS Code download)
npm run lint          # eslint over src/ and test/
npm run test:integration  # full @vscode/test-electron run (downloads VS Code)
```

### 5. Packaging

To create a `.vsix` file for distribution:

```bash
npm install -g @vscode/vsce
npm run compile
vsce package
```

## IntelliJ plugin

The `intellij/` folder contains the Kotlin port. It needs JDK 17 and network
access to JetBrains repositories:

```bash
cd intellij
../gradle-7.6/bin/gradle buildPlugin   # or a locally installed Gradle 7.6+
```

## Troubleshooting

### "Module not found: simple-git"
Run `npm install` again.

### "No workspace folder found"
Make sure you've opened a **folder** in VS Code, not just a file.

### No decorations appearing
1. Check if file is git-tracked
2. Toggle annotations: `Ctrl+Shift+P` → "Vestige: Toggle Annotations"

### CodeLens not showing
Check the `vestige.enableCodeLens` setting.
