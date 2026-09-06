export {};
const vscode = require('vscode');
const { container } = require('./container');
const path = require('path');
const GitAnalyzer = require('./git-analyzer');
const Decorators = require('./decorators');
const TimelinePanel = require('./timeline-panel');

const FileDecorator = require('./file-decorator');
const VestigeDocumentProvider = require('./document-provider');
const EvolutionPanel = require('./evolution-panel');
const GraveyardPanel = require('./graveyard-panel');
const GravityWellPanel = require('./gravity-well-panel');
const GhostCursorManager = require('./ghost-cursor');
const PulsePanel = require('./pulse-panel');
const CipherPetManager = require('./cipher-pet');
const EchoChamberManager = require('./echo-chamber');
const WormholeManager = require('./wormhole');
const TimeTravelPanel = require('./time-travel-panel');
// V4
const RepoAnalyzer = require('./repo-analyzer');
const AchievementSystem = require('./achievements');
const DashboardPanel = require('./dashboard-panel');
const AIService = require('./ai-service');
// V5
const DebtCalculator = require('./debt-calculator');
const BugAnalyzer = require('./bug-analyzer');
const ZombieDetector = require('./zombie-detector');
const RewindManager = require('./rewind-manager');
const PerformancePanel = require('./performance-panel');
const FlowPanel = require('./flow-panel');
const TimeMachineManager = require('./time-machine');
// V6
const { LoreService } = require('./lore-service');
const { HandoffAssistant, MentorshipMatcher } = require('./intelligence-services');
const IntegrationServices = require('./integration-services');
const SkillTreePanel = require('./skill-tree-panel');
// V7 — Groundbreaking Innovations
const VestigeCodeLensProvider = require('./temporal-codelens');














// V5






















let analysisCache = new Map();
let isEnabled = true;
let extensionContext = null;
const couplingNotified = new Set();

/** Escape untrusted text before interpolating it into webview HTML. */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Extension activation
 */
function activate(context) {
    console.log('Vestige is now active');
    extensionContext = context;
    container.register('gitAnalyzer', new GitAnalyzer());
    container.register('decorators', new Decorators(context));
    container.register('fileDecorator', new FileDecorator(container.get('gitAnalyzer')));
    container.register('timelinePanel', new TimelinePanel(context));
    container.register('evolutionPanel', new EvolutionPanel(context, container.get('gitAnalyzer')));
    container.register('graveyardPanel', new GraveyardPanel(context, container.get('gitAnalyzer')));
    container.register('documentProvider', new VestigeDocumentProvider());

    // V4 initialization
    container.register('repoAnalyzer', new RepoAnalyzer(container.get('gitAnalyzer')));
    container.register('achievements', new AchievementSystem(context));
    container.register('dashboardPanel', new DashboardPanel(context, container.get('repoAnalyzer')));
    container.register('aiService', new AIService());
    container.get('aiService').setContext(context);

    // V5 initialization
    container.register('debtCalculator', new DebtCalculator(container.get('gitAnalyzer')));
    container.register('bugAnalyzer', new BugAnalyzer(container.get('gitAnalyzer')));
    container.register('zombieDetector', new ZombieDetector(container.get('gitAnalyzer')));
    container.register('rewindManager', new RewindManager(context));
    // No team leaderboard: ranking named colleagues on git-derived stats is a
    // comparative metric that lands as surveillance. Private, non-comparative
    // gamification (achievements, XP, the Cipher pet) stays.
    container.register('performancePanel', new PerformancePanel(context, container.get('gitAnalyzer')));
    container.register('flowPanel', new FlowPanel(context, container.get('gitAnalyzer')));

    // V6 initialization
    container.register('loreService', new LoreService());
    container.register('timeMachine', new TimeMachineManager());
    container.register('gravityWellPanel', new GravityWellPanel(context));
    container.register('ghostCursor', new GhostCursorManager());
    container.register('handoffAssistant', new HandoffAssistant(container.get('gitAnalyzer')));
    container.register('mentorshipMatcher', new MentorshipMatcher(container.get('gitAnalyzer')));
    container.register('integrationServices', new IntegrationServices(context));
    container.register('skillTreePanel', new SkillTreePanel(context, container.get('achievements')));
    container.register('pulsePanel', new PulsePanel(context));
    container.register('cipherPet', new CipherPetManager(context));
    container.register('echoChamber', new EchoChamberManager());
    container.register('wormhole', new WormholeManager(container.get('timeMachine')));
    container.register('timeTravelPanel', new TimeTravelPanel(context));
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        container.get('loreService').initialize(vscode.workspace.workspaceFolders[0].uri.fsPath);
    }
    container.get('cipherPet').initialize();

    // V7: Temporal CodeLens — intelligence woven into the editor
    container.register('codeLensProvider', new VestigeCodeLensProvider(container.get('gitAnalyzer'), container.get('aiService'), container.get('loreService')));
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ scheme: 'file' }, container.get('codeLensProvider'))
    );

    // Register Document Provider
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('vestige-git', container.get('documentProvider'))
    );

    // Create status bar items
    container.register('statusBarItem', vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100));
    container.get('statusBarItem').command = 'vestige.showTimeline';
    context.subscriptions.push(container.get('statusBarItem'));

    // V4: Health status bar
    container.register('healthStatusBar', vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99));
    container.get('healthStatusBar').command = 'vestige.showDashboard';
    container.get('healthStatusBar').text = '$(loading~spin) Analyzing...';
    context.subscriptions.push(container.get('healthStatusBar'));

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('vestige.analyze', analyzeCurrentFile),
        vscode.commands.registerCommand('vestige.showTimeline', showTimeline),
        vscode.commands.registerCommand('vestige.toggle', toggleAnnotations),
        vscode.commands.registerCommand('vestige.clearCache', clearCache),
        vscode.commands.registerCommand('vestige.openFileAtCommit', openFileAtCommit),
        vscode.commands.registerCommand('vestige.showEvolution', showEvolution),
        vscode.commands.registerCommand('vestige.showGraveyard', showGraveyard),
        vscode.commands.registerCommand('vestige.viewDeletedFile', viewDeletedFile),
        vscode.commands.registerCommand('vestige.resurrectFile', resurrectFile),
        // V4 commands
        vscode.commands.registerCommand('vestige.showDashboard', showDashboard),
        vscode.commands.registerCommand('vestige.showAchievements', showAchievements),
        vscode.commands.registerCommand('vestige.explainCommit', explainCommit),
        // V5 commands
        vscode.commands.registerCommand('vestige.showDebt', showDebt),
        vscode.commands.registerCommand('vestige.showBugs', showBugs),
        vscode.commands.registerCommand('vestige.showZombies', showZombies),
        vscode.commands.registerCommand('vestige.rewind', rewind),
        vscode.commands.registerCommand('vestige.stopRewind', stopRewind),
        vscode.commands.registerCommand('vestige.showPerformance', showPerformance),
        vscode.commands.registerCommand('vestige.showFlow', showFlow),
        vscode.commands.registerCommand('vestige.checkDrift', checkDrift),
        vscode.commands.registerCommand('vestige.checkHotPotato', checkHotPotato),
        // V6 commands
        vscode.commands.registerCommand('vestige.showLore', showLore),
        vscode.commands.registerCommand('vestige.aiHistorian', aiHistorian),
        vscode.commands.registerCommand('vestige.addDecision', addDecision),
        vscode.commands.registerCommand('vestige.promoteLore', promoteLore),
        vscode.commands.registerCommand('vestige.chatWithGhost', chatWithGhost),
        // Features are never gated behind XP. Achievements are a reward for
        // using the tool, not a paywall in front of the functionality the user
        // installed it for.
        vscode.commands.registerCommand('vestige.runTimeMachine', runTimeMachine),
        vscode.commands.registerCommand('vestige.showGravityWell', showGravityWell),
        vscode.commands.registerCommand('vestige.replayGhost', replayGhost),
        vscode.commands.registerCommand('vestige.showPulse', showPulse),
        vscode.commands.registerCommand('vestige.showPetDetails', () => container.get('cipherPet').showDetails()),
        vscode.commands.registerCommand('vestige.toggleEcho', () => container.get('echoChamber').toggle()),
        vscode.commands.registerCommand('vestige.openWormhole', (hash) => {
            const editor = vscode.window.activeTextEditor;
            if (editor) container.get('wormhole').openPortal(editor, hash, editor.document.uri.fsPath);
        }),
        vscode.commands.registerCommand('vestige.commandPalette', showCommandPalette),
        vscode.commands.registerCommand('vestige.showSkillTree', () => container.get('skillTreePanel').show()),
        vscode.commands.registerCommand('vestige.openTimeTravel', openTimeTravel),
        // V7: Groundbreaking Innovations
        vscode.commands.registerCommand('vestige.askHistorian', askHistorian),
        vscode.commands.registerCommand('vestige.resurrectWithGhost', resurrectWithGhost),
        vscode.commands.registerCommand('vestige.showArchitectureMap', showArchitectureMap),
        vscode.commands.registerCommand('vestige.showCommitInTimeline', (hash) => {
            if (container.has('timelinePanel') && typeof container.get('timelinePanel').revealCommit === 'function') {
                container.get('timelinePanel').revealCommit(hash);
            }
        }),
        vscode.commands.registerCommand('vestige.showLoreDecision', (id) => {
            if (container.has('loreService') && typeof container.get('loreService').showDecision === 'function') {
                container.get('loreService').showDecision(id);
            }
        }),
        vscode.commands.registerCommand('vestige.showHandoffRisks', showHandoffRisks),
        vscode.commands.registerCommand('vestige.findExperts', findExperts),
        vscode.commands.registerCommand('vestige.lineHistory', showLineHistory),
        vscode.commands.registerCommand('vestige.auditCodeowners', auditCodeowners),
        vscode.commands.registerCommand('vestige.showCoupledFiles', showCoupledFiles),
        vscode.commands.registerCommand('vestige.setOpenAIKey', async () => {
            const key = await vscode.window.showInputBox({
                prompt: 'Enter your OpenAI API key (stored securely in VS Code Secret Storage)',
                password: true,
                ignoreFocusOut: true,
                placeHolder: 'sk-...'
            });
            if (key === undefined) return;
            if (key === '') {
                await context.secrets.delete('vestige.openaiApiKey');
                vscode.window.showInformationMessage('Vestige: OpenAI API key removed from Secret Storage.');
            } else {
                await context.secrets.store('vestige.openaiApiKey', key);
                vscode.window.showInformationMessage('Vestige: OpenAI API key stored securely. 🔐');
            }
        })
    );

    // Auto-analyze on file open/change
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && isEnabled) {
                analyzeCurrentFile();
            } else {
                container.get('statusBarItem').hide();
            }
        }),
        vscode.workspace.onDidSaveTextDocument(async document => {
            if (vscode.window.activeTextEditor &&
                vscode.window.activeTextEditor.document === document &&
                isEnabled) {
                // Clear cache for this file on save to get fresh git status
                // Also clear previous version keys if possible, but for now just analyze
                await analyzeCurrentFile(true); // Force refresh

                // Saving is the moment a co-change suggestion is actually
                // useful: the user just changed this file, so "these usually
                // change with it" is advice they can act on right now.
                const cacheKey = Array.from(analysisCache.keys()).find(k => k.startsWith(document.uri.fsPath));
                const analysis = cacheKey ? analysisCache.get(cacheKey) : null;
                if (analysis) {
                    suggestCoupledFiles(analysis, document.uri);
                }

                // V4: Track edit achievement
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                if (workspaceFolder) {
                    checkEditAchievement(workspaceFolder.uri.fsPath, document.uri.fsPath);
                }
            }
        })
    );

    // Initial analysis
    if (vscode.window.activeTextEditor && isEnabled) {
        analyzeCurrentFile();
    }

    // V4: Calculate repo health on workspace open
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        calculateRepoHealth(vscode.workspace.workspaceFolders[0].uri.fsPath);
    }

    vscode.window.showInformationMessage('Vestige: Temporal code intelligence activated 🗿');

    // Elite: AI Code Archaeologist
    context.subscriptions.push(vscode.commands.registerCommand('vestige.askArchaeologist', async (analysis, fileName, question) => {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const codeContext = (question ? `User question: ${question}\n\n` : '') + editor.document.getText();
            const result = await container.get('aiService').analyzeStagnation(fileName, analysis.ageDays, analysis.churn, codeContext);
            container.get('timelinePanel').setAIResult('setArchaeologistResult', result);
        } catch (e) {
            container.get('timelinePanel').setAIResult('setArchaeologistResult', "The scrolls are unreadable: " + e.message);
        }
    }));

    // Elite: Predictive Refactoring
    context.subscriptions.push(vscode.commands.registerCommand('vestige.getRefactorIdeas', async (analysis, fileName) => {
        try {
            const result = await container.get('aiService').suggestRefactoring(fileName, analysis.interestRate, analysis.lines.length);
            container.get('timelinePanel').setAIResult('setRefactorResult', result);
        } catch (e) {
            container.get('timelinePanel').setAIResult('setRefactorResult', "Refactor engine stalled: " + e.message);
        }
    }));

    // Elite: Share Lore Bridge
    // One webhook implementation, in the service that owns it. This used to be
    // duplicated inline here while the service sat registered and unreachable.
    context.subscriptions.push(vscode.commands.registerCommand('vestige.shareLore', async (type, content) => {
        // Slack-compatible payload; Discord accepts it too when the webhook
        // URL ends with /slack.
        await container.get('integrationServices').notifyWebhook(
            `*Vestige* (${type || 'insight'}):\n${content || ''}`
        );
    }));
}

