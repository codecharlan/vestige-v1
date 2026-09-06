export {};
const fs = require('fs');
const path = require('path');

class LoreParser { [key: string]: any;
    /**
     * Parse a decision file (LEAN or JSON)
     */
    parseDecisionFile(filePath, content) {
        try {
            if (filePath.endsWith('.json')) {
                return JSON.parse(content);
            } else {
                return this.parseLean(content);
            }
        } catch (e) {
            console.error(`Failed to parse ${filePath}:`, e);
            return null;
        }
    }

    /**
     * Lightweight LEAN parser for Lore decisions
     * Extracts key fields without full LEAN spec implementation
     */
    parseLean(content) {
        const decision = {};

        // 1. Extract Multi-line strings first (to avoid conflict with other regexes)
        // Matches key: """ ... """
        const multiLineRegex = /([a-z_]+):\s*"""([\s\S]*?)"""/g;
        let match;
        while ((match = multiLineRegex.exec(content)) !== null) {
            decision[match[1]] = match[2].trim();
        }

        // Remove multi-line strings from content to simplify subsequent parsing
        let remaining = content.replace(multiLineRegex, '');

        // 2. Extract Lists
        // Matches key: [ ... ]
        const listRegex = /([a-z_]+):\s*\[([\s\S]*?)\]/g;
        while ((match = listRegex.exec(remaining)) !== null) {
            const key = match[1];
            const rawList = match[2];

            // Parse list items: handles "quoted strings" (with escapes) or bare_words
            const items = [];
            // Regex for items: " ( [^"\\]* (?: \\. [^"\\]* )* ) "  <-- matches quoted string with escapes
            // OR ([^\s,\[\]]+) <-- matches bare word
            const itemRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"|([^\s,\[\]]+)/g;

            let itemMatch;
            while ((itemMatch = itemRegex.exec(rawList)) !== null) {
                if (itemMatch[1] !== undefined) {
                    // Quoted string: unescape it
                    items.push(itemMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
                } else {
                    // Bare word
                    items.push(itemMatch[2]);
                }
            }

            decision[key] = items;
        }

        // Remove lists from content
        remaining = remaining.replace(listRegex, '');

        // 3. Extract Simple Key-Values
        // Matches key: value (rest of line)
        const simpleRegex = /([a-z_]+):\s*(.+)$/gm;
        while ((match = simpleRegex.exec(remaining)) !== null) {
            const key = match[1];
            let value = match[2].trim();

            // Handle quoted strings with escapes
            if (value.startsWith('"') && value.endsWith('"')) {
                // Remove outer quotes and unescape
                value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            }

            decision[key] = value;
        }

        return decision;
    }
}

class LoreService { [key: string]: any;
    constructor() {
        this.decisions = [];
        this.watcher = null;
        this.parser = new LoreParser();
    }

    /**
     * Initialize Lore service
     */
    async initialize(repoPath) {
        const vscode = require('vscode');
        this.repoPath = repoPath;
        await this.scanDecisions();

        // Watch for changes
        const lorePath = path.join(repoPath, '.lore', 'decisions');
        if (fs.existsSync(lorePath)) {
            this.watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(lorePath, '*.{lean,json}')
            );
            this.watcher.onDidChange(() => this.scanDecisions());
            this.watcher.onDidCreate(() => this.scanDecisions());
            this.watcher.onDidDelete(() => this.scanDecisions());
        }
    }

    /**
     * Scan all decisions in .lore/decisions
     */
    async scanDecisions() {
        if (!this.repoPath) return;

        const lorePath = path.join(this.repoPath, '.lore', 'decisions');
        if (!fs.existsSync(lorePath)) {
            this.decisions = [];
            return;
        }

        try {
            const files = fs.readdirSync(lorePath);
            this.decisions = files
                .filter(f => f.endsWith('.lean') || f.endsWith('.json'))
                .map(f => {
                    const content = fs.readFileSync(path.join(lorePath, f), 'utf8');
                    const decision = this.parser.parseDecisionFile(f, content);
                    if (decision && !decision.id) {
                        // Stable fallback id: filename without extension
                        decision.id = path.basename(f, path.extname(f));
                    }
                    return decision;
                })
                .filter(d => d !== null);

            console.log(`Lore: Loaded ${this.decisions.length} decisions`);
        } catch (e) {
            console.error('Lore scan failed:', e);
        }
    }

    /**
     * Get decisions related to a file path
     */
    getDecisionsForFile(filePath) {
        if (!this.repoPath || !filePath) return [];

        const relativePath = path.relative(this.repoPath, filePath);
        const relNorm = relativePath.replace(/\\/g, '/');

        return this.decisions.filter(d => {
            if (!Array.isArray(d.related_code)) return false;

            // Check if any related_code entry matches the file path at a
            // path-segment boundary, e.g. "src/db" matches "src/db/user.js"
            // but not "src/db-legacy/user.js".
            return d.related_code.some(rc => {
                if (typeof rc !== 'string') return false;
                const entryNorm = rc.replace(/\\/g, '/').replace(/\/$/, '');
                if (!entryNorm) return false;
                return entryNorm === relNorm || relNorm.startsWith(entryNorm + '/');
            });
        });
    }

    /**
     * Search decisions by query string
     */
    searchDecisions(query) {
        const lower = query.toLowerCase();
        return this.decisions.filter(d => {
            const title = d.title?.toLowerCase() ?? '';
            // `context` is a flat string in LEAN files, an object with
            // a .problem field in JSON files — search both shapes.
            let contextText = '';
            if (typeof d.context === 'string') {
                contextText = d.context.toLowerCase();
            } else if (d.context && typeof d.context.problem === 'string') {
                contextText = d.context.problem.toLowerCase();
            }
            return title.includes(lower) || contextText.includes(lower);
        });
    }

    /**
     * Show a decision's details in a markdown preview.
     * Matches by exact id, hash-prefix of the id, or title.
     */
    async showDecision(id) {
        const vscode = require('vscode');
        const query = String(id ?? '');
        const decision = this.decisions.find(d => {
            const dId = String(d.id ?? '');
            const dTitle = String(d.title ?? '');
            return dId === query
                || (query.length >= 3 && dId.startsWith(query))
                || dTitle === query;
        });

        if (!decision) {
            vscode.window.showWarningMessage('Decision not found');
            return;
        }

        const lines = [`# ${decision.title || decision.id}`, ''];
        lines.push(`**ID:** ${decision.id}`);
        if (decision.status) lines.push(`**Status:** ${decision.status}`);
        if (decision.date) lines.push(`**Date:** ${decision.date}`);
        if (decision.author) lines.push(`**Author:** ${decision.author}`);
        lines.push('');
        const contextText = typeof decision.context === 'string'
            ? decision.context
            : decision.context?.problem;
        if (contextText) {
            lines.push('## Context', '', contextText, '');
        }
        if (decision.decision) {
            lines.push('## Decision', '', decision.decision, '');
        }
        if (decision.alternatives) {
            lines.push('## Alternatives', '', '```json', JSON.stringify(decision.alternatives, null, 2), '```', '');
        }
        if (Array.isArray(decision.related_code) && decision.related_code.length > 0) {
            lines.push('## Related Code', '');
            decision.related_code.forEach(rc => lines.push(`- \`${rc}\``));
            lines.push('');
        }

        const doc = await vscode.workspace.openTextDocument({
            content: lines.join('\n'),
            language: 'markdown',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    }

    dispose() {
        if (this.watcher) {
            this.watcher.dispose();
        }
    }
}

module.exports = { LoreService, LoreParser };
