export {};
const vscode = require('vscode');

/**
 * VestigeCodeLensProvider — Temporal CodeLens
 * =============================================
 * Surfaces history where a change is about to be made — but sparingly.
 *
 * Default mode is `risk-only`: at most one lens per function, and only when
 * history says something worth interrupting for (a recorded decision, a churn
 * hotspot, long stagnation, or concentrated ownership). `detailed` restores
 * per-function author/age annotation for people who want it; `off` disables.
 *
 * Registered via: vscode.languages.registerCodeLensProvider({scheme:'file'}, provider)
 */

/** Upper bound so a huge generated file can't flood the editor with lenses. */
const MAX_LENSES_PER_FILE = 40;

class VestigeCodeLensProvider { [key: string]: any;
    constructor(gitAnalyzer, aiService, loreService) {
        this.gitAnalyzer = gitAnalyzer;
        this.aiService = aiService;
        this.loreService = loreService;

        /** filePath → analysis result cache (updated when decorations refresh) */
        this._analysisCache = new Map();
        this._maxCacheEntries = 30;

        this._onDidChangeCodeLenses = new vscode.EventEmitter();
        this.onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    }

    /**
     * Called by VS Code to get all CodeLens items for a document.
     */
    /**
     * CodeLens policy: say something only when there is something worth saying.
     *
     * This provider used to emit up to five lenses above every function — an
     * author/age lens, a churn lens, a decision lens, a resurrection offer and
     * an "Ask Historian" lens on every single one. On a thirty-function file
     * that is 150 lenses, which buries the code it is annotating. Annotation
     * noise is the most common complaint levelled at tools in this category,
     * so the default is now `risk-only`: at most ONE lens per function, and
     * only where history actually indicates something (a linked decision, a
     * churn hotspot, long stagnation, or concentrated ownership).
     *
     * Modes (`vestige.codeLensMode`):
     *   off        — no lenses
     *   risk-only  — one lens, only when there's a real signal (default)
     *   detailed   — author/age on every function, plus signals
     */
    async provideCodeLenses(document) {
        const config = vscode.workspace.getConfiguration('vestige');

        // Legacy escape hatch: enableCodeLens=false still disables everything.
        if (!config.get('enableCodeLens', true)) return [];
        const mode = config.get('codeLensMode', 'risk-only');
        if (mode === 'off') return [];

        const filePath = document.uri.fsPath;

        // Get cached analysis — set by extension.ts after a full analysis run
        const analysis = this._analysisCache.get(filePath);
        if (!analysis || !analysis.lines) return [];

        const detailed = mode === 'detailed';
        const lenses = [];
        const text = document.getText();
        const functionRegex = this._getFunctionRegex(document.languageId);

        // Ownership signal is per-file, so compute it once rather than per
        // function. Bird et al. (FSE 2011) found the actionable ownership
        // signal is "you are a minor contributor here", not a bus-factor score.
        const ownershipHint = this._ownershipHint(analysis);

        let match;
        let annotated = 0;
        while ((match = functionRegex.exec(text)) !== null) {
            if (annotated >= MAX_LENSES_PER_FILE) break;

            const startPos = document.positionAt(match.index);
            const range = new vscode.Range(startPos, startPos);

            // Find the blame line for this position
            const lineNo = startPos.line + 1; // 1-indexed
            const blameLine = analysis.lines.find(l => l.lineNo === lineNo)
                || analysis.lines.find(l => l.lineNo >= lineNo - 3 && l.lineNo <= lineNo);

            if (!blameLine) continue;

            const ageDays = this._daysSince(blameLine.date);
            const author = blameLine.author || 'Unknown';
            const hash = blameLine.hash?.substring(0, 7) || '';

            // Highest-value signal wins; we emit one lens, not a stack.
            const linkedDecision = this._findLinkedDecision(analysis, lineNo, filePath);
            const churnLevel = this._churnLevel(analysis, lineNo);
            const isStagnant = ageDays > 365 && analysis.churn?.totalCommits > 10;

            let lens = null;

            if (linkedDecision) {
                // A recorded decision constrains this code — the most
                // actionable thing we can tell someone about to change it.
                const shortTitle = linkedDecision.title && linkedDecision.title.length > 48
                    ? `${linkedDecision.title.substring(0, 48)}…`
                    : linkedDecision.title;
                lens = {
                    title: `📖 ${shortTitle || `Decision ${linkedDecision.id}`}`,
                    tooltip: `A recorded decision covers this code:\n${linkedDecision.title}`,
                    command: 'vestige.showLoreDecision',
                    arguments: [linkedDecision.id],
                };
            } else if (churnLevel) {
                lens = {
                    title: `${churnLevel.label} · ${author}`,
                    tooltip: `${churnLevel.tooltip}\nLast touched by ${author} in ${hash}.`,
                    command: 'vestige.showTimeline',
                    arguments: [],
                };
            } else if (isStagnant) {
                lens = {
                    title: `🗿 Untouched ${Math.floor(ageDays / 365)}y · ${author}`,
                    tooltip: `Unchanged for ${ageDays} days while the rest of the file moved.\nAsk before assuming it's safe to change.`,
                    command: 'vestige.showCommitInTimeline',
                    arguments: [blameLine.hash],
                };
            } else if (ownershipHint) {
                lens = {
                    title: ownershipHint.title,
                    tooltip: ownershipHint.tooltip,
                    command: 'vestige.findExperts',
                    arguments: [],
                };
            } else if (detailed) {
                lens = {
                    title: `👤 ${author} · ${this._formatAge(ageDays)}`,
                    tooltip: `Last touched by ${author} in commit ${hash}`,
                    command: 'vestige.showCommitInTimeline',
                    arguments: [blameLine.hash],
                };
            }

            if (!lens) continue;

            lenses.push(new vscode.CodeLens(range, lens));
            annotated++;

            // In detailed mode only, offer the resurrection path alongside.
            if (detailed && isStagnant) {
                lenses.push(new vscode.CodeLens(range, {
                    title: `💀 Resurrect with ${author}'s Ghost`,
                    tooltip: 'Re-implement this with the original author\'s style',
                    command: 'vestige.resurrectWithGhost',
                    arguments: [filePath, lineNo, author],
                }));
            }
        }

        return lenses;
    }

