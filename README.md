<p align="center">
  <img src="images/icon.png" width="160" alt="Vestige Logo">
</p>

# 🗿 Vestige - Temporal Code Intelligence

> *Uncover the traces of your codebase through time*

Vestige brings **temporal awareness** directly into your code editor. See which code is ancient, which is churning, and which just changed—all without leaving your file.

## ✨ Features

### 🗺️ Heatmap Explorer
Files in the VS Code Explorer are automatically color-coded based on their git history:
- 🔥 **High Churn** - Files that change frequently (red indicator)
- 🗿 **Fossils** - Ancient, untouched code (grey indicator)
- ✨ **Recent** - Fresh changes (green indicator)

### Inline Temporal Annotations
Vestige analyzes your git history and adds intuitive indicators right in your editor:
- 🔥 **High Churn** - Code that's been modified frequently (default: 10+ changes)
- 🗿 **Fossils** - Ancient, untouched code (default: 1+ year old)
- ✨ **Recent** - Fresh changes (less than 7 days old)

### Rich Status Bar
Live metrics displayed in your status bar:
- **Stability Score** (0-100%): How stable is this file?
- **Top Contributor**: Who "owns" this file?
- Example: `🛡️ 85% | 👤 Sarah (60%)`

### Rich Hover Information
Hover over any line to see:
- When it was last changed
- Who modified it
- Commit hash and date
- File-level statistics (total commits, contributors, churn rate)

### 🕰️ Time Travel
View the complete commit history of your file in a beautiful timeline:
- Chronological commit list
- Author information
- Commit messages
- **👁️ View File at Commit** - Click to see exactly what the file looked like at that point in time
- File evolution statistics

### 🔍 Smart Refactoring Hints
Discover architectural insights:
- **Coupled Files** - Files that frequently change together with your current file
- Helps identify hidden dependencies and potential refactoring opportunities
- Example: "🔗 Coupled with: `utils.js` (80% correlation)"

## 🚀 Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Vestige"
4. Click Install

## 📖 Usage

### Automatic Analysis
Vestige automatically analyzes files when you open them (if they're tracked by git).

### Manual Commands
- **Vestige: Analyze Current File** - Force re-analysis
- **Vestige: Show File Timeline** - Open timeline view in sidebar
- **Vestige: Toggle Annotations** - Turn decorations on/off
- **Vestige: Clear Cache** - Clear analysis cache

## ⚙️ Configuration

Customize Vestige in your VS Code settings:

```json
{
  "vestige.enabled": true,
  "vestige.churnThreshold": 10,
  "vestige.fossilThreshold": 365,
  "vestige.showInlineAnnotations": true
}
```

## 🎯 Use Cases

### Code Review
Quickly identify risky areas:
- High churn zones that might have bugs
- Ancient code that might need refactoring
- Recent changes that need attention
- Files with shared ownership (many contributors)

### Onboarding
Understand codebase history:
- See which code is stable vs. evolving
- Identify key contributors and "owners"
- Understand refactoring patterns
- Discover coupling between components

### Architecture Analysis
Observe patterns over time:
- Track module stability
- Identify tightly coupled files
- Find "hidden dependencies"
- Measure code evolution

## 🔧 Requirements

- VS Code 1.80.0 or higher
- Git repository (Vestige only works with git-tracked files)

## 🐛 Known Limitations

- Only works with git repositories
- Performance may vary on very large files (10,000+ lines)
- Cache is memory-only (cleared on restart)

## 📝 License

MIT License - see LICENSE file for details

---

**Built with ❤️ for developers who care about code history**

🗿 *Vestige - Because every line has a story*