/**
 * V4: Calculate and display repo health
 */
async function calculateRepoHealth(repoPath) {
    try {
        container.get('healthStatusBar').show();
        const health = await container.get('repoAnalyzer').calculateRepoHealth(repoPath);

        const icon = health.score >= 8 ? '$(check)' : health.score >= 5 ? '$(warning)' : '$(error)';
        container.get('healthStatusBar').text = `${icon} Repo Health: ${health.score}/10`;
        container.get('healthStatusBar').tooltip = `Bus Factor: ${health.metrics.avgBusFactor || 'N/A'}\nFossil Code: ${health.metrics.fossilPercent || 0}%\nClick for dashboard`;
    } catch (error) {
        container.get('healthStatusBar').text = '$(question) Repo Health: N/A';
        container.get('healthStatusBar').tooltip = 'Click to analyze repository';
    }
}

/**
 * V4: Check if edit qualifies for achievement
 */
async function checkEditAchievement(repoPath, filePath) {
    try {
        const busFactor = await container.get('gitAnalyzer').calculateBusFactor(repoPath, filePath);
        if (busFactor && busFactor.busFactor === 1) {
            await container.get('achievements').trackAction('editBusFactor1');
        }
    } catch (e) {
        // Silent fail
    }
}

/**
 * Open file at specific commit
 */
async function openFileAtCommit(commitHash, filePath, repoPath) {
    const uri = vscode.Uri.parse(`vestige-git:/${commitHash}/${filePath}?${repoPath}`);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
}

/**
 * Analyze current file and apply decorations
 */
