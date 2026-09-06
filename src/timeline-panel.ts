export {};
const vscode = require('vscode');
const path = require('path');

class TimelinePanel { [key: string]: any;
    constructor(context) {
        this.context = context;
        this.panel = null;
        this.currentFileName = '';
    }

    /** Map a refactor ROI score onto a semantic tone token (high ROI = urgent). */
    getROITone(roi) {
        const value = Number(roi) || 0;
        if (value > 70) return 'bad';
        if (value > 40) return 'warn';
        return 'good';
    }

    /** Map a refactor safety score onto a semantic tone token (low score = risky). */
    getSafetyTone(score) {
        const value = Number(score) || 0;
        if (value > 70) return 'good';
        if (value > 40) return 'warn';
        return 'bad';
    }

    update(analysis, epochs, busFactor, decisions) {
        if (this.panel && this.panel.visible) {
            analysis.epochs = epochs;
            analysis.busFactor = busFactor;
            analysis.decisions = decisions;
            this.panel.webview.html = this.getWebviewContent(analysis, this.currentFileName);
        }
    }

    setAIResult(command, text) {
        if (this.panel) {
            this.panel.webview.postMessage({ command, text });
        }
    }

    show(analysis, filePath, decisions = []) {
        const fileName = path.basename(filePath);
        this.currentFileName = fileName;
        analysis.decisions = decisions;
        // The message handler is registered once — always read the *current*
        // file/analysis from `this`, never from a captured closure, or every
        // action after the first show() operates on the wrong file.
        this.currentAnalysis = analysis;

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            this.panel.title = `Vestige Timeline: ${fileName}`;
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vestige.timeline',
                `Vestige Timeline: ${fileName}`,
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.context.extensionUri]
                }
            );

            this.panel.webview.onDidReceiveMessage(message => {
                const current = this.currentAnalysis || {};
                const currentFile = this.currentFileName;
                switch (message.command) {
                    case 'viewCommit':
                        vscode.commands.executeCommand('vestige.openFileAtCommit', message.hash, currentFile, current.repoPath);
                        break;
                    case 'promoteLore':
                        vscode.commands.executeCommand('vestige.promoteLore', message.type, message.content, message.hash, current.repoPath, currentFile);
                        break;
                    case 'chatWithGhost':
                        vscode.commands.executeCommand('vestige.chatWithGhost', message.author, message.hash, current.repoPath, currentFile);
                        break;
                    case 'shareLore':
                        vscode.commands.executeCommand('vestige.shareLore', message.loreType, message.content);
                        break;
                    case 'runTimeMachine':
                        vscode.commands.executeCommand('vestige.runTimeMachine', message.hash, currentFile, current.repoPath);
                        break;
                    case 'showGravityWell':
                        vscode.commands.executeCommand('vestige.showGravityWell');
                        break;
                    case 'showPulse':
                        vscode.commands.executeCommand('vestige.showPulse');
                        break;
                    case 'replayGhost':
                        vscode.commands.executeCommand('vestige.replayGhost', message.hash);
                        break;
                    case 'openWormhole':
                        vscode.commands.executeCommand('vestige.openWormhole', message.hash);
                        break;
                    case 'askArchaeologist':
                        vscode.commands.executeCommand('vestige.askArchaeologist', current, currentFile, message.text);
                        break;
                    case 'getRefactorIdeas':
                        vscode.commands.executeCommand('vestige.getRefactorIdeas', current, currentFile);
                        break;
                }
            });

            this.panel.onDidDispose(() => { this.panel = null; });
        }

        this.panel.webview.html = this.getWebviewContent(analysis, fileName);
    }

    /** Scroll the webview to a specific commit (used by vestige.showCommitInTimeline). */
    revealCommit(hash) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            this.panel.webview.postMessage({ command: 'revealCommit', hash });
        }
    }

    getWebviewContent(analysis, fileName) {
        // The object passed by showTimeline is the getFileTimeline() shape:
        // { commits, summary: { total, authors, ... } } plus enrichment fields.
        const commits = analysis.commits || [];
        const summary = analysis.summary || { total: 0, authors: [] };
        const epochs = analysis.epochs || [];
        const busFactor = analysis.busFactor || null;
        const implicitLore = analysis.implicitLore || [];
        const bio = analysis.narrativeBiography || 'Analyzing intelligence...';
        const esc = (v) => this.escapeHtml(String(v ?? ''));
        // Safe inline-onclick argument list: JSON-encode each arg, then
        // HTML-encode the whole attribute payload so quotes can't break out.
        const attrArgs = (...args) => this.escapeHtml(args.map(a => JSON.stringify(String(a ?? ''))).join(', '));

        const cssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'vestige.css'));

        const onboarding = analysis.onboardingRecommendations || {};
        const tour = analysis.onboardingTour || [];
        const ripples = analysis.butterflyRipples || [];
        const echoes = analysis.echoedReviews || [];
        const badges = analysis.badges || [];
        const safetyScore = Number(analysis.safetyScore) || 0;

        const importanceTone = (importance) => {
            const value = Number(importance) || 0;
            if (value > 8) return 'bad';
            if (value > 6) return 'warn';
            return 'accent';
        };
        const importanceLabel = (importance) => {
            const value = Number(importance) || 0;
            if (value > 8) return 'Critical';
            if (value > 6) return 'Important';
            return 'Notable';
        };

        // --- Sections ---------------------------------------------------

        const metricsSection = `
        <section class="v-section">
            <h2 class="v-section-title">File intelligence</h2>
            <div class="v-grid">
                <div class="v-metric">
                    <span class="v-metric-value">${esc(summary.total || commits.length)}</span>
                    <span class="v-metric-label">Changes</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value">${esc(analysis.reputation || 0)}</span>
                    <span class="v-metric-label">Reputation</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value v-metric-value--${(Number(analysis.debtInterest) || 0) > 50 ? 'bad' : 'good'}">${esc(analysis.debtInterest || 0)}</span>
                    <span class="v-metric-label">Debt interest</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value v-metric-value--${this.getROITone(analysis.refactorROI)}">${esc(analysis.refactorROI || 0)}%</span>
                    <span class="v-metric-label">Refactor ROI</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value v-metric-value--${this.getSafetyTone(analysis.safetyScore)}">${esc(safetyScore)}%</span>
                    <span class="v-metric-label">Safety score</span>
                </div>
                ${analysis.debtHorizon ? `
                <div class="v-metric">
                    <span class="v-metric-value v-metric-value--warn">${esc(Number(analysis.debtHorizon.score) || 0)}</span>
                    <span class="v-metric-label">Projected debt score (6 mo, ${(Number(analysis.debtHorizon.increasePercent) || 0) > 0 ? '+' : ''}${esc(Number(analysis.debtHorizon.increasePercent) || 0)}%)</span>
                </div>` : ''}
            </div>
        </section>`;

        const badgesSection = badges.length > 0 ? `
        <section class="v-section">
            <h2 class="v-section-title">Earned badges</h2>
            <div class="v-toolbar">
                ${badges.map(b => `<span class="v-badge">${esc(b.label)}</span>`).join('')}
            </div>
        </section>` : '';

        const busFactorSection = busFactor && busFactor.busFactor > 0 ? `
        <section class="v-section">
            <h2 class="v-section-title">Bus factor</h2>
            <div class="v-card">
                <div class="v-row v-row--between">
                    <span><span class="v-strong">${esc(busFactor.busFactor)}</span> ${busFactor.busFactor === 1 ? 'person owns' : 'people own'} the majority of this file</span>
                    <span class="v-badge v-badge--${busFactor.risk === 'high' ? 'bad' : busFactor.risk === 'medium' ? 'warn' : 'good'}">${esc((busFactor.risk || 'unknown').toUpperCase())} RISK</span>
                </div>
                <div class="v-list" style="margin-top: var(--v-space-3)">
                    ${(busFactor.contributors || []).slice(0, 3).map(c => `
                    <div class="v-list-row">
                        <span class="v-list-row-main v-truncate">${esc(c.name)}</span>
                        <span class="v-list-row-aside v-caption">${esc(c.percent)}% · ${esc(c.linesOwned)} lines</span>
                    </div>`).join('')}
                </div>
            </div>
        </section>` : '';

        const epochsSection = epochs.length > 0 ? `
        <section class="v-section">
            <h2 class="v-section-title">Historical epochs</h2>
            <div class="v-grid v-grid--wide">
                ${epochs.slice(0, 6).map(e => `
                <div class="v-card v-card--tight">
                    <div class="v-strong v-truncate">${esc(e.name)}</div>
                    <div class="v-caption">${esc(e.period)} · ${esc(e.commits)} commits</div>
                </div>`).join('')}
            </div>
        </section>` : '';

        const driftSection = analysis.archDrift ? `
        <section class="v-section">
            <h2 class="v-section-title">Architectural drift</h2>
            <div class="v-note v-note--bad">${esc(analysis.archDrift.message)}</div>
        </section>` : '';

        const refactorSection = safetyScore < 70 ? `
        <section class="v-section">
            <h2 class="v-section-title">Predictive refactoring</h2>
            <div class="v-card">
                <p id="refactor-content" style="margin: 0 0 var(--v-space-3)">The refactor safety score is ${esc(safetyScore)}%, which is low. Ask Vestige for the changes with the best return for the risk.</p>
                <button type="button" class="v-btn" onclick="getRefactorIdeas()">Generate refactor plan</button>
            </div>
        </section>` : '';

        const loreSection = `
        <section class="v-section">
            <div class="v-grid v-grid--halves">
                <div>
                    <h2 class="v-section-title">Ghost lore</h2>
                    <div class="v-card">
                        ${implicitLore.length > 0 ? `<div class="v-list v-scroll-y">
                        ${implicitLore.map(l => `
                            <div class="v-list-row">
                                <div class="v-list-row-main">
                                    <span class="v-badge v-badge--accent">${esc((l.type || '').toUpperCase())}</span>
                                    <div style="margin-top: var(--v-space-1)">${esc(l.content)}</div>
                                </div>
                                <div class="v-list-row-aside v-toolbar" style="justify-content: flex-end">
                                    <button type="button" class="v-btn v-btn--sm" onclick="promoteLore(${attrArgs(l.type, l.content, l.hash)})">Promote</button>
                                    <button type="button" class="v-btn v-btn--sm" onclick="shareLore(${attrArgs(l.type, l.content)})">Share</button>
                                </div>
                            </div>`).join('')}
                        </div>` : `<p class="v-muted" style="margin: 0">No implicit decisions were found in this file's commit messages yet. Lore appears here when commits explain <span class="v-mono">why</span> a change was made.</p>`}
                    </div>
                </div>
                <div>
                    <h2 class="v-section-title">Social echoes</h2>
                    <div class="v-card">
                        ${echoes.length > 0 ? `<div class="v-list v-scroll-y">
                        ${echoes.map(r => `
                            <div class="v-list-row">
                                <div class="v-list-row-main">
                                    <div class="v-caption">${esc(r.author)} · <span class="v-mono">${esc((r.hash || '').substring(0, 7))}</span></div>
                                    <div>${esc(r.content)}</div>
                                </div>
                            </div>`).join('')}
                        </div>` : `<p class="v-muted" style="margin: 0">No review discussion was recovered from this file's history. Echoes appear when commits reference pull-request feedback.</p>`}
                    </div>
                </div>
            </div>
        </section>`;

        const ripplesSection = ripples.length > 0 ? `
        <section class="v-section">
            <h2 class="v-section-title">Predicted downstream impact</h2>
            <div class="v-card">
                <div class="v-table-wrap">
                    <table class="v-table">
                        <thead>
                            <tr>
                                <th scope="col">File</th>
                                <th scope="col">Why</th>
                                <th scope="col" class="v-num">Depth</th>
                                <th scope="col" class="v-num">Impact</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${ripples.map(r => `
                            <tr>
                                <td class="v-mono">${esc(r.file)}</td>
                                <td class="v-muted">${esc(r.reason)}</td>
                                <td class="v-num">${esc(r.depth)}</td>
                                <td class="v-num">${esc(r.strength)}%</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>` : '';

        const factsSection = onboarding.facts ? `
            <div class="v-grid" style="margin-bottom: var(--v-space-4)">
                <div class="v-metric">
                    <span class="v-metric-value">${Math.floor((Number(onboarding.facts.age) || 0) / 365)}y ${(Number(onboarding.facts.age) || 0) % 365}d</span>
                    <span class="v-metric-label">Age</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value">${esc(onboarding.facts.totalCommits)}</span>
                    <span class="v-metric-label">Changes</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value">${esc(onboarding.facts.contributors)}</span>
                    <span class="v-metric-label">Contributors</span>
                </div>
                <div class="v-metric">
                    <span class="v-metric-value">${esc(onboarding.facts.complexity)}</span>
                    <span class="v-metric-label">Lines</span>
                </div>
            </div>` : '';

        const expertsSection = (onboarding.experts || []).length > 0 ? `
            <h3 class="v-section-title">Ask these people first</h3>
            <div class="v-grid v-grid--wide" style="margin-bottom: var(--v-space-4)">
                ${onboarding.experts.map(expert => `
                <div class="v-card v-card--tight">
                    <div class="v-strong v-truncate">${esc(expert.name)}</div>
                    <div class="v-caption" style="margin-bottom: var(--v-space-2)">${esc(expert.role)}</div>
                    <div class="v-row">
                        <div class="v-meter v-spacer"><span class="v-meter-fill" style="width: ${Math.max(0, Math.min(100, Number(expert.ownership) || 0))}%"></span></div>
                        <span class="v-caption v-mono">${esc(expert.ownership)}%</span>
                    </div>
                </div>`).join('')}
            </div>` : '';

        const relatedFilesSection = (onboarding.relatedFiles || []).length > 0 ? `
            <h3 class="v-section-title">Related files</h3>
            <div class="v-card" style="margin-bottom: var(--v-space-4)">
                <div class="v-list">
                    ${onboarding.relatedFiles.map(file => `
                    <div class="v-list-row">
                        <div class="v-list-row-main">
                            <div class="v-mono v-truncate">${esc(file.file)}</div>
                            <div class="v-caption">${esc(file.reason)}</div>
                        </div>
                        <div class="v-list-row-aside v-caption">${esc(file.coupling)}/10 coupling</div>
                    </div>`).join('')}
                </div>
            </div>` : '';

        const milestonesSection = tour.length > 0 ? `
            <h3 class="v-section-title">Key milestones (${tour.length})</h3>
            <ol class="v-timeline" style="margin-bottom: var(--v-space-4)">
                ${tour.map(milestone => `
                <li class="v-timeline-item">
                    <div class="v-card v-card--tight">
                        <div class="v-row v-row--between">
                            <span class="v-caption">${esc(milestone.type)}${milestone.date ? ` · ${esc(new Date(milestone.date).toLocaleDateString())}` : ''}</span>
                            <span class="v-badge v-badge--${importanceTone(milestone.importance)}">${importanceLabel(milestone.importance)}</span>
                        </div>
                        <div style="margin-top: var(--v-space-1)">${esc(milestone.content)}</div>
                        ${milestone.author ? `<div class="v-caption">by ${esc(milestone.author)}</div>` : ''}
                    </div>
                </li>`).join('')}
            </ol>
            <button type="button" class="v-btn v-btn--primary" onclick="startInteractiveTour()">Start guided tour</button>` : '';

        const onboardingSection = tour.length > 0 ? `
        <section class="v-section">
            <h2 class="v-section-title">Onboarding</h2>
            ${analysis.onboardingNarrative ? `<div class="v-note" style="margin-bottom: var(--v-space-4)">
                <div class="v-caption" style="margin-bottom: var(--v-space-1)">Welcome to ${esc(fileName)}</div>
                <p style="margin: 0">${esc(analysis.onboardingNarrative)}</p>
            </div>` : ''}
            ${factsSection}
            ${expertsSection}
            ${relatedFilesSection}
            ${milestonesSection}
        </section>` : '';

        const commitsSection = `
        <section class="v-section">
            <h2 class="v-section-title">Evolution timeline</h2>
            ${commits.length > 0 ? `<ol class="v-timeline">
                ${commits.map(c => {
            const author = c.author_name || c.author || 'Unknown';
            return `
                <li class="v-timeline-item" id="commit-${esc(c.hash || '')}">
                    <div class="v-card v-card--tight">
                        <div class="v-row v-row--between">
                            <span class="v-mono v-muted">${c.hash ? esc(c.hash.substring(0, 7)) : 'HEAD'}</span>
                            <span class="v-caption">${c.date ? esc(new Date(c.date).toLocaleDateString()) : 'unknown date'}</span>
                        </div>
                        <div class="v-strong" style="margin-top: var(--v-space-1)">${esc(author)}</div>
                        <div style="margin-bottom: var(--v-space-3)">${esc(c.message || 'No message')}</div>
                        <div class="v-toolbar">
                            <button type="button" class="v-btn v-btn--sm" onclick="chatWithGhost(${attrArgs(author, c.hash)})">Pair with ghost</button>
                            ${c.hash ? `<button type="button" class="v-btn v-btn--sm" onclick="viewCommit(${attrArgs(c.hash)})">View snapshot</button>` : ''}
                            ${c.hash ? `<button type="button" class="v-btn v-btn--sm" onclick="runTimeMachine(${attrArgs(c.hash)})">Time machine</button>` : ''}
                            ${c.hash ? `<button type="button" class="v-btn v-btn--sm" onclick="replayGhost(${attrArgs(c.hash)})">Replay ghost cursor</button>` : ''}
                            ${c.hash ? `<button type="button" class="v-btn v-btn--sm" onclick="openWormhole(${attrArgs(c.hash)})">Open wormhole</button>` : ''}
                        </div>
                    </div>
                </li>`;
        }).join('')}
            </ol>` : `<div class="v-empty">
                <p class="v-empty-title">No history recorded for this file</p>
                <p class="v-empty-text">Vestige found no commits touching this file. If the workspace is a git repository, commit the file once and reopen the timeline.</p>
            </div>`}
        </section>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'unsafe-inline'; font-src ${this.panel.webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vestige Timeline</title>
    <link rel="stylesheet" href="${cssUri}">
    <style>
        .v-timeline-item.is-revealed > .v-card {
            border-color: var(--v-accent);
        }
        /* Guided-tour dialog. The scrim reuses the theme's widget shadow so it
           dims correctly in both light and dark themes. */
        .tour-scrim {
            position: fixed;
            inset: 0;
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--v-space-4);
            background: var(--vscode-widget-shadow, transparent);
        }
        .tour-dialog {
            width: 100%;
            max-width: 560px;
            background: var(--vscode-editorWidget-background, var(--v-surface));
            border: 1px solid var(--v-border-strong);
            border-radius: var(--v-radius);
            padding: var(--v-space-6);
        }
        .tour-dialog > * + * {
            margin-top: var(--v-space-3);
        }
    </style>
</head>
<body>
    <main class="v-page">
        <header class="v-header">
            <div class="v-row">
                <h1 class="v-title">File Timeline</h1>
                ${analysis.isZenith ? '<span class="v-badge v-badge--good">Zenith state</span>' : ''}
            </div>
            <p class="v-subtitle"><span class="v-mono">${esc(fileName)}</span> — everything git history can tell you about how this file got here.</p>
        </header>

        <section class="v-section">
            <h2 class="v-section-title">Narrative biography</h2>
            <div class="v-note">${esc(bio)}</div>
        </section>

        ${metricsSection}
        ${badgesSection}
        ${busFactorSection}
        ${epochsSection}

        <section class="v-section">
            <h2 class="v-section-title">Ask the code archaeologist</h2>
            <div class="v-card">
                <div class="v-row">
                    <input type="text" class="v-input" id="nlQuery" aria-label="Ask a question about this file's history"
                           placeholder="e.g. Who owns this file, and why was it split up?">
                    <button type="button" class="v-btn v-btn--primary" onclick="askNL()">Ask</button>
                </div>
                <p id="archaeologist-content" style="margin: var(--v-space-3) 0 0">${(Number(analysis.ageDays) || 0) > 30
                ? `This file has not changed for ${esc(analysis.ageDays)} days. Ask why it exists, who to talk to, or what it is coupled to.`
                : 'Ask about this file\'s history — its owners, its risky areas, or why a change was made.'}</p>
                <div class="v-toolbar" style="margin-top: var(--v-space-3)">
                    <button type="button" class="v-btn" onclick="askArchaeologist()">Summarize this file</button>
                </div>
            </div>
        </section>

        ${refactorSection}
        ${driftSection}
        ${loreSection}
        ${ripplesSection}
        ${onboardingSection}
        ${commitsSection}

        <section class="v-section">
            <h2 class="v-section-title">Related views</h2>
            <div class="v-toolbar">
                <button type="button" class="v-btn" onclick="showGravityWell()">Open gravity well</button>
                <button type="button" class="v-btn" onclick="showPulse()">Open architectural pulse</button>
            </div>
        </section>
    </main>

    <script>
        const vscode = acquireVsCodeApi();
        function viewCommit(hash) { vscode.postMessage({ command: 'viewCommit', hash }); }
        function promoteLore(type, content, hash) {
            vscode.postMessage({ command: 'promoteLore', type, content, hash });
        }
        function chatWithGhost(author, hash) {
            vscode.postMessage({ command: 'chatWithGhost', author, hash });
        }
        function runTimeMachine(hash) {
            vscode.postMessage({ command: 'runTimeMachine', hash });
        }
        function showGravityWell() {
            vscode.postMessage({ command: 'showGravityWell' });
        }
        function replayGhost(hash) {
            vscode.postMessage({ command: 'replayGhost', hash });
        }
        function showPulse() {
            vscode.postMessage({ command: 'showPulse' });
        }
        function openWormhole(hash) {
            vscode.postMessage({ command: 'openWormhole', hash });
        }
        function shareLore(type, content) {
            vscode.postMessage({ command: 'shareLore', loreType: type, content });
        }
        function setText(id, text) {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        }
        function askNL() {
            const input = document.getElementById('nlQuery');
            const query = input ? input.value : '';
            if (!query) return;
            setText('archaeologist-content', 'Searching this file\\'s history for "' + query + '"…');
            vscode.postMessage({ command: 'askArchaeologist', text: query });
        }
        function askArchaeologist() {
            setText('archaeologist-content', 'Reading this file\\'s history…');
            vscode.postMessage({ command: 'askArchaeologist' });
        }
        function getRefactorIdeas() {
            setText('refactor-content', 'Working out the highest-return refactors…');
            vscode.postMessage({ command: 'getRefactorIdeas' });
        }

        // --- Guided tour ------------------------------------------------
        // Milestones are inlined as JSON; every field is written into the DOM
        // with textContent, so commit-derived text is never parsed as markup.
        let tourState = {
            milestones: ${JSON.stringify(tour).replace(/</g, '\\u003c')},
            currentStep: 0,
            isActive: false
        };

        function importanceMeta(importance) {
            const value = Number(importance) || 0;
            if (value > 8) return { tone: 'v-badge--bad', label: 'Critical' };
            if (value > 6) return { tone: 'v-badge--warn', label: 'Important' };
            return { tone: 'v-badge--accent', label: 'Notable' };
        }

        function el(tag, className, text) {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text !== undefined && text !== null) node.textContent = text;
            return node;
        }

        function startInteractiveTour() {
            if (tourState.milestones.length === 0) return;
            tourState.isActive = true;
            tourState.currentStep = 0;
            showTourModal();
        }

        function showTourModal() {
            const milestone = tourState.milestones[tourState.currentStep];
            if (!milestone) return;
            const total = tourState.milestones.length;
            const progress = ((tourState.currentStep + 1) / total) * 100;
            const meta = importanceMeta(milestone.importance);

            const existing = document.getElementById('tour-modal');
            if (existing) existing.remove();

            const scrim = el('div', 'tour-scrim');
            scrim.id = 'tour-modal';
            scrim.setAttribute('role', 'dialog');
            scrim.setAttribute('aria-modal', 'true');
            scrim.setAttribute('aria-label', 'Guided file tour');

            const dialog = el('div', 'tour-dialog');

            const meter = el('div', 'v-meter');
            const fill = el('span', 'v-meter-fill');
            fill.style.width = progress + '%';
            meter.appendChild(fill);
            dialog.appendChild(meter);

            const head = el('div', 'v-row v-row--between');
            head.appendChild(el('span', 'v-caption', 'Milestone ' + (tourState.currentStep + 1) + ' of ' + total));
            head.appendChild(el('span', 'v-badge ' + meta.tone, meta.label));
            dialog.appendChild(head);

            dialog.appendChild(el('div', 'v-section-title', String(milestone.type || 'milestone')));
            dialog.appendChild(el('p', null, String(milestone.content || '')));

            if (milestone.author) {
                dialog.appendChild(el('p', 'v-caption', 'by ' + milestone.author));
            }
            if (milestone.date) {
                dialog.appendChild(el('p', 'v-caption', new Date(milestone.date).toLocaleDateString()));
            }

            const nav = el('div', 'v-toolbar');
            if (tourState.currentStep > 0) {
                const prev = el('button', 'v-btn', 'Previous');
                prev.type = 'button';
                prev.addEventListener('click', previousStep);
                nav.appendChild(prev);
            }
            if (tourState.currentStep < total - 1) {
                const next = el('button', 'v-btn v-btn--primary', 'Next');
                next.type = 'button';
                next.addEventListener('click', nextStep);
                nav.appendChild(next);
            } else {
                const done = el('button', 'v-btn v-btn--primary', 'Finish tour');
                done.type = 'button';
                done.addEventListener('click', finishTour);
                nav.appendChild(done);
            }
            const close = el('button', 'v-btn', 'Close');
            close.type = 'button';
            close.addEventListener('click', closeTour);
            nav.appendChild(close);
            dialog.appendChild(nav);

            scrim.appendChild(dialog);
            document.body.appendChild(scrim);
            close.focus();
        }

        function nextStep() {
            if (tourState.currentStep < tourState.milestones.length - 1) {
                tourState.currentStep++;
                showTourModal();
            }
        }

        function previousStep() {
            if (tourState.currentStep > 0) {
                tourState.currentStep--;
                showTourModal();
            }
        }

        function finishTour() {
            closeTour();
        }

        function closeTour() {
            const modal = document.getElementById('tour-modal');
            if (modal) modal.remove();
            tourState.isActive = false;
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && tourState.isActive) closeTour();
        });

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'setArchaeologistResult') {
                setText('archaeologist-content', message.text);
            } else if (message.command === 'setRefactorResult') {
                setText('refactor-content', message.text);
            } else if (message.command === 'revealCommit') {
                const target = document.getElementById('commit-' + message.hash);
                if (target) {
                    target.scrollIntoView({ block: 'center' });
                    target.classList.add('is-revealed');
                }
            }
        });
    </script>
</body>
</html>`;
    }

    escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text ? String(text).replace(/[&<>"']/g, m => map[m]) : '';
    }

    dispose() { if (this.panel) this.panel.dispose(); }
}

module.exports = TimelinePanel;