    /**
     * "Most of this file is someone else's work" — surfaced once per file.
     * Only fires when ownership is genuinely concentrated, so it stays rare.
     */
    _ownershipHint(analysis) {
        // Preferred: the minor-contributor signal. Bird et al. (FSE 2011)
        // found this predicted defects better than any other metric Microsoft
        // collected, and unlike a bus-factor score it names an action.
        const risk = analysis.changeRisk;
        if (risk?.shouldSuggestReview && risk.topOwner) {
            return {
                title: `👤 Ask ${risk.topOwner.name} to review`,
                tooltip: `${risk.reason}\nChanges by someone with little history in a file are the strongest known predictor of defects, so a review from its main author is the cheapest way to de-risk this.`,
            };
        }

        // Fallback: highly concentrated ownership, stated as information only.
        const owner = analysis.ownership;
        if (!owner || !owner.topAuthor || owner.topAuthor === 'None' || owner.topAuthor === 'Unknown') {
            return null;
        }
        if ((owner.percent || 0) < 75) return null;

        return {
            title: `👤 ${owner.topAuthor} wrote ${owner.percent}% of this file`,
            tooltip: `Knowledge here is concentrated in one person. Worth a second reader if you're making a substantial change.`,
        };
    }

    _formatAge(days) {
        if (days <= 0) return 'today';
        if (days === 1) return '1 day ago';
        if (days < 30) return `${days} days ago`;
        if (days < 365) return `${Math.round(days / 30)} mo ago`;
        return `${Math.floor(days / 365)}y ago`;
    }