async function analyzeCurrentFile(force = false) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        container.get('statusBarItem').hide();
        return;
    }

    const document = editor.document;
    const filePath = document.uri.fsPath;

    // Only analyze git-tracked files (heuristic)
    if (document.isUntitled || document.uri.scheme !== 'file') {
        container.get('statusBarItem').hide();
        return;
    }

    try {
        // Check cache first
        const cacheKey = `${filePath}-${document.version}`;
        let analysis = force ? null : analysisCache.get(cacheKey);

        if (!analysis) {
            container.get('statusBarItem').text = "$(sync~spin) Vestige";
            container.get('statusBarItem').tooltip = "Analyzing git history...";
            container.get('statusBarItem').show();

            // Get git analysis
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (!workspaceFolder) {
                container.get('statusBarItem').hide();
                return;
            }

            analysis = await container.get('gitAnalyzer').analyzeFile(
                workspaceFolder.uri.fsPath,
                filePath,
                force,
                extensionContext
            );

            // Calculate extra metrics
            analysis.ownership = container.get('gitAnalyzer').calculateOwnership(analysis.lines);

            // Stability Score: Decay-weighted churn (recent commits count more)
            // Replaces: const stability = Math.max(0, 100 - (analysis.churn.totalCommits * 2));
            const now = Date.now();
            const churnCommits = analysis.churn?.commits || [];
            const decayedChurn = churnCommits.reduce((sum, c) => {
                const ageMonths = (now - new Date(c.date).getTime()) / (1000 * 60 * 60 * 24 * 30);
                return sum + Math.exp(-0.1 * ageMonths);
            }, 0);
            const stability = Math.max(0, Math.min(100, Math.round(100 - (decayedChurn * 8))));
            analysis.stability = stability;

            // Phase Zenith: Auditory Reflection
            container.get('echoChamber').reflect(analysis);

            // Elite: Ownership Heat
            analysis.ownershipHeat = container.get('gitAnalyzer').calculateOwnershipHeat(analysis);

            // Elite: Narrative Biography
            analysis.narrativeBiography = container.get('gitAnalyzer').generateNarrativeBiography(analysis);

            // Elite: Onboarding Tour - Generate milestones for new developers
            analysis.onboardingTour = container.get('gitAnalyzer').generateOnboardingTour(analysis);

            // Elite: Onboarding Recommendations - Expert contacts and related files
            analysis.onboardingRecommendations = container.get('gitAnalyzer').generateOnboardingRecommendations(analysis);

            // V7: Update CodeLens cache so temporal lenses refresh immediately
            if (container.get('codeLensProvider')) {
                container.get('codeLensProvider').updateCache(filePath, analysis);
            }

            // Elite: AI-Powered Onboarding Narrative
            if (analysis.onboardingTour && analysis.onboardingTour.length > 0) {
                try {
                    const fileName = path.basename(filePath);
                    analysis.onboardingNarrative = await container.get('aiService').generateOnboardingNarrative(
                        analysis.onboardingTour,
                        fileName,
                        analysis.onboardingRecommendations?.facts || {}
                    );
                } catch (error) {
                    console.error('Failed to generate onboarding narrative:', error);
                    // Fallback will be used in AI service
                }
            }

            // Elite: Ghost Shadows (Recent Deletions)
            analysis.deletedChunks = await container.get('gitAnalyzer').findRecentDeletions(workspaceFolder.uri.fsPath, filePath);

            // Cache the result
            analysisCache.set(cacheKey, analysis);

            // Limit cache size
            if (analysisCache.size > 50) {
                const firstKey = analysisCache.keys().next().value;
                analysisCache.delete(firstKey);
            }
        }

        // Elite: Structural Intelligence (before decorating, so zombie ranges render)
        const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri) || [];
        analysis.zombieMethods = await detectZombieMethods(analysis, symbols, document);

        // Apply decorations
        container.get('decorators').applyDecorations(editor, analysis);

        // Update status bar
        const stabilityIcon = analysis.stability > 80 ? '$(shield)' : analysis.stability > 50 ? '$(warning)' : '$(flame)';
        let statusText = `${stabilityIcon} ${analysis.stability}% | 👤 ${analysis.ownership.topAuthor} (${analysis.ownership.percent}%)`;

        if (analysis.interestRate > 50) statusText += ` | 💸 ${analysis.interestRate}% Interest`;

        container.get('statusBarItem').text = statusText;
        container.get('statusBarItem').tooltip = `Vestige Analysis:\n- Stability: ${analysis.stability}%\n- Top Author: ${analysis.ownership.topAuthor}\n- Interest Rate: ${analysis.interestRate}%\n- Originality: ${analysis.originalityIndex}%\n\nClick to show timeline`;
        container.get('statusBarItem').show();

        // Co-change suggestions deliberately do NOT fire here: this runs on
        // every file open and tab switch, and merely looking at a file is no
        // reason to interrupt someone. They fire on save instead.

        // Elite: Achievements
        container.get('achievements').checkAchievements('analysis', null, analysis);

    } catch (error) {
        console.error('Vestige analysis error:', error);
        container.get('statusBarItem').text = "$(warning) Vestige";
        container.get('statusBarItem').tooltip = `Analysis failed: ${error.message}`;
        container.get('statusBarItem').show();
    }
}

/**
 * Elite: Structural Zombie Detection
 */
async function detectZombieMethods(analysis, symbols, document) {
    const zombies = [];
    const now = new Date();
    const oneYearAgo = now.getTime() - (365 * 24 * 60 * 60 * 1000);

    const traverse = (symbol) => {
        // Look for methods/functions/classes
        if ([vscode.SymbolKind.Method, vscode.SymbolKind.Function, vscode.SymbolKind.Class].includes(symbol.kind)) {
            const startLine = symbol.range.start.line + 1;
            const endLine = symbol.range.end.line + 1;

            const lines = analysis.lines.filter(l => l.lineNo >= startLine && l.lineNo <= endLine);
            if (lines.length > 0) {
                const isAllOld = lines.every(l => l.date && new Date(l.date).getTime() < oneYearAgo);
                if (isAllOld && analysis.churn.totalCommits > 10) {
                    zombies.push({
                        name: symbol.name,
                        ageDays: Math.round((now.getTime() - Math.min(...lines.map(l => new Date(l.date).getTime()))) / (1000 * 60 * 60 * 24)),
                        range: symbol.range
                    });
                }
            }
        }
        if (symbol.children) symbol.children.forEach(traverse);
    };

    symbols.forEach(traverse);
    return zombies;
}

/**
 * Co-change suggestions — "you changed this; history says these usually change with it."
 *
 * This is the one signal here with no real equivalent in any installed editor
 * tool, and the research supports the shape precisely: co-change prediction has
 * modest precision (~0.26–0.30) but a 64–70% top-three hit rate and, critically,
 * only a ~2% false-alarm rate. So it works as a *suggestion of three*, and it
 * does not get in the way. Three rules follow from that:
 *
 *   1. Show at most three, ranked, with the evidence inline (how many shared
 *      commits) — reasoning has to be visible or the first perceived false
 *      positive gets the whole feature ignored forever.
 *   2. Never nag. Once per file per session, only on an actual save, and
 *      suppressed for files the user already has open or has just edited.
 *   3. Always dismissible and switchable off.
 *
 * The previous implementation read `knowledgeNeighbors` — author names — and
 * told the user their file "is often changed with members like Alice".
 */
async function suggestCoupledFiles(analysis, uri) {
    const config = vscode.workspace.getConfiguration('vestige');
    if (!config.get('coupledFileSuggestions', true)) return;

    // Once per file per session.
    if (couplingNotified.has(uri.fsPath)) return;

    const coupled = analysis.coupledFiles || [];
    if (coupled.length === 0) return;

    const threshold = Number(config.get('coupledFileThreshold', 50)) || 50;

    // Files the user already has open are not a useful suggestion.
    const openPaths = new Set(
        vscode.workspace.textDocuments.map(d => d.uri.fsPath)
    );
    const repoPath = analysis.repoPath || vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
    if (!repoPath) return;

    const candidates = coupled
        .filter(c => c.frequency >= threshold && c.count >= 2)
        .map(c => ({ ...c, absolute: path.join(repoPath, c.file) }))
        .filter(c => !openPaths.has(c.absolute))
        .slice(0, 3);

    if (candidates.length === 0) return;
    couplingNotified.add(uri.fsPath);

    const names = candidates.map(c => path.basename(c.file));
    const top = candidates[0];
    const summary = candidates.length === 1
        ? `${names[0]} usually changes with this file (${top.count} shared commits, ${top.frequency}%).`
        : `${names.join(', ')} usually change with this file. Top: ${names[0]} — ${top.count} shared commits (${top.frequency}%).`;

    const OPEN = candidates.length === 1 ? `Open ${names[0]}` : 'Show all';
    const NEVER = 'Stop suggesting';

    const choice = await vscode.window.showInformationMessage(summary, OPEN, NEVER);

    if (choice === NEVER) {
        await config.update('coupledFileSuggestions', false, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Vestige: co-change suggestions turned off. Re-enable them in Settings.');
        return;
    }

    if (choice === OPEN) {
        if (candidates.length === 1) {
            await openCoupledFile(candidates[0]);
        } else {
            await pickCoupledFile(candidates, path.basename(uri.fsPath));
        }
    }
}

async function openCoupledFile(candidate) {
    try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(candidate.absolute));
        await vscode.window.showTextDocument(doc, { preview: false });
    } catch (error) {
        vscode.window.showWarningMessage(`Could not open ${candidate.file}: ${error.message}`);
    }
}

async function pickCoupledFile(candidates, sourceName) {
    const selected = await vscode.window.showQuickPick(
        candidates.map(c => ({
            label: path.basename(c.file),
            description: `${c.frequency}% · ${c.count} shared commits`,
            detail: c.file,
            candidate: c
        })),
        { placeHolder: `Files that usually change with ${sourceName}`, matchOnDetail: true }
    );
    if (selected) await openCoupledFile(selected.candidate);
}

/**
 * On-demand version of the same thing, for when the user wants to ask rather
 * than be told.
 */
