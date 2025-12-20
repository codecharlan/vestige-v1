const vscode = require('vscode');
const GitAnalyzer = require('./git-analyzer');
const Decorators = require('./decorators');
const TimelinePanel = require('./timeline-panel');

const FileDecorator = require('./file-decorator');
const VestigeDocumentProvider = require('./document-provider');
const EvolutionPanel = require('./evolution-panel');
const GraveyardPanel = require('./graveyard-panel');
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
const LeaderboardPanel = require('./leaderboard-panel');
const PerformancePanel = require('./performance-panel');
const FlowPanel = require('./flow-panel');
// V6
const { LoreService } = require('./lore-service');

let gitAnalyzer;
let decorators;
let fileDecorator;
let timelinePanel;
let evolutionPanel;
let graveyardPanel;
let documentProvider;
let statusBarItem;
let healthStatusBar; // V4
let repoAnalyzer; // V4
let achievements; // V4
let dashboardPanel; // V4
let aiService; // V4
// V5
let debtCalculator;
let bugAnalyzer;
let zombieDetector;
let rewindManager;
let leaderboardPanel;
let performancePanel;
let flowPanel;
// V6
let loreService;

let analysisCache = new Map();
let isEnabled = true;

/**
 * Extension activation
 */
function activate(context) {
    console.log('Vestige is now active');

    gitAnalyzer = new GitAnalyzer();
    decorators = new Decorators(context);
    fileDecorator = new FileDecorator(gitAnalyzer);
    timelinePanel = new TimelinePanel(context);
    evolutionPanel = new EvolutionPanel(context, gitAnalyzer);
    graveyardPanel = new GraveyardPanel(context, gitAnalyzer);
    documentProvider = new VestigeDocumentProvider();

    // V4 initialization
    repoAnalyzer = new RepoAnalyzer(gitAnalyzer);
    achievements = new AchievementSystem(context);
    dashboardPanel = new DashboardPanel(context, repoAnalyzer);
    aiService = new AIService();

    // V5 initialization
    debtCalculator = new DebtCalculator(gitAnalyzer);
    bugAnalyzer = new BugAnalyzer(gitAnalyzer);
    zombieDetector = new ZombieDetector(gitAnalyzer);
    rewindManager = new RewindManager(context);
    leaderboardPanel = new LeaderboardPanel(context, achievements);
    performancePanel = new PerformancePanel(context);
    flowPanel = new FlowPanel(context);

    // V6 initialization
    loreService = new LoreService();
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        loreService.initialize(vscode.workspace.workspaceFolders[0].uri.fsPath);
    }

    // Register Document Provider
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('vestige-git', documentProvider)
    );

    // Create status bar items
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'vestige.showTimeline';
    context.subscriptions.push(statusBarItem);

    // V4: Health status bar
    healthStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    healthStatusBar.command = 'vestige.showDashboard';
    healthStatusBar.text = '$(loading~spin) Analyzing...';
    context.subscriptions.push(healthStatusBar);

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
        vscode.commands.registerCommand('vestige.showLeaderboard', showLeaderboard),
        vscode.commands.registerCommand('vestige.showPerformance', showPerformance),
        vscode.commands.registerCommand('vestige.showFlow', showFlow),
        vscode.commands.registerCommand('vestige.checkDrift', checkDrift),
        vscode.commands.registerCommand('vestige.checkHotPotato', checkHotPotato),
        // V6 commands
        vscode.commands.registerCommand('vestige.showLore', showLore),
        vscode.commands.registerCommand('vestige.aiHistorian', aiHistorian),
        vscode.commands.registerCommand('vestige.addDecision', addDecision),
        vscode.commands.registerCommand('vestige.promoteLore', promoteLore)
    );

    // Auto-analyze on file open/change
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && isEnabled) {
                analyzeCurrentFile();
            } else {
                statusBarItem.hide();
            }
        }),
        vscode.workspace.onDidSaveTextDocument(document => {
            if (vscode.window.activeTextEditor &&
                vscode.window.activeTextEditor.document === document &&
                isEnabled) {
                // Clear cache for this file on save to get fresh git status
                // Also clear previous version keys if possible, but for now just analyze
                analyzeCurrentFile(true); // Force refresh

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
}

/**
 * V4: Calculate and display repo health
 */
async function calculateRepoHealth(repoPath) {
    try {
        healthStatusBar.show();
        const health = await repoAnalyzer.calculateRepoHealth(repoPath);

        const icon = health.score >= 8 ? '$(check)' : health.score >= 5 ? '$(warning)' : '$(error)';
        healthStatusBar.text = `${icon} Repo Health: ${health.score}/10`;
        healthStatusBar.tooltip = `Bus Factor: ${health.metrics.avgBusFactor || 'N/A'}\nFossil Code: ${health.metrics.fossilPercent || 0}%\nClick for dashboard`;
    } catch (error) {
        healthStatusBar.text = '$(question) Repo Health: N/A';
        healthStatusBar.tooltip = 'Click to analyze repository';
    }
}

/**
 * V4: Check if edit qualifies for achievement
 */
async function checkEditAchievement(repoPath, filePath) {
    try {
        const busFactor = await gitAnalyzer.calculateBusFactor(repoPath, filePath);
        if (busFactor && busFactor.busFactor === 1) {
            await achievements.trackAction('editBusFactor1');
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
        statusBarItem.hide();
        return;
    }

    const document = editor.document;
    const filePath = document.uri.fsPath;

    // Only analyze git-tracked files (heuristic)
    if (document.isUntitled || document.uri.scheme !== 'file') {
        statusBarItem.hide();
        return;
    }

    try {
        // Check cache first
        const cacheKey = `${filePath}-${document.version}`;
        let analysis = force ? null : analysisCache.get(cacheKey);

        if (!analysis) {
            statusBarItem.text = "$(sync~spin) Vestige";
            statusBarItem.tooltip = "Analyzing git history...";
            statusBarItem.show();

            // Get git analysis
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (!workspaceFolder) {
                statusBarItem.hide();
                return;
            }

            analysis = await gitAnalyzer.analyzeFile(
                workspaceFolder.uri.fsPath,
                filePath
            );

            // Calculate extra metrics
            analysis.ownership = gitAnalyzer.calculateOwnership(analysis.lines);

            // Stability Score: 100 - (commits * 2), min 0
            const stability = Math.max(0, 100 - (analysis.churn.totalCommits * 2));
            analysis.stability = stability;

            // Elite: Ownership Heat
            analysis.ownershipHeat = gitAnalyzer.calculateOwnershipHeat(analysis);

            // Elite: Narrative Biography
            analysis.narrativeBiography = gitAnalyzer.generateNarrativeBiography(analysis);

            // Elite: Ghost Shadows (Recent Deletions)
            analysis.deletedChunks = await gitAnalyzer.findRecentDeletions(workspaceFolder.uri.fsPath, filePath);

            // Cache the result
            analysisCache.set(cacheKey, analysis);

            // Limit cache size
            if (analysisCache.size > 50) {
                const firstKey = analysisCache.keys().next().value;
                analysisCache.delete(firstKey);
            }
        }

        // Apply decorations
        decorators.applyDecorations(editor, analysis);

        // Elite: Structural Intelligence
        const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri) || [];
        analysis.zombieMethods = await detectZombieMethods(analysis, symbols, document);

        // Update status bar
        const stabilityIcon = analysis.stability > 80 ? '$(shield)' : analysis.stability > 50 ? '$(warning)' : '$(flame)';
        let statusText = `${stabilityIcon} ${analysis.stability}% | 👤 ${analysis.ownership.topAuthor} (${analysis.ownership.percent}%)`;

        if (analysis.interestRate > 50) statusText += ` | 💸 ${analysis.interestRate}% Interest`;

        statusBarItem.text = statusText;
        statusBarItem.tooltip = `Vestige Analysis:\n- Stability: ${analysis.stability}%\n- Top Author: ${analysis.ownership.topAuthor}\n- Interest Rate: ${analysis.interestRate}%\n- Originality: ${analysis.originalityIndex}%\n\nClick to show timeline`;
        statusBarItem.show();

        // Elite: Actionable Coupling Notification
        checkCoupledFiles(analysis, document.uri);

        // Elite: Achievements
        achievements.checkAchievements('analysis', null, analysis);

    } catch (error) {
        console.error('Vestige analysis error:', error);
        statusBarItem.text = "$(warning) Vestige";
        statusBarItem.tooltip = `Analysis failed: ${error.message}`;
        statusBarItem.show();
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
                const isAllOld = lines.every(l => l.date < oneYearAgo);
                if (isAllOld && analysis.churn.totalCommits > 10) {
                    zombies.push({
                        name: symbol.name,
                        ageDays: Math.round((now - Math.min(...lines.map(l => l.date))) / (1000 * 60 * 60 * 24)),
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
 * Elite: Actionable Coupling
 */
function checkCoupledFiles(analysis, uri) {
    if (analysis.knowledgeNeighbors && analysis.knowledgeNeighbors.length > 0) {
        const strongCouples = analysis.knowledgeNeighbors.filter(n => n.strength > 5);
        if (strongCouples.length > 0) {
            const list = strongCouples.map(c => c.name).join(', ');
            // Debounce or only show once per session for this file
            vscode.window.showInformationMessage(`🔗 Actionable Coupling: This file is often changed with members like ${list}. Consider checking their context.`);
        }
    }
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
        const timeline = await gitAnalyzer.getFileTimeline(
            workspaceFolder.uri.fsPath,
            document.uri.fsPath
        );

        // Add coupling info
        const coupling = await gitAnalyzer.getCoupledFiles(
            workspaceFolder.uri.fsPath,
            document.uri.fsPath
        );

        // V3: Add epochs
        const epochs = await gitAnalyzer.detectEpochs(workspaceFolder.uri.fsPath);

        // V3: Add bus factor
        const busFactor = await gitAnalyzer.calculateBusFactor(
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
        timeline.narrative = analysis ? analysis.narrativeBiography : 'Analyzing history...';

        // V6: Get decisions
        const decisions = loreService.getDecisionsForFile(document.uri.fsPath);

        timelinePanel.show(timeline, document.uri.fsPath, decisions);
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
        const timeline = await gitAnalyzer.getFileTimeline(
            workspaceFolder.uri.fsPath,
            document.uri.fsPath
        );

        evolutionPanel.show(document.uri.fsPath, timeline.commits, workspaceFolder.uri.fsPath);
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
    await graveyardPanel.refresh(repoPath);
    vscode.window.showInformationMessage('Graveyard refreshed!');
}

/**
 * V3: View deleted file
 */
async function viewDeletedFile(file) {
    if (!file || !file.file) return;

    const fileData = file.file;
    const uri = vscode.Uri.parse(`vestige-git:/${fileData.commit}/${fileData.path}?${file.file.repoPath || ''}`);

    try {
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
    if (!file || !file.file) return;

    const fileData = file.file;
    const action = await vscode.window.showInformationMessage(
        `Resurrect ${fileData.path}?`,
        'Yes', 'No'
    );

    if (action === 'Yes') {
        vscode.window.showInformationMessage(`Resurrecting ${fileData.path}...`);
        // Implementation would use git show to restore file
        vscode.window.showWarningMessage('Resurrect feature coming soon!');
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
        decorators.clearDecorations();
        statusBarItem.hide();
        vscode.window.showInformationMessage('Vestige: Annotations disabled');
    }
}

/**
 * Clear analysis cache
 */
function clearCache() {
    analysisCache.clear();
    decorators.clearDecorations();
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

    const repoPath = workspaceFolders[0].uri.fsPath;

    try {
        const health = await repoAnalyzer.calculateRepoHealth(repoPath);
        await dashboardPanel.show(repoPath, { health });

        // Track achievement
        await achievements.trackAction('viewDashboard');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to load dashboard: ${error.message}`);
    }
}

/**
 * V4: Show achievements
 */
async function showAchievements() {
    const progress = achievements.getProgress();
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
        const explanation = await aiService.explainDiff(filePath, commitHash, gitAnalyzer, repoPath);

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
        const debt = await debtCalculator.calculateDebt(workspaceFolder.uri.fsPath, editor.document.uri.fsPath);
        if (debt) {
            vscode.window.showInformationMessage(
                `📉 Technical Debt: $${debt.cost} (${debt.score} points)`,
                `Complexity: ${debt.complexity}`,
                `Churn: ${debt.churn}`
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
        const bugs = await bugAnalyzer.analyze(workspaceFolder.uri.fsPath, editor.document.uri.fsPath);
        if (bugs) {
            vscode.window.showInformationMessage(
                `🐛 Bug Density: ${(bugs.density * 100).toFixed(1)}%`,
                `Total Bugs: ${bugs.bugCount}`
            );
        }
    } catch (e) {
        vscode.window.showErrorMessage('Failed to analyze bugs');
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
        const zombies = await zombieDetector.scan(workspaceFolders[0].uri.fsPath);
        await zombieDetector.showReport(zombies);
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
        await rewindManager.startRewind(workspaceFolders[0].uri.fsPath, commit);
    }
}

/**
 * V5: Stop Rewind
 */
async function stopRewind() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    await rewindManager.stopRewind(workspaceFolders[0].uri.fsPath);
}

/**
 * V5: Show Leaderboard
 */
function showLeaderboard() {
    leaderboardPanel.show();
}

/**
 * V5: Show Performance
 */
function showPerformance() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    performancePanel.show(workspaceFolders[0].uri.fsPath);
}

/**
 * V5: Show Flow
 */
function showFlow() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    flowPanel.show(workspaceFolders[0].uri.fsPath);
}

/**
 * V5: Check Documentation Drift
 */
async function checkDrift() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    try {
        vscode.window.showInformationMessage('Checking documentation drift... 📚');
        const alerts = await gitAnalyzer.analyzeDocumentationDrift(workspaceFolders[0].uri.fsPath);

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

    const decisions = loreService.getDecisionsForFile(editor.document.uri.fsPath);
    achievements.checkAchievements('loreAdded', decisions.length);
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

        const leanContent = `Decision {
  title: "${title}"
  status: "Decided"
  date: "${new Date().toISOString().split('T')[0]}"
  context: "Extracted from Git history (Commit ${hash.substring(0, 7)})"
  decision: "${content}"
  files: ["${fileName}"]
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
    const decisions = loreService.searchDecisions(query);
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
        const recentCommits = await gitAnalyzer.getRecentCommits(
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
        const answer = await aiService.explainText(prompt);

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
        const potatoes = await gitAnalyzer.detectHotPotato(workspaceFolders[0].uri.fsPath);

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
    if (decorators) decorators.dispose();
    if (fileDecorator) fileDecorator.dispose();
    if (timelinePanel) timelinePanel.dispose();
    if (statusBarItem) statusBarItem.dispose();
    if (healthStatusBar) healthStatusBar.dispose();
    if (dashboardPanel) dashboardPanel.dispose();
    if (evolutionPanel) evolutionPanel.dispose();
    if (graveyardPanel) graveyardPanel.dispose();
    if (leaderboardPanel) leaderboardPanel.dispose(); // V5
    if (performancePanel) performancePanel.dispose(); // V5
    if (flowPanel) flowPanel.dispose(); // V5
}

module.exports = {
    activate,
    deactivate
};
