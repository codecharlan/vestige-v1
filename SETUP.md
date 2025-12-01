# 🗿 Vestige - Setup Guide

## Quick Start

### 1. Installation

```bash
npm install
```

This will install:
- `simple-git` (for git operations)
- VS Code types (for development)

### 2. Run in VS Code

1. Open this folder in VS Code
2. Press **F5** (Start Debugging)
3. A new "Extension Development Host" window opens
4. Open any git-tracked file
5. Watch Vestige analyze it! 🗿

### 3. Packaging

To create a `.vsix` file for distribution:

```bash
npm install -g @vscode/vsce
vsce package
```

## Troubleshooting

### "Module not found: simple-git"
Run `npm install` again.

### "No workspace folder found"
Make sure you've opened a **folder** in VS Code, not just a file.

### No decorations appearing
1. Check if file is git-tracked
2. Toggle annotations: `Ctrl+Shift+P` → "Vestige: Toggle Annotations"