async function showCoupledFiles() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('Open a file first.');
        return;
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('File is not in a workspace');
        return;
    }

    const repoPath = workspaceFolder.uri.fsPath;
    const fileName = path.basename(editor.document.uri.fsPath);

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: `Finding files that change with ${fileName}…` },
        async () => {
            const coupled = await container.get('gitAnalyzer').getCoupledFiles(repoPath, editor.document.uri.fsPath);

            if (!coupled || coupled.length === 0) {
                vscode.window.showInformationMessage(
                    `No co-change partners found for ${fileName}. It has only ever been committed on its own, or its history is too short.`
                );
                return;
            }

            const candidates = coupled.map(c => ({ ...c, absolute: path.join(repoPath, c.file) }));
            await pickCoupledFile(candidates, fileName);
        }
    );
}

/**
 * Show timeline panel
 */
async function showTimeline() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active file to analyze');
        return;
    }

    const document = editor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

    if (!workspaceFolder) {
        vscode.window.showWarningMessage('File is not in a workspace');
        return;
    }

    try {
        const timeline = await container.get('gitAnalyzer').getFileTimeline(
            workspaceFolder.uri.fsPath,
            document.uri.fsPath
        );

        // Add coupling info
        const coupling = await container.get('gitAnalyzer').getCoupledFiles(
            workspaceFolder.uri.fsPath,
            document.uri.fsPath
        );

        // V3: Add epochs
        const epochs = await container.get('gitAnalyzer').detectEpochs(workspaceFolder.uri.fsPath);

        // V3: Add bus factor
        const busFactor = await container.get('gitAnalyzer').calculateBusFactor(
            workspaceFolder.uri.fsPath,
            document.uri.fsPath
        );

        // Elite: Analysis data
        const cacheKey = `${document.uri.fsPath}-${document.version}`;
        const analysis = analysisCache.get(cacheKey);

        timeline.coupling = coupling;
        timeline.epochs = epochs;
        timeline.busFactor = busFactor;
        timeline.repoPath = workspaceFolder.uri.fsPath;
        timeline.narrativeBiography = analysis ? analysis.narrativeBiography : 'Analyzing history...';
        if (analysis) {
            // Give the panel the richer analysis data when we have it
            timeline.badges = analysis.badges;
            timeline.implicitLore = analysis.implicitLore;
            timeline.echoedReviews = analysis.echoedReviews;
            timeline.butterflyRipples = analysis.butterflyRipples;
            timeline.onboardingTour = analysis.onboardingTour;
            timeline.onboardingRecommendations = analysis.onboardingRecommendations;
            timeline.onboardingNarrative = analysis.onboardingNarrative;
            timeline.safetyScore = analysis.safetyScore;
            timeline.refactorROI = analysis.refactorROI;
            timeline.debtInterest = analysis.debtInterest;
            timeline.archDrift = analysis.archDrift;
            timeline.stability = analysis.stability;
            timeline.interestRate = analysis.interestRate;
            timeline.originalityIndex = analysis.originalityIndex;
            timeline.ageDays = analysis.ageDays;
        }

        // V5: Debt Horizon
        if (analysis && analysis.debt) {
            timeline.debtHorizon = container.get('debtCalculator').forecastDebtHorizon(analysis.debt, 180);
        } else {
            // Recalculate if not in analysis cache
            const debt = await container.get('debtCalculator').calculateDebt(workspaceFolder.uri.fsPath, document.uri.fsPath);
            if (debt) timeline.debtHorizon = container.get('debtCalculator').forecastDebtHorizon(debt, 180);
        }

        // V6: Get decisions
        const decisions = container.get('loreService').getDecisionsForFile(document.uri.fsPath);

        container.get('timelinePanel').show(timeline, document.uri.fsPath, decisions);
    } catch (error) {
        vscode.window.showErrorMessage(`Vestige: ${error.message}`);
    }
}

/**
 * V3: Show evolution panel
 */
async function showEvolution() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active file');
        return;
    }

    const document = editor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

    if (!workspaceFolder) {
        vscode.window.showWarningMessage('File is not in a workspace');
        return;
    }

    try {
        const timeline = await container.get('gitAnalyzer').getFileTimeline(
            workspaceFolder.uri.fsPath,
            document.uri.fsPath
        );

        container.get('evolutionPanel').show(document.uri.fsPath, timeline.commits, workspaceFolder.uri.fsPath);
    } catch (error) {
        vscode.window.showErrorMessage(`Vestige: ${error.message}`);
    }
}

/**
 * V3: Show graveyard
 */
async function showGraveyard() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace open');
        return;
    }

    const repoPath = workspaceFolders[0].uri.fsPath;
    await container.get('graveyardPanel').refresh(repoPath);
    vscode.window.showInformationMessage('Graveyard refreshed!');
}

/**
 * V3: View deleted file
 */
async function viewDeletedFile(file) {
    // Invoked either with the raw deleted-file object (tree item click) or a
    // TreeItem wrapper carrying `.file` (context menu).
    const fileData = file?.file || file;
    if (!fileData || !fileData.path || !fileData.commit) return;

    const repoPath = fileData.repoPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    try {
        // fileData.commit is the commit that DELETED the file, so its content
        // lives at the parent commit. Resolve it to a plain hash for the URI.
        const parentHash = await container.get('gitAnalyzer').resolveCommit(repoPath, `${fileData.commit}^`);
        const uri = vscode.Uri.parse(`vestige-git:/${parentHash}/${fileData.path}?${repoPath}`);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: true });
    } catch (error) {
        vscode.window.showErrorMessage(`Could not view deleted file: ${error.message}`);
    }
}

/**
 * V3: Resurrect deleted file
 */
async function resurrectFile(file) {
    const fileData = file?.file || file;
    if (!fileData || !fileData.path || !fileData.commit) return;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace open');
        return;
    }
    const repoPath = fileData.repoPath || workspaceFolders[0].uri.fsPath;

    const action = await vscode.window.showInformationMessage(
        `Resurrect ${fileData.path}?`,
        'Yes', 'No'
    );
    if (action !== 'Yes') return;

    try {
        // The file was deleted in fileData.commit, so its last content lives at commit^
        const content = await container.get('gitAnalyzer').getFileAtCommit(repoPath, `${fileData.commit}^`, fileData.path);
        const targetUri = vscode.Uri.file(path.join(repoPath, fileData.path));

        try {
            await vscode.workspace.fs.stat(targetUri);
            const overwrite = await vscode.window.showWarningMessage(
                `${fileData.path} already exists. Overwrite it?`, 'Overwrite', 'Cancel'
            );
            if (overwrite !== 'Overwrite') return;
        } catch (e) {
            // File doesn't exist — safe to write
        }

        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf8'));
        const doc = await vscode.workspace.openTextDocument(targetUri);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(`♻️ Resurrected ${fileData.path}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Could not resurrect file: ${error.message}`);
    }
}

/**
 * Toggle annotations on/off
 */
function toggleAnnotations() {
    isEnabled = !isEnabled;

    if (isEnabled) {
        analyzeCurrentFile();
        vscode.window.showInformationMessage('Vestige: Annotations enabled');
    } else {
        container.get('decorators').clearDecorations();
        container.get('statusBarItem').hide();
        vscode.window.showInformationMessage('Vestige: Annotations disabled');
    }
}

/**
 * Clear analysis cache
 */
function clearCache() {
    analysisCache.clear();
    container.get('decorators').clearDecorations();
    vscode.window.showInformationMessage('Vestige: Cache cleared');

    if (isEnabled) {
        analyzeCurrentFile(true);
    }
}

/**
 * V4: Show dashboard
 */