    /**
     * Update the analysis cache for a file path.
     * Called by extension.ts after analysis completes.
     */
    updateCache(filePath, analysis) {
        // Refresh insertion order so the entry counts as most recently used
        this._analysisCache.delete(filePath);
        this._analysisCache.set(filePath, analysis);

        // Cap cache size — evict the oldest entries first
        while (this._analysisCache.size > this._maxCacheEntries) {
            const oldestKey = this._analysisCache.keys().next().value;
            this._analysisCache.delete(oldestKey);
        }

        this._onDidChangeCodeLenses.fire();
    }

    /**
     * Clear cache for a file (e.g., on file close).
     */
    clearCache(filePath) {
        this._analysisCache.delete(filePath);
    }

    // ── Private helpers ───────────────────────────────────────────────

    _daysSince(date) {
        if (!date) return 0;
        const ms = Date.now() - new Date(date).getTime();
        return Math.round(ms / (1000 * 60 * 60 * 24));
    }

    /**
     * Determine churn level for the region around a line number.
     * Uses the analysis.lines density as a proxy for churn heat.
     */
    _churnLevel(analysis, lineNo) {
        const totalCommits = analysis.churn?.totalCommits ?? 0;
        if (totalCommits >= 50) {
            return {
                label: '🔥 High Churn',
                tooltip: `${totalCommits} commits — this area changes frequently. Review carefully.`,
            };
        }
        if (totalCommits >= 20) {
            return {
                label: '⚡ Active',
                tooltip: `${totalCommits} commits — moderately active code.`,
            };
        }
        return null; // Don't show for low-churn — keep it clean
    }

    /**
     * Find a Lore decision linked to a specific line (via implicitLore or relatedCode).
     */
    _findLinkedDecision(analysis, lineNo, filePath) {
        if (!analysis.implicitLore) return null;
        // Find an implicit lore entry near this line
        const nearbyLore = analysis.implicitLore.find(lore => {
            const loreLine = analysis.lines.find(l => l.hash === lore.hash);
            return loreLine && Math.abs(loreLine.lineNo - lineNo) < 5;
        });
        if (!nearbyLore) return null;

        // Prefer a documented Lore decision for this file — those carry a
        // stable id that vestige.showLoreDecision can resolve.
        try {
            const fileDecisions = this.loreService?.getDecisionsForFile?.(filePath) || [];
            if (fileDecisions.length > 0) {
                const decision = fileDecisions[0];
                return { id: decision.id, title: decision.title || String(decision.id) };
            }
        } catch (e) {
            console.error('CodeLens lore lookup failed:', e);
        }

        // Fall back to the implicit lore entry, keyed by its real commit hash
        return { id: nearbyLore.hash?.substring(0, 7), title: nearbyLore.content };
    }

    /**
     * Returns a regex that matches function/method/class definitions
     * in the given language. Falls back to a generic pattern.
     */
    _getFunctionRegex(languageId) {
        const patterns = {
            typescript:  /(?:^|\n)(?:export\s+)?(?:async\s+)?(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(|class\s+\w+|(?:public|private|protected|static|async)\s+\w+\s*\()/g,
            javascript:  /(?:^|\n)(?:export\s+)?(?:async\s+)?(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(|class\s+\w+)/g,
            python:      /(?:^|\n)(?:async\s+)?def\s+\w+|(?:^|\n)class\s+\w+/g,
            rust:        /(?:^|\n)(?:pub\s+)?(?:async\s+)?fn\s+\w+|(?:^|\n)(?:pub\s+)?struct\s+\w+/g,
            go:          /(?:^|\n)func\s+(?:\(\w+\s+\*?\w+\)\s+)?\w+/g,
            java:        /(?:^|\n)\s*(?:(?:public|private|protected|static|abstract|final|synchronized)\s+)*[\w<>\[\]]+\s+\w+\s*\(/g,
        };
        return patterns[languageId] || /(?:^|\n)(?:function\s+\w+|class\s+\w+|def\s+\w+|fn\s+\w+)/g;
    }
}

module.exports = VestigeCodeLensProvider;