async function showDashboard() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace open');
        return;
    }

    try {
        let totalScore = 0;
        let totalFiles = 0;
        let busFactorSum = 0;
        let fossilSum = 0;
        let churnSum = 0;
        let folderCount = 0;
        let allHotspots = [];

        for (const folder of workspaceFolders) {
            const health = await container.get('repoAnalyzer').calculateRepoHealth(folder.uri.fsPath);
            totalScore += health.score;
            totalFiles += health.metrics.filesAnalyzed || 0;
            busFactorSum += parseFloat(health.metrics.avgBusFactor) || 0;
            fossilSum += health.metrics.fossilPercent || 0;
            churnSum += health.metrics.churnPercent || 0;
            folderCount++;
            if (health.metrics.hotspots) {
                allHotspots.push(...health.metrics.hotspots.map(h => ({ ...h, file: workspaceFolders.length > 1 ? `[${folder.name}] ${h.file}` : h.file })));
            }
        }

        const avgScore = Math.round(totalScore / workspaceFolders.length);
        allHotspots.sort((a, b) => b.debtScore - a.debtScore);

        const metrics = {
            health: {
                score: avgScore,
                metrics: {
                    filesAnalyzed: totalFiles,
                    avgBusFactor: folderCount > 0 ? (busFactorSum / folderCount).toFixed(1) : 'N/A',
                    fossilPercent: folderCount > 0 ? Math.round(fossilSum / folderCount) : 0,
                    churnPercent: folderCount > 0 ? Math.round(churnSum / folderCount) : 0,
                    hotspots: allHotspots.slice(0, 5)
                }
            }
        };

        await container.get('dashboardPanel').show(workspaceFolders[0].uri.fsPath, metrics);
        await container.get('achievements').trackAction('viewDashboard');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to load dashboard: ${error.message}`);
    }
}

/**
 * V4: Show container.get('achievements')
 */
async function showAchievements() {
    const progress = container.get('achievements').getProgress();
    const unlocked = progress.filter(a => a.unlocked).length;
    const total = progress.length;

    const items = progress.map(achievement => ({
        label: achievement.unlocked ? `✅ ${achievement.name}` : `⬜ ${achievement.name}`,
        description: achievement.unlocked ?
            'Unlocked!' :
            `${achievement.progress}/${achievement.total}`,
        detail: achievement.description
    }));

    await vscode.window.showQuickPick(items, {
        placeHolder: `Achievements: ${unlocked}/${total} unlocked`,
        canPickMany: false
    });
}

/**
 * V4: Explain commit with AI
 */
async function explainCommit(commitHash, filePath, repoPath) {
    const apiKey = vscode.workspace.getConfiguration('vestige').get('openaiApiKey');

    if (!apiKey) {
        const action = await vscode.window.showWarningMessage(
            'OpenAI API key not configured',
            'Configure'
        );
        if (action === 'Configure') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'vestige.openaiApiKey');
        }
        return;
    }

    try {
        vscode.window.showInformationMessage('AI is analyzing the commit...');
        const explanation = await container.get('aiService').explainDiff(filePath, commitHash, container.get('gitAnalyzer'), repoPath);

        vscode.window.showInformationMessage(
            `AI Explanation: ${explanation}`,
            { modal: true }
        );
    } catch (error) {
        vscode.window.showErrorMessage(`AI explanation failed: ${error.message}`);
    }
}

/**
 * V5: Show Technical Debt
 */
async function showDebt() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!workspaceFolder) return;

    try {
        const calculator = container.get('debtCalculator');
        const debt = await calculator.calculateDebt(workspaceFolder.uri.fsPath, editor.document.uri.fsPath);
        if (debt) {
            // Level + the inputs behind it + the raw score. Never a currency or
            // hours figure: the score is a relative ranking signal, not a
            // measurement of anything.
            vscode.window.showInformationMessage(
                `📉 Debt signal: ${calculator.getDebtLevel(debt)} — ${calculator.describeDebt(debt)}. ` +
                `Score ${debt.score}, for comparing files within this repository only.`
            );
        }
    } catch (e) {
        vscode.window.showErrorMessage('Failed to calculate debt');
    }
}

/**
 * V5: Show Bug Analysis
 */
async function showBugs() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!workspaceFolder) return;

    try {
        const bugs = await container.get('bugAnalyzer').analyze(workspaceFolder.uri.fsPath, editor.document.uri.fsPath);
        if (bugs) {
            vscode.window.showInformationMessage(
                `🐛 Bug Density: ${(bugs.density * 100).toFixed(1)}%`,
                `Most Error-Prone Method: ${bugs.worstMethod || 'None'}`,
                `Total Bugs: ${bugs.bugCount}`
            );
        }
    } catch (e) {
        vscode.window.showErrorMessage('Failed to analyze bugs');
    }
}

/**
 * Open Time Travel Scrubbing UI
 */
async function openTimeTravel() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active file');
        return;
    }

    const document = editor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

    if (!workspaceFolder) {
        vscode.window.showWarningMessage('File is not in a workspace');
        return;
    }

    try {
        const timeline = await container.get('gitAnalyzer').getFileTimeline(
            workspaceFolder.uri.fsPath,
            document.uri.fsPath
        );

        container.get('timeTravelPanel').show(document.uri.fsPath, workspaceFolder.uri.fsPath, timeline.commits);
    } catch (error) {
        vscode.window.showErrorMessage(`Vestige: ${error.message}`);
    }
}

/**
 * V5: Show Zombie Code
 */
async function showZombies() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    try {
        vscode.window.showInformationMessage('Scanning for zombie code... 🧟');
        const zombies = await container.get('zombieDetector').scan(workspaceFolders[0].uri.fsPath);
        await container.get('zombieDetector').showReport(zombies);
    } catch (e) {
        vscode.window.showErrorMessage('Zombie scan failed');
    }
}

/**
 * V5: Rewind Workspace
 */
async function rewind() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const commit = await vscode.window.showInputBox({
        placeHolder: 'Enter commit hash to rewind to',
        prompt: '⚠️ Warning: This will checkout a detached HEAD. Make sure you have no uncommitted changes.'
    });

    if (commit) {
        await container.get('rewindManager').startRewind(workspaceFolders[0].uri.fsPath, commit);
    }
}

/**
 * V5: Stop Rewind
 */
async function stopRewind() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    await container.get('rewindManager').stopRewind(workspaceFolders[0].uri.fsPath);
}

/**
 * V5: Show Performance
 */
function showPerformance() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    container.get('performancePanel').show(workspaceFolders[0].uri.fsPath);
}

/**
 * V5: Show Flow
 */
function showFlow() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    container.get('flowPanel').show(workspaceFolders[0].uri.fsPath);
}

/**
 * V5: Check Documentation Drift
 */
async function checkDrift() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    try {
        vscode.window.showInformationMessage('Checking documentation drift... 📚');
        const alerts = await container.get('gitAnalyzer').analyzeDocumentationDrift(workspaceFolders[0].uri.fsPath);

        if (alerts.length === 0) {
            vscode.window.showInformationMessage('✅ Documentation is up to date!');
        } else {
            const items = alerts.map(a => ({
                label: `⚠️ ${path.basename(a.doc)}`,
                description: `${a.daysDrift} days drift`,
                detail: `Code (${path.basename(a.codeFile)}) updated more recently`
            }));

            vscode.window.showQuickPick(items, { placeHolder: 'Drift Detected' });
        }
    } catch (e) {
        vscode.window.showErrorMessage('Drift check failed');
    }
}

/**
 * V6: Show Lore Decisions
 */
async function showLore() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const decisions = container.get('loreService').getDecisionsForFile(editor.document.uri.fsPath);
    container.get('achievements').checkAchievements('loreAdded', decisions.length);
    if (decisions.length === 0) {
        vscode.window.showInformationMessage('No Lore decisions found for this file.');
        return;
    }

    const items = decisions.map(d => ({
        label: `📜 ${d.title}`,
        description: d.status || 'Decided',
        detail: d.decision ? d.decision.substring(0, 100) + '...' : 'No details',
        decision: d
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Found ${decisions.length} decisions for this file`
    });

    if (selected) {
        const d = selected.decision;
        const details = `
# ${d.title}

**Status**: ${d.status}
**Date**: ${d.date}

## Problem
${d.context ? d.context.problem : 'N/A'}

## Decision
${d.decision}

## Alternatives
${d.alternatives ? JSON.stringify(d.alternatives, null, 2) : 'None'}
`;

        const doc = await vscode.workspace.openTextDocument({
            content: details,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    }
}

/**
 * Elite: Promote automated Lore to manual decision
 */
async function promoteLore(type, content, hash, repoPath, fileName) {
    const title = await vscode.window.showInputBox({
        prompt: `Promote this ${type} to a formal Decision`,
        value: `Decision: ${content.substring(0, 30)}...`
    });

    if (!title) return;

    try {
        const lorePath = path.join(repoPath, '.lore', 'decisions');
        if (!require('fs').existsSync(lorePath)) {
            require('fs').mkdirSync(lorePath, { recursive: true });
        }

        const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const fullPath = path.join(lorePath, `${safeTitle}.lean`);

        // Commit messages and titles can contain quotes/newlines — escape them
        // so they can't break out of the .lean string fields.
        const quote = (value) => String(value ?? '')
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\r?\n/g, '\\n');

        const leanContent = `Decision {
  title: "${quote(title)}"
  status: "Decided"
  date: "${new Date().toISOString().split('T')[0]}"
  context: "Extracted from Git history (Commit ${String(hash).substring(0, 7)})"
  decision: "${quote(content)}"
  files: ["${quote(fileName)}"]
}`;

        require('fs').writeFileSync(fullPath, leanContent);
        vscode.window.showInformationMessage(`✅ Lore Promoted: ${title}`);

        // Refresh analysis
        analyzeCurrentFile(true);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to promote Lore: ${error.message}`);
    }
}

/**
 * V6: AI Code Historian
 */
async function aiHistorian() {
    // 1. Ask the user what they want to know
    const query = await vscode.window.showInputBox({
        placeHolder: 'e.g. Why does authenticate() use JWT?',
        prompt: 'Ask a “why” question about the codebase'
    });
    if (!query) return;

    // 2. Find matching Lore decisions (if any)
    const decisions = container.get('loreService').searchDecisions(query);
    const decisionText = decisions.map(d => {
        return `**Decision:** ${d.title}\n**Problem:** ${d.context?.problem || 'N/A'}\n**Solution:** ${d.decision || 'N/A'}\n`;
    }).join('\n---\n');

    // 3. Gather recent commit history (last 10 commits of the whole repo)
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace open');
        return;
    }

    let commitText = '';
    try {
        const recentCommits = await container.get('gitAnalyzer').getRecentCommits(
            workspaceFolder.uri.fsPath,
            10
        );
        commitText = recentCommits.map(c => {
            return `- ${c.hash.slice(0, 7)} ${c.author}: ${c.message} (${c.date.toLocaleDateString()})`;
        }).join('\n');
    } catch (e) {
        console.error('Failed to get commits for historian', e);
    }

    // 4. Build the LLM prompt
    const prompt = `
You are a helpful AI that explains *why* a piece of code was written a certain way.

User question:
"${query}"

Relevant Lore decisions (if any):
${decisionText || 'None'}

Recent commit history (last 10 commits):
${commitText}

Provide a concise answer that references the decisions and commits when appropriate. Keep the tone friendly and technical.`;

    // 5. Call the AI service
    vscode.window.showInformationMessage('AI Historian is analyzing... 💬');
    try {
        const answer = await container.get('aiService').explainText(prompt);

        // 6. Show the answer
        const doc = await vscode.workspace.openTextDocument({
            content: `# AI Code Historian Answer\n\n${answer}`,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    } catch (e) {
        vscode.window.showErrorMessage('AI request failed: ' + e.message);
    }
}

/**
 * History of the selected lines — `git log -L`.
 *
 * Blame answers "how did each line of this file get here". The question people
 * actually ask is narrower and temporal: "how did *this block* end up like
 * this". This shows exactly that, for the current selection.
 */
async function showLineHistory() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('Open a file and select some lines first.');
        return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('File is not in a workspace');
        return;
    }

    const selection = editor.selection;
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;
    const fileName = path.basename(editor.document.uri.fsPath);

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Tracing history of ${fileName}:${startLine}${endLine !== startLine ? `-${endLine}` : ''}…`, cancellable: false },
        async () => {
            let chain;
            try {
                chain = await container.get('gitAnalyzer').getLineageChain(
                    workspaceFolder.uri.fsPath,
                    editor.document.uri.fsPath,
                    startLine,
                    endLine
                );
            } catch (error) {
                // The analyzer throws with a specific explanation when git
                // cannot trace the path at all (new, renamed or uncommitted).
                vscode.window.showInformationMessage(error.message);
                return;
            }

            if (!chain || chain.length === 0) {
                vscode.window.showInformationMessage(
                    `No commit has changed lines ${startLine}${endLine !== startLine ? `–${endLine}` : ''} of ${fileName}.`
                );
                return;
            }

            const range = endLine !== startLine ? `${startLine}–${endLine}` : `${startLine}`;
            const body = chain.map(c => {
                const when = c.date ? c.date.toLocaleDateString() : 'unknown date';
                const diff = c.diff ? `\n\n\`\`\`diff\n${c.diff}\n\`\`\`` : '';
                return `### ${c.message}\n\n\`${c.shortHash}\` · ${c.author} · ${when}${diff}`;
            }).join('\n\n---\n\n');

            const doc = await vscode.workspace.openTextDocument({
                content: `# History of ${fileName} lines ${range}\n\n`
                    + `${chain.length} change${chain.length === 1 ? '' : 's'} touched these lines, newest first.\n\n---\n\n${body}\n`,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        }
    );
}

/**
 * Report CODEOWNERS entries that git history contradicts.
 */
async function auditCodeowners() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace open');
        return;
    }
    const repoPath = workspaceFolders[0].uri.fsPath;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Checking CODEOWNERS against git history…', cancellable: false },
        async () => {
            const report = await container.get('gitAnalyzer').auditCodeowners(repoPath);

            if (!report) {
                vscode.window.showInformationMessage('No CODEOWNERS file found in this repository.');
                return;
            }

            const problems = report.findings.length + report.malformed.length + (report.oversized ? 1 : 0);
            if (problems === 0) {
                vscode.window.showInformationMessage(
                    `✅ CODEOWNERS looks healthy — ${report.ruleCount} rule${report.ruleCount === 1 ? '' : 's'}, every owner still active.`
                );
                return;
            }

            const lines = [`# CODEOWNERS audit\n`, `\`${report.path}\` — ${report.ruleCount} rules, ${problems} issue${problems === 1 ? '' : 's'} found.\n`];

            if (report.oversized) {
                lines.push(`## File too large\n`);
                lines.push(`This file is ${(report.sizeBytes / 1024 / 1024).toFixed(1)}MB. GitHub stops loading CODEOWNERS entirely above 3MB, so **none of these rules are in effect**.\n`);
            }

            if (report.malformed.length > 0) {
                lines.push(`## Lines GitHub will silently skip\n`);
                report.malformed.forEach(m => {
                    lines.push(`- **Line ${m.line}**: ${m.reason}\n  \`${m.text}\``);
                });
                lines.push('');
            }

            const never = report.findings.filter(f => f.type === 'never-contributed');
            const inactive = report.findings.filter(f => f.type === 'inactive');

            if (never.length > 0) {
                lines.push(`## Owners with no commits\n`);
                lines.push(`Reviews for these paths route to someone git history has never seen.\n`);
                never.forEach(f => lines.push(`- **Line ${f.line}** \`${f.pattern}\` → ${f.owner}`));
                lines.push('');
            }

            if (inactive.length > 0) {
                lines.push(`## Owners inactive for 6+ months\n`);
                lines.push(`Still routing reviews here, but these people have stopped committing.\n`);
                inactive.forEach(f => lines.push(`- **Line ${f.line}** \`${f.pattern}\` → ${f.owner}`));
                lines.push('');
            }

            lines.push(`---\n`);
            lines.push(`*Owner handles are matched against git author names and emails, which don't always correspond to platform handles — verify before removing anyone.*`);

            const doc = await vscode.workspace.openTextDocument({
                content: lines.join('\n'),
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        }
    );
}

/**
 * Show knowledge-handoff risks across the repo (high author turnover).
 */
async function showHandoffRisks() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace open');
        return;
    }

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '🤝 Analyzing knowledge handoff risks...', cancellable: false },
        async () => {
            const risks = await container.get('handoffAssistant').identifyRisks(workspaceFolders[0].uri.fsPath);

            if (risks.length === 0) {
                vscode.window.showInformationMessage('✅ No high-turnover handoff risks detected.');
                return;
            }

            const items = risks.map(r => ({
                label: `⚠️ ${path.basename(r.file)}`,
                description: `Risk ${r.riskScore}/100 · ${r.authorCount} authors`,
                detail: `${r.file} — ${r.status} across ${r.commits} commits`,
                file: r.file
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `${risks.length} file(s) with knowledge-handoff risk`,
                matchOnDetail: true
            });

            if (selected) {
                const uri = vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath, selected.file));
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc);
            }
        }
    );
}

/**
 * Find who to ask about the current file.
 */
async function findExperts() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active file');
        return;
    }

    const experts = await container.get('mentorshipMatcher').findExpertsForFile(editor.document.uri);

    if (experts.length === 0) {
        vscode.window.showInformationMessage('No ownership data available for this file.');
        return;
    }

    await vscode.window.showQuickPick(
        experts.map(e => ({
            label: `👤 ${e.expert}`,
            description: `${e.proximity}% ownership`,
            detail: e.reason
        })),
        { placeHolder: `Ask these people about ${path.basename(editor.document.uri.fsPath)}` }
    );
}

/**
 * V6: Add Decision
 */
function addDecision() {
    const terminal = vscode.window.createTerminal('Lore');
    terminal.show();
    terminal.sendText('lore add');
}

/**
 * V5: Check Hot Potato
 */
async function checkHotPotato() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    try {
        vscode.window.showInformationMessage('Analyzing ownership turnover... 🔥');
        const potatoes = await container.get('gitAnalyzer').detectHotPotato(workspaceFolders[0].uri.fsPath);

        if (potatoes.length === 0) {
            vscode.window.showInformationMessage('✅ No hot potatoes detected!');
        } else {
            const items = potatoes.map(p => ({
                label: `🔥 ${path.basename(p.file)}`,
                description: `${p.authorCount} authors`,
                detail: `High turnover in last ${p.commits} commits`
            }));

            vscode.window.showQuickPick(items, { placeHolder: 'Hot Potato Files' });
        }
    } catch (e) {
        vscode.window.showErrorMessage('Hot potato check failed');
    }
}

/**
 * Extension deactivation
 */
function deactivate() {
    // container.get() throws for unregistered keys (e.g. if activation failed
    // part-way), so let the container walk what actually got registered.
    container.disposeAll();
}

/**
 * God-Tier: Pair program with a "Ghost" of a historical author.
 */
async function chatWithGhost(author, hash, repoPath, fileName) {
    try {
        vscode.window.showInformationMessage(`Contacting the digital twin of ${author}... 👻`);

        // 1. Get history for this author (subset)
        const timeline = await container.get('gitAnalyzer').getFileTimeline(repoPath, fileName);
        const authorCommits = (timeline.commits || []).filter(c => c.author === author);

        // 2. Generate persona
        const persona = await container.get('aiService').generateHistoricalPersona(author, authorCommits);

        // 3. Open chat session
        const userMsg = await vscode.window.showInputBox({
            prompt: `Ghost of ${author}: "${persona}"`,
            placeHolder: "Ask the ghost about their original architectural intent..."
        });

        if (userMsg) {
            vscode.window.showInformationMessage(`Invoking the echo of ${author}...`);
            const chatContext = `File: ${path.basename(fileName)}, Commit Hash: ${hash}`;
            const response = await container.get('aiService').chatWithGhost(author, persona, userMsg, chatContext);

            // Show response in a markdown document for better readability
            const doc = await vscode.workspace.openTextDocument({
                content: `# 👻 Ghost of ${author}\n\n**Persona**: ${persona}\n\n---\n\n**Response**:\n${response}`,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        }
    } catch (e) {
        vscode.window.showErrorMessage(`Temporal pairing failed: ${e.message}`);
    }
}

/**
 * God-Tier: Run a file's historical state in the Time Machine REPL.
 */
async function runTimeMachine(commitHash, filePath, repoPath) {
    try {
        vscode.window.showInformationMessage(`Initiating Time Machine virtual execution... 🌀 [${commitHash.substring(0, 7)}]`);

        const output = await container.get('timeMachine').runVirtual(repoPath, filePath, commitHash);

        const doc = await vscode.workspace.openTextDocument({
            content: `# 🌀 Time Machine REPL Output\n\n**Commit**: ${commitHash}\n**File**: ${path.basename(filePath)}\n\n---\n\n**Console Output**:\n\`\`\`\n${output}\n\`\`\``,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    } catch (e) {
        vscode.window.showErrorMessage(`Time Machine failure: ${e.message}`);
    }
}

/**
 * God-Tier: Show 3D Architectural Gravity Well.
 */
async function showGravityWell() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    try {
        const cacheKey = `${editor.document.uri.fsPath}-${editor.document.version}`;
        const analysis = analysisCache.get(cacheKey);

        if (!analysis) {
            vscode.window.showWarningMessage('Please wait for file analysis to complete.');
            return;
        }

        container.get('gravityWellPanel').show(analysis);
    } catch (e) {
        vscode.window.showErrorMessage(`Gravity Well failure: ${e.message}`);
    }
}

/**
 * God-Tier: Replay the creation of code via Ghost Cursor.
 */
async function replayGhost(hash) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    try {
        const repoPath = vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath;
        if (!repoPath) return;

        vscode.window.showInformationMessage(`Synthesizing keystrokes for commit ${hash.substring(0, 7)}...`);

        // Use git-analyzer to get the diff (simplified)
        const diff = await container.get('gitAnalyzer').getCommitDiff(repoPath, hash);
        await container.get('ghostCursor').replay(editor, diff);
    } catch (e) {
        vscode.window.showErrorMessage(`Ghost Cursor failure: ${e.message}`);
    }
}

/**
 * God-Tier: Show Project-Wide Isometric Activity Pulse.
 */
async function showPulse() {
    try {
        const repoPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!repoPath) return;

        vscode.window.showInformationMessage('Synthesizing project-wide architectural pulse... 🏙️');

        // Use repo-analyzer to get project stats
        const stats = await container.get('repoAnalyzer').analyzeAllFiles(repoPath);

        // Transform stats for the pulse panel
        const repoData = {
            files: (stats.files || []).map(f => ({
                path: f.path,
                size: f.lines,
                age: f.maxAge,
                activity: f.churn / 100 // Normalized
            }))
        };

        container.get('pulsePanel').show(repoData);
    } catch (e) {
        vscode.window.showErrorMessage(`Pulse failure: ${e.message}`);
    }
}

/**
 * Centurion: Fuzzy Search Command Palette
 */
async function showCommandPalette() {
    const commands = [
        { label: 'Analyze Current File', command: 'vestige.analyze', detail: 'Force re-analysis of the current file history' },
        { label: 'Show File Timeline', command: 'vestige.showTimeline', detail: 'Open the temporal timeline for the current file' },
        { label: 'Show Lore Decisions 📜', command: 'vestige.showLore', detail: 'Browse architectural decisions linked to this file' },
        { label: 'Ask AI Historian 💬', command: 'vestige.aiHistorian', detail: 'Ask a "why" question about the codebase' },
        { label: 'Add Lore Decision', command: 'vestige.addDecision', detail: 'Record a new architectural decision' },
        { label: 'Rewind Time ⏪', command: 'vestige.rewind', detail: 'Workspace-wide time travel' },
        { label: 'Time Travel Scrubbing 🕰️', command: 'vestige.openTimeTravel', detail: 'Scrub through the current file\'s history' },
        { label: 'Architecture Map 🔭', command: 'vestige.showArchitectureMap', detail: 'Emergent modules from co-change analysis' },
        { label: 'Toggle Echo Chamber', command: 'vestige.toggleEcho', detail: 'Auditory code health feedback' },
        { label: 'Show 3D Gravity Well', command: 'vestige.showGravityWell', detail: 'Architectural coupling visualization' },
        { label: 'Team Dashboard 📊', command: 'vestige.showDashboard', detail: 'Repository health overview' },
        { label: 'Code Graveyard 💀', command: 'vestige.showGraveyard', detail: 'Browse and resurrect deleted files' }
    ];

    const selected = await vscode.window.showQuickPick(commands, {
        placeHolder: 'Vestige: Search commands...',
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (selected) {
        vscode.commands.executeCommand(selected.command);
    }
}

// ─────────────────────────────────────────────────────────
// V7: Groundbreaking Innovation Commands
// ─────────────────────────────────────────────────────────

/**
 * Living Code Historian — ask a question about the current file.
 * Uses persistent conversation threads per file for contextual AI answers.
 */
async function askHistorian(filePath, lineNo) {
    const editor = vscode.window.activeTextEditor;
    const fp = filePath || editor?.document?.uri?.fsPath;
    if (!fp) return;

    const question = await vscode.window.showInputBox({
        prompt: `💬 Ask the Living Code Historian about ${path.basename(fp)}`,
        placeHolder: 'e.g. Why was this function created? Who originally owned this? When did this change dramatically?',
    });
    if (!question) return;

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fp));
    if (!workspaceFolder) return;

    const cacheKey = Array.from(analysisCache.keys()).find(k => k.startsWith(fp));
    const analysis = cacheKey ? analysisCache.get(cacheKey) : null;
    const decisions = container.get('loreService') ? await container.get('loreService').getDecisionsForFile(fp) : [];

    vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '💬 Historian is thinking...', cancellable: false },
        async () => {
            try {
                const { answer, evidence } = await container.get('aiService').askHistorian(fp, question, analysis, decisions);

                const panel = vscode.window.createWebviewPanel(
                    'vestigeHistorian',
                    `Historian: ${path.basename(fp)}`,
                    vscode.ViewColumn.Beside,
                    { enableScripts: false, localResourceRoots: [extensionContext.extensionUri] }
                );
                const cssUri = panel.webview.asWebviewUri(
                    vscode.Uri.joinPath(extensionContext.extensionUri, 'vestige.css')
                );

                // The answer is always shown next to the commits it was drawn
                // from. An unsourced narration of "why this code exists" is the
                // exact failure mode of AI code comprehension, and a reader new
                // to the codebase cannot catch it — so the sources are not an
                // optional extra here, they are the check on the answer.
                const commitRows = (evidence.commits || []).map(c => `
                    <tr>
                        <td class="v-mono">${escapeHtml(c.hash)}</td>
                        <td>${escapeHtml(c.author)}</td>
                        <td>${c.date ? escapeHtml(new Date(c.date).toLocaleDateString()) : '—'}</td>
                        <td>${escapeHtml(c.message)}</td>
                    </tr>`).join('');

                const decisionRows = (evidence.decisions || []).map(d => `
                    <li>${escapeHtml(d.title)} <span class="v-badge">${escapeHtml(d.status)}</span></li>`).join('');

                const evidenceSection = (commitRows || decisionRows) ? `
                    <section class="v-section">
                        <h2 class="v-section-title">What this is based on</h2>
                        <div class="v-card">
                            <p class="v-caption" style="margin-top:0">Check the answer against these. If it says something these don't support, it is wrong.</p>
                            ${commitRows ? `
                            <div class="v-table-wrap">
                                <table class="v-table">
                                    <thead><tr>
                                        <th scope="col">Commit</th>
                                        <th scope="col">Author</th>
                                        <th scope="col">Date</th>
                                        <th scope="col">Message</th>
                                    </tr></thead>
                                    <tbody>${commitRows}</tbody>
                                </table>
                            </div>` : ''}
                            ${decisionRows ? `<p class="v-caption" style="margin-bottom:4px">Recorded decisions</p><ul>${decisionRows}</ul>` : ''}
                        </div>
                    </section>` : `
                    <section class="v-section">
                        <div class="v-note v-note--warn">No commits or recorded decisions were available as evidence for this file, so treat the answer above with particular caution.</div>
                    </section>`;

                panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; font-src ${panel.webview.cspSource};">
    <title>Code Historian</title>
    <link rel="stylesheet" href="${cssUri}">
</head>
<body>
    <main class="v-page">
        <header class="v-header">
            <h1 class="v-title">Code Historian</h1>
            <p class="v-subtitle"><span class="v-mono">${escapeHtml(path.basename(fp))}</span> — ask again with Ctrl+Shift+H</p>
        </header>
        <section class="v-section">
            <h2 class="v-section-title">Question</h2>
            <div class="v-note">${escapeHtml(question)}</div>
        </section>
        <section class="v-section">
            <h2 class="v-section-title">Answer</h2>
            <div class="v-card"><p style="margin:0">${escapeHtml(answer).replace(/\n/g, '<br>')}</p></div>
        </section>
        ${evidenceSection}
    </main>
</body>
</html>`;
            } catch (err) {
                vscode.window.showErrorMessage(`Historian error: ${err.message}`);
            }
        }
    );
}

/**
 * Resurrection Mode — re-implement dead/zombie code in the original author's style.
 */
async function resurrectWithGhost(filePath, lineNo, author) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const fp = filePath || editor.document.uri.fsPath;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fp));
    if (!workspaceFolder) return;

    // Get selected code or the current function block
    const selection = editor.selection;
    const deadCode = selection.isEmpty
        ? editor.document.lineAt(selection.active.line).text
        : editor.document.getText(selection);

    // Invoked from the CodeLens the author is supplied; from the Command
    // Palette it isn't — fall back to the file's dominant historical author.
    if (!author) {
        const cacheKey = Array.from(analysisCache.keys()).find(k => k.startsWith(fp));
        const cachedAnalysis = cacheKey ? analysisCache.get(cacheKey) : null;
        author = cachedAnalysis?.ownership?.topAuthor;

        if (!author || author === 'None') {
            const busFactor = await container.get('gitAnalyzer')
                .calculateBusFactor(workspaceFolder.uri.fsPath, fp)
                .catch(() => null);
            author = busFactor?.contributors?.[0]?.name;
        }
        if (!author) {
            vscode.window.showWarningMessage('Could not determine an original author for this code.');
            return;
        }
    }

    const modernContext = await vscode.window.showInputBox({
        prompt: `💀 What should this code do today? (${author}'s ghost will re-implement it)`,
        placeHolder: 'e.g. Handle OAuth2 token refresh with retry logic and proper error types',
    });
    if (!modernContext) return;

    // Get author commits for style extraction
    const recentCommits = await container.get('gitAnalyzer').getRecentCommits(workspaceFolder.uri.fsPath, 50)
        .catch(() => []);
    const authorCommits = recentCommits.filter(c => c.author === author);

    vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `💀 ${author}'s Ghost is resurrecting...`, cancellable: false },
        async () => {
            try {
                const result = await container.get('aiService').resurrectWithGhost(author, deadCode, modernContext, authorCommits);
                const panel = vscode.window.createWebviewPanel(
                    'vestigeResurrection',
                    `💀 Resurrection: ${author}'s Ghost`,
                    vscode.ViewColumn.Beside,
                    { enableScripts: false }
                );
                panel.webview.html = `<!DOCTYPE html><html><body style="font-family:system-ui;padding:20px;color:#e2e8f0;background:#0f172a">
                    <h2 style="color:#7c3aed">💀 Resurrection Mode</h2>
                    <p style="color:#94a3b8">Re-implemented by <strong>${escapeHtml(author)}</strong>'s Ghost</p>
                    <hr style="border-color:#334155">
                    <pre style="background:#1e293b;padding:16px;border-radius:8px;overflow:auto;color:#a3e635">${escapeHtml(result.reimplemented)}</pre>
                    <p style="color:#64748b;font-size:13px;margin-top:12px">🎨 Style Notes: ${escapeHtml(result.styleNotes)}</p>
                </body></html>`;
            } catch (err) {
                vscode.window.showErrorMessage(`Resurrection failed: ${err.message}`);
            }
        }
    );
}

/**
 * Architectural Gravity Map — builds co-change graph and shows emergent clusters.
 */
async function showArchitectureMap() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '🔭 Building Architectural Gravity Map...', cancellable: false },
        async (progress) => {
            try {
                progress.report({ message: 'Analyzing co-change history (up to 500 commits)...' });
                const { nodes, edges, clusters, commitCount } = await container.get('gitAnalyzer').buildCoChangeGraph(
                    workspaceFolder.uri.fsPath, 500
                );

                const panel = vscode.window.createWebviewPanel(
                    'vestigeArchMap',
                    '🔭 Architectural Gravity Map',
                    vscode.ViewColumn.One,
                    { enableScripts: false }
                );

                const clusterHtml = clusters.slice(0, 20).map((c, i) => `
                    <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px;margin:8px 0">
                        <div style="display:flex;justify-content:space-between;align-items:center">
                            <strong style="color:#7c3aed">${escapeHtml(c.name || `Cluster ${i + 1}`)}</strong>
                            <span style="background:#581c87;color:#e9d5ff;padding:2px 8px;border-radius:12px;font-size:11px">${c.memberCount} files</span>
                        </div>
                        <div style="margin-top:8px;color:#64748b;font-size:12px">${escapeHtml(c.members.slice(0, 5).join(' · '))}${c.members.length > 5 ? ` +${c.members.length - 5} more` : ''}</div>
                        <div style="margin-top:4px;color:#475569;font-size:11px">Coupling strength: ${c.strength}</div>
                    </div>
                `).join('');

                panel.webview.html = `<!DOCTYPE html><html><body style="font-family:system-ui;padding:20px;color:#e2e8f0;background:#0f172a">
                    <h2 style="color:#7c3aed">🔭 Architectural Gravity Map</h2>
                    <p style="color:#94a3b8">Emergent modules detected from <strong>${commitCount}</strong> commits · <strong>${nodes.length}</strong> files · <strong>${edges.length}</strong> coupling edges</p>
                    <p style="color:#64748b;font-size:13px">These clusters reveal your <em>real</em> architecture — files that change together, belong together.</p>
                    <hr style="border-color:#334155">
                    ${clusterHtml || '<p style="color:#64748b">Not enough co-change data. Commit more code!</p>'}
                    <p style="color:#475569;font-size:11px;margin-top:20px">💡 Use the Gravity Well panel (vestige.showGravityWell) for the interactive force graph visualization.</p>
                </body></html>`;
            } catch (err) {
                vscode.window.showErrorMessage(`Architecture map failed: ${err.message}`);
            }
        }
    );
}

module.exports = {
    activate,
    deactivate
};
