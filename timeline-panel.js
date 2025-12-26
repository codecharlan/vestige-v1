const vscode = require('vscode');
const path = require('path');

class TimelinePanel {
    constructor(context) {
        this.context = context;
        this.panel = null;
        this.currentFileName = '';
    }

    getROIColor(roi) {
        if (roi > 70) return '#ff5252';
        if (roi > 40) return '#ffd740';
        return '#69f0ae';
    }

    getSafetyColor(score) {
        if (score > 70) return '#69f0ae';
        if (score > 40) return '#ffd740';
        return '#ff5252';
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

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
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
                switch (message.command) {
                    case 'viewCommit':
                        vscode.commands.executeCommand('vestige.openFileAtCommit', message.hash, fileName, analysis.repoPath);
                        break;
                    case 'promoteLore':
                        vscode.commands.executeCommand('vestige.promoteLore', message.type, message.content, message.hash, analysis.repoPath, fileName);
                        break;
                    case 'chatWithGhost':
                        vscode.commands.executeCommand('vestige.chatWithGhost', message.author, message.hash, analysis.repoPath, fileName);
                        break;
                    case 'shareLore':
                        vscode.commands.executeCommand('vestige.shareLore', message.loreType, message.content);
                        break;
                    case 'runTimeMachine':
                        vscode.commands.executeCommand('vestige.runTimeMachine', message.hash, fileName, analysis.repoPath);
                        break;
                    case 'showGravityWell':
                        vscode.commands.executeCommand('vestige.showGravityWell');
                        break;
                    case 'replayGhost':
                        vscode.commands.executeCommand('vestige.replayGhost', message.hash);
                        break;
                    case 'openWormhole':
                        vscode.commands.executeCommand('vestige.openWormhole', message.hash);
                        break;
                    case 'askArchaeologist':
                        vscode.commands.executeCommand('vestige.askArchaeologist', analysis, fileName);
                        break;
                    case 'getRefactorIdeas':
                        vscode.commands.executeCommand('vestige.getRefactorIdeas', analysis, fileName);
                        break;
                }
            });

            this.panel.onDidDispose(() => { this.panel = null; });
        }

        this.panel.webview.html = this.getWebviewContent(analysis, fileName);
    }

    getWebviewContent(analysis, fileName) {
        const commits = analysis.lines || []; // Using analysis.lines for commits if structure changed, or analysis.commits
        const summary = analysis.churn || { totalCommits: 0, authors: [] };
        const epochs = analysis.epochs || [];
        const busFactor = analysis.busFactor || null;
        const implicitLore = analysis.implicitLore || [];
        const bio = analysis.narrativeBiography || 'Analyzing intelligence...';

        const cssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'vestige.css'));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vestige Timeline</title>
    <link rel="stylesheet" href="${cssUri}">
    <style>
        :root {
            --accent: #60A5FA;
        }
        body {
            font-family: 'Inter', -apple-system, sans-serif;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 30px;
            margin: 0;
            line-height: 1.6;
        }
        .section-header {
            font-size: 0.85em; font-weight: 600; color: #94A3B8;
            text-transform: uppercase; letter-spacing: 0.1em;
            margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
        }
        .stats-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 15px; margin-bottom: 25px;
        }
        .stat-card {
            background: var(--surface); border: 1px solid var(--border);
            padding: 15px; border-radius: 12px; text-align: center;
        }
        .stat-value { font-size: 1.5em; font-weight: 700; color: var(--accent); display: block; }
        .stat-label { font-size: 0.7em; color: #94A3B8; text-transform: uppercase; }
        
        .bio-box {
            background: rgba(96, 165, 250, 0.03); border-left: 3px solid var(--accent);
            padding: 20px; border-radius: 0 12px 12px 0; margin-bottom: 30px;
            font-style: italic; color: #E2E8F0;
        }

        .timeline { position: relative; padding-left: 30px; }
        .timeline::before {
            content: ''; position: absolute; left: 0; top: 0; bottom: 0;
            width: 2px; background: linear-gradient(to bottom, var(--accent), transparent);
            opacity: 0.2;
        }
        .commit {
            background: var(--surface); border: 1px solid var(--border);
            padding: 15px; margin-bottom: 20px; border-radius: 10px;
            position: relative; transition: 0.2s;
        }
        .commit:hover { border-color: var(--accent); transform: translateX(5px); }
        .commit::before {
            content: ''; position: absolute; left: -34px; top: 22px;
            width: 10px; height: 10px; border-radius: 50%;
            background: var(--accent); box-shadow: 0 0 10px var(--accent);
        }
        .badge { padding: 3px 8px; border-radius: 6px; font-size: 0.7em; font-weight: 700; margin-right: 5px; }
        .badge-ghost { background: rgba(126, 87, 194, 0.2); color: #9575CD; }
        .badge-red { background: rgba(239, 68, 68, 0.2); color: #FCA5A5; }
        
        button {
            background: transparent; border: 1px solid var(--border);
            color: var(--accent); padding: 5px 12px; border-radius: 6px;
            cursor: pointer; font-size: 0.8em; margin-top: 10px;
        }
        button:hover { background: var(--accent); color: white; }
    </style>
</head>
<body>
    <h1 style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 1.2em;">🗿</span> Vestige Evolution
        ${analysis.isZenith ? `
            <span class="badge" style="background: rgba(251, 191, 36, 0.2); color: #FBBF24; margin-left: 10px; font-size: 0.6em; border: 1px solid rgba(251, 191, 36, 0.3);">
                🏆 ZENITH STATE
            </span>
        ` : ''}
    </h1>

    <div class="section-header">📜 Narrative Biography</div>
    <div class="bio-box">${bio}</div>

    <div class="section-header">📊 Project Intelligence</div>
    <div class="stats-grid" style="grid-template-columns: repeat(5, 1fr);">
        <div class="stat-card">
            <span class="stat-value">${summary.totalCommits || commits.length}</span>
            <span class="stat-label">Changes</span>
        </div>
        <div class="stat-card">
            <span class="stat-value" style="color: #69f0ae;">${analysis.reputation || 0}</span>
            <span class="stat-label">REPUTATION</span>
        </div>
        <div class="stat-card">
            <span class="stat-value" style="color: ${analysis.debtInterest > 50 ? '#ff5252' : '#69f0ae'}">${analysis.debtInterest}</span>
            <span class="stat-label">Interest</span>
        </div>
        <div class="stat-card">
            <span class="stat-value" style="color: ${this.getROIColor(analysis.refactorROI)}">${analysis.refactorROI || 0}%</span>
            <span class="stat-label">ROI</span>
        </div>
        <div class="stat-card">
            <span class="stat-value" style="color: ${this.getSafetyColor(analysis.safetyScore)}">${analysis.safetyScore || 0}%</span>
            <span class="stat-label">Safety</span>
        </div>
        ${analysis.debtHorizon ? `
            <div class="stat-card" style="border: 1px dashed var(--vestige-pink); background: rgba(244, 114, 182, 0.05);">
                <span class="stat-value" style="color: var(--vestige-pink); font-size: 1em;">+$${analysis.debtHorizon.cost.toLocaleString()}</span>
                <span class="stat-label">Horizon (6mo)</span>
            </div>
        ` : ''}
    </div>

    <div class="glass-card" style="margin-bottom: 25px; padding: 15px; border-top: 1px solid var(--vestige-purple);">
        <div style="font-size: 0.8rem; color: var(--vestige-purple); font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
            <span>💬</span> NATURAL LANGUAGE ARCHAEOLOGIST
        </div>
        <div style="display: flex; gap: 8px;">
            <input type="text" id="nlQuery" placeholder="Ask about this file's history... (e.g., 'Who is the main owner?')" 
                   style="flex: 1; background: rgba(0,0,0,0.2); border: 1px solid var(--vestige-border); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.9em;">
            <button onclick="askNL()" style="margin: 0; padding: 0 15px; border-color: var(--vestige-purple); color: var(--vestige-purple); background: rgba(139, 92, 246, 0.1);">Consult AI</button>
        </div>
    </div>

    <div style="display: flex; gap: 8px; margin-bottom: 30px;">
        <button onclick="showGravityWell()" style="flex: 1; border-color: #F472B6; color: #F472B6; background: rgba(244, 114, 182, 0.05);">
            🌌 View 3D Gravity Well
        </button>
        <button onclick="showPulse()" style="flex: 1; border-color: #60A5FA; color: #60A5FA; background: rgba(96, 165, 250, 0.05);">
            🏙️ View Activity Pulse
        </button>
    </div>

    ${analysis.badges && analysis.badges.length > 0 ? `
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;">
            ${analysis.badges.map(b => `<span class="badge" style="background: ${b.color}33; color: ${b.color}; border: 1px solid ${b.color}66; padding: 4px 10px; font-size: 0.8em;">${b.label}</span>`).join('')}
        </div>
    ` : ''}

    ${analysis.ageDays > 30 ? `
        <div class="section-header">🕵️ AI Code Archaeologist</div>
        <div class="stat-card" style="border-left: 4px solid var(--vestige-purple); background: var(--vestige-glass);">
            <div id="archaeologist-content" style="font-style: italic; color: var(--vestige-text-alt);">
                Analyzing why this file has been stagnant for ${analysis.ageDays} days...
            </div>
            <button onclick="askArchaeologist()" style="margin-top: 10px; border-color: var(--vestige-purple); color: var(--vestige-purple);">
                Consult the Archaeologist
            </button>
        </div>
    ` : ''}

    ${analysis.safetyScore < 70 ? `
        <div class="section-header">🛠️ Predictive Refactoring</div>
        <div class="stat-card" style="border-left: 4px solid var(--vestige-pink); background: var(--vestige-glass);">
            <div id="refactor-content" style="color: var(--vestige-text-alt);">
                Refactor Safety Score is low (${analysis.safetyScore}%). AI suggests high-ROI improvements.
            </div>
            <button onclick="getRefactorIdeas()" style="margin-top: 10px; border-color: var(--vestige-pink); color: var(--vestige-pink);">
                Generate Refactor Plan
            </button>
        </div>
    ` : ''}

    ${analysis.archDrift ? `
        <div class="bio-box" style="border-left-color: #ff5252; background: rgba(255, 82, 82, 0.05); margin-bottom: 20px;">
            <strong style="color: #ff5252;">⚠️ Architectural Drift Warning</strong><br/>
            ${analysis.archDrift.message}
        </div>
    ` : ''}

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
        <div>
            <div class="section-header">👻 Ghost Lore</div>
            <div class="stat-card" style="text-align: left; max-height: 200px; overflow-y: auto;">
                ${implicitLore.length > 0 ? implicitLore.map(l => `
                    <div style="margin-bottom: 10px; font-size: 0.85em; display: flex; justify-content: space-between; align-items: center;">
                        <div style="cursor: pointer; flex: 1;" onclick="promoteLore('${l.type}', '${this.escapeJs(l.content)}', '${l.hash}')">
                            <span class="badge badge-ghost">${l.type.toUpperCase()}</span>
                            <span style="color: #CBD5E1">"${l.content}"</span>
                        </div>
                        <button onclick="shareLore('${l.type}', '${this.escapeJs(l.content)}')" style="margin: 0; padding: 2px 6px; font-size: 0.7em; border-color: var(--vestige-blue); color: var(--vestige-blue);">🚀 Share</button>
                    </div>
                `).join('') : '<span class="stat-label">No implicit insights</span>'}
            </div>
        </div>
        <div>
            <div class="section-header">💬 Social Echoes</div>
            <div class="stat-card" style="text-align: left; max-height: 200px; overflow-y: auto;">
                ${analysis.echoedReviews && analysis.echoedReviews.length > 0 ? analysis.echoedReviews.map(r => `
                    <div style="margin-bottom: 10px; font-size: 0.85em;">
                        <div style="color: #94A3B8; font-size: 0.8em;">${r.author} (${r.hash.substring(0, 7)})</div>
                        <div style="color: #60A5FA; margin-top: 2px;">"${r.content}"</div>
                    </div>
                `).join('') : '<span class="stat-label">No historical PR echoes</span>'}
            </div>
        </div>
    </div>

    ${analysis.butterflyRipples && analysis.butterflyRipples.length > 0 ? `
        <div class="section-header">🦋 Butterfly Effect Predictor</div>
        <div class="stat-card" style="text-align: left; margin-bottom: 30px; border-left: 4px solid #F472B6; background: rgba(244, 114, 182, 0.05);">
            <div style="font-size: 0.85em; color: #F472B6; margin-bottom: 10px; font-weight: 600;">Predicted Downstream Impacts (Secondary Ripples)</div>
            ${analysis.butterflyRipples.map(r => `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div>
                        <div style="font-weight: 500; color: #F8FAFC; font-size: 0.9em;">${r.file}</div>
                        <div style="font-size: 0.75em; color: #94A3B8;">${r.reason}</div>
                    </div>
                    <div style="text-align: right;">
                        <span class="badge" style="background: rgba(244, 114, 182, 0.2); color: #F472B6; font-size: 0.7em;">Depth ${r.depth}</span>
                        <div style="font-size: 0.7em; color: #F472B6; margin-top: 2px;">${r.strength}% Impact</div>
                    </div>
                </div>
            `).join('')}
        </div>
    ` : ''}

    ${analysis.onboardingTour && analysis.onboardingTour.length > 0 ? `
        <div class="section-header">🤝 Onboarding Assistant</div>
        
        <!-- AI-Generated Narrative -->
        ${analysis.onboardingNarrative ? `
            <div class="onboarding-narrative" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(59, 130, 246, 0.05)); border-left: 4px solid #10B981; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                <div style="font-size: 0.85em; color: #10B981; font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                    <span>✨</span> WELCOME TO ${fileName.toUpperCase()}
                </div>
                <p style="font-size: 1em; line-height: 1.6; color: #E2E8F0; margin: 0;">${analysis.onboardingNarrative}</p>
            </div>
        ` : ''}

        <!-- Quick Facts Grid -->
        ${analysis.onboardingRecommendations?.facts ? `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px; margin-bottom: 20px;">
                <div class="stat-card" style="text-align: center; padding: 12px;">
                    <div style="font-size: 1.5em; font-weight: 700; color: #60A5FA;">📅</div>
                    <div style="font-size: 0.9em; color: #94A3B8; margin-top: 4px;">${Math.floor(analysis.onboardingRecommendations.facts.age / 365)}y ${analysis.onboardingRecommendations.facts.age % 365}d</div>
                    <div style="font-size: 0.7em; color: #64748B;">Age</div>
                </div>
                <div class="stat-card" style="text-align: center; padding: 12px;">
                    <div style="font-size: 1.5em; font-weight: 700; color: #F472B6;">🔄</div>
                    <div style="font-size: 0.9em; color: #94A3B8; margin-top: 4px;">${analysis.onboardingRecommendations.facts.totalCommits}</div>
                    <div style="font-size: 0.7em; color: #64748B;">Changes</div>
                </div>
                <div class="stat-card" style="text-align: center; padding: 12px;">
                    <div style="font-size: 1.5em; font-weight: 700; color: #FBBF24;">👥</div>
                    <div style="font-size: 0.9em; color: #94A3B8; margin-top: 4px;">${analysis.onboardingRecommendations.facts.contributors}</div>
                    <div style="font-size: 0.7em; color: #64748B;">Contributors</div>
                </div>
                <div class="stat-card" style="text-align: center; padding: 12px;">
                    <div style="font-size: 1.5em; font-weight: 700; color: #A78BFA;">📏</div>
                    <div style="font-size: 0.9em; color: #94A3B8; margin-top: 4px;">${analysis.onboardingRecommendations.facts.complexity}</div>
                    <div style="font-size: 0.7em; color: #64748B;">Lines</div>
                </div>
            </div>
        ` : ''}

        <!-- Expert Recommendations -->
        ${analysis.onboardingRecommendations?.experts && analysis.onboardingRecommendations.experts.length > 0 ? `
            <div style="margin-bottom: 20px;">
                <div style="font-size: 0.85em; font-weight: 600; color: #94A3B8; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                    <span>💡</span> ASK THESE EXPERTS
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
                    ${analysis.onboardingRecommendations.experts.map(expert => `
                        <div class="expert-card" style="background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; padding: 12px;">
                            <div style="font-weight: 600; color: #60A5FA; font-size: 0.9em; margin-bottom: 4px;">👤 ${expert.name}</div>
                            <div style="font-size: 0.75em; color: #94A3B8; margin-bottom: 6px;">${expert.role}</div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <div style="flex: 1; height: 4px; background: rgba(96, 165, 250, 0.2); border-radius: 2px; overflow: hidden;">
                                    <div style="height: 100%; width: ${expert.ownership}%; background: #60A5FA;"></div>
                                </div>
                                <span style="font-size: 0.7em; color: #60A5FA; font-weight: 600;">${expert.ownership}%</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        <!-- Related Files -->
        ${analysis.onboardingRecommendations?.relatedFiles && analysis.onboardingRecommendations.relatedFiles.length > 0 ? `
            <div style="margin-bottom: 20px;">
                <div style="font-size: 0.85em; font-weight: 600; color: #94A3B8; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                    <span>🔗</span> RELATED FILES
                </div>
                <div style="background: rgba(244, 114, 182, 0.05); border: 1px solid rgba(244, 114, 182, 0.2); border-radius: 8px; padding: 12px;">
                    ${analysis.onboardingRecommendations.relatedFiles.map(file => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(244, 114, 182, 0.1); last-child:border-bottom: none;">
                            <div>
                                <div style="font-size: 0.85em; color: #F472B6; font-weight: 500;">${file.file}</div>
                                <div style="font-size: 0.7em; color: #94A3B8;">${file.reason}</div>
                            </div>
                            <div style="font-size: 0.75em; color: #F472B6; font-weight: 600;">${file.coupling}/10</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        <!-- Milestone Timeline -->
        <div style="margin-bottom: 20px;">
            <div style="font-size: 0.85em; font-weight: 600; color: #94A3B8; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                <span>📍</span> KEY MILESTONES (${analysis.onboardingTour.length})
            </div>
            <div class="milestone-timeline" style="position: relative; padding-left: 30px;">
                <div style="position: absolute; left: 10px; top: 0; bottom: 0; width: 2px; background: linear-gradient(to bottom, #60A5FA, transparent);"></div>
                ${analysis.onboardingTour.map((milestone, index) => `
                    <div class="milestone-item" style="position: relative; margin-bottom: 16px; padding: 12px; background: rgba(255, 255, 255, 0.02); border-radius: 8px; border-left: 3px solid ${milestone.importance > 8 ? '#EF4444' : milestone.importance > 6 ? '#F59E0B' : '#60A5FA'};">
                        <div style="position: absolute; left: -23px; top: 16px; width: 12px; height: 12px; border-radius: 50%; background: ${milestone.importance > 8 ? '#EF4444' : milestone.importance > 6 ? '#F59E0B' : '#60A5FA'}; box-shadow: 0 0 10px currentColor;"></div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="font-size: 1.2em;">${milestone.icon}</span>
                            <span style="font-size: 0.75em; color: #94A3B8; text-transform: uppercase; font-weight: 600;">${milestone.type}</span>
                            ${milestone.date ? `<span style="font-size: 0.7em; color: #64748B;">${new Date(milestone.date).toLocaleDateString()}</span>` : ''}
                        </div>
                        <div style="font-size: 0.9em; color: #E2E8F0; margin-bottom: 4px;">${milestone.content}</div>
                        ${milestone.author ? `<div style="font-size: 0.75em; color: #94A3B8;">by ${milestone.author}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- Interactive Tour Button -->
        <div style="text-align: center; margin-top: 20px;">
            <button onclick="startInteractiveTour()" style="background: linear-gradient(135deg, #10B981, #3B82F6); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 0.9em; cursor: pointer; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
                🎬 Start Interactive Tour
            </button>
        </div>
    ` : ''}

    <div class="section-header">🕙 Evolution Timeline</div>
    <div class="timeline">
        ${commits.length > 0 ? commits.map(c => `
            <div class="commit">
                <div style="display: flex; justify-content: space-between; font-size: 0.8em; color: #94A3B8; margin-bottom: 5px;">
                    <span>${c.hash ? c.hash.substring(0, 7) : 'HEAD'}</span>
                    <span>${new Date(c.date).toLocaleDateString()}</span>
                </div>
                <div style="font-weight: 700; margin-bottom: 3px; display: flex; justify-content: space-between; align-items: center;">
                    <span>👤 ${c.author}</span>
                    <button onclick="chatWithGhost('${this.escapeJs(c.author)}', '${c.hash}')" style="margin: 0; padding: 2px 8px; font-size: 0.7em;">👻 Pair with Ghost</button>
                </div>
                <div style="color: #CBD5E1; font-size: 0.9em;">${this.escapeHtml(c.message || 'No message')}</div>
                <div style="display: flex; gap: 8px;">
                    ${c.hash ? `<button onclick="viewCommit('${c.hash}')">View Snapshot</button>` : ''}
                    ${c.hash ? `<button onclick="runTimeMachine('${c.hash}')" style="border-color: #60A5FA; color: #60A5FA;">🌀 Run in Time Machine</button>` : ''}
                    ${c.hash ? `<button onclick="replayGhost('${c.hash}')" style="border-color: #FBBF24; color: #FBBF24;">👻 Replay with Ghost Cursor</button>` : ''}
                    ${c.hash ? `<button onclick="openWormhole('${c.hash}')" style="border-color: #A78BFA; color: #A78BFA;">🕳️ Open Temporal Wormhole</button>` : ''}
                </div>
            </div>
        `).join('') : '<div class="stat-card">No history recorded</div>'}
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function viewCommit(hash) { vscode.postMessage({ command: 'viewCommit', hash }); }
        function promoteLore(type, content, hash) {
            vscode.postMessage({ command: 'promoteLore', type, content, hash });
        }
        function startTour() {
            vscode.postMessage({ command: 'startTour' });
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
        function askNL() {
            const query = document.getElementById('nlQuery').value;
            if (!query) return;
            document.getElementById('archaeologist-content').innerText = "Querying the timeline for '" + query + "'...";
            vscode.postMessage({ command: 'askArchaeologist', text: query });
        }
        function askArchaeologist() {
            document.getElementById('archaeologist-content').innerText = "Consulting the scrolls of time...";
            vscode.postMessage({ command: 'askArchaeologist' });
        }
        function getRefactorIdeas() {
            document.getElementById('refactor-content').innerText = "Calculating high-ROI refactor patterns...";
            vscode.postMessage({ command: 'getRefactorIdeas' });
        }
        
        // Interactive Tour System
        let tourState = {
            milestones: ${JSON.stringify(analysis.onboardingTour || [])},
            currentStep: 0,
            isActive: false
        };

        function startInteractiveTour() {
            if (tourState.milestones.length === 0) return;
            
            tourState.isActive = true;
            tourState.currentStep = 0;
            showTourModal();
        }

        function showTourModal() {
            const milestone = tourState.milestones[tourState.currentStep];
            const progress = ((tourState.currentStep + 1) / tourState.milestones.length) * 100;
            
            // Remove existing modal
            const existing = document.getElementById('tour-modal');
            if (existing) existing.remove();
            
            // Create modal
            const modal = document.createElement('div');
            modal.id = 'tour-modal';
            modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 10000; animation: fadeIn 0.3s ease;';
            
            modal.innerHTML = '<div style="' +
                'background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));' +
                'border: 1px solid rgba(96, 165, 250, 0.3);' +
                'border-radius: 16px;' +
                'padding: 32px;' +
                'max-width: 600px;' +
                'width: 90%;' +
                'box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);' +
                'position: relative;' +
            '">' +
                '<!-- Progress Bar -->' +
                '<div style="position: absolute; top: 0; left: 0; right: 0; height: 4px; background: rgba(96, 165, 250, 0.2); border-radius: 16px 16px 0 0; overflow: hidden;">' +
                    '<div style="height: 100%; width: ' + progress + '%; background: linear-gradient(90deg, #10B981, #60A5FA); transition: width 0.3s ease;"></div>' +
                '</div>' +
                
                '<!-- Step Counter -->' +
                '<div style="text-align: center; margin-bottom: 20px;">' +
                    '<span style="font-size: 0.85em; color: #94A3B8; font-weight: 600;">' +
                        'MILESTONE ' + (tourState.currentStep + 1) + ' OF ' + tourState.milestones.length +
                    '</span>' +
                '</div>' +
                
                '<!-- Milestone Icon & Type -->' +
                '<div style="text-align: center; margin-bottom: 16px;">' +
                    '<div style="font-size: 3em; margin-bottom: 8px;">' + milestone.icon + '</div>' +
                    '<div style="font-size: 0.9em; color: #60A5FA; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">' +
                        milestone.type +
                    '</div>' +
                '</div>' +
                
                '<!-- Content -->' +
                '<div style="text-align: center; margin-bottom: 20px;">' +
                    '<p style="font-size: 1.1em; color: #E2E8F0; line-height: 1.6; margin: 0 0 12px 0;">' +
                        milestone.content +
                    '</p>' +
                    (milestone.author ? '<div style="font-size: 0.85em; color: #94A3B8;">by <strong>' + milestone.author + '</strong></div>' : '') +
                    (milestone.date ? '<div style="font-size: 0.75em; color: #64748B; margin-top: 4px;">' + new Date(milestone.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '</div>' : '') +
                '</div>' +
                
                '<!-- Importance Badge -->' +
                '<div style="text-align: center; margin-bottom: 24px;">' +
                    '<span style="' +
                        'display: inline-block;' +
                        'padding: 4px 12px;' +
                        'border-radius: 12px;' +
                        'font-size: 0.75em;' +
                        'font-weight: 600;' +
                        'background: ' + (milestone.importance > 8 ? 'rgba(239, 68, 68, 0.2)' : milestone.importance > 6 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(96, 165, 250, 0.2)') + ';' +
                        'color: ' + (milestone.importance > 8 ? '#EF4444' : milestone.importance > 6 ? '#F59E0B' : '#60A5FA') + ';' +
                        'border: 1px solid ' + (milestone.importance > 8 ? 'rgba(239, 68, 68, 0.4)' : milestone.importance > 6 ? 'rgba(245, 158, 11, 0.4)' : 'rgba(96, 165, 250, 0.4)') + ';' +
                    '">' +
                        (milestone.importance > 8 ? '🔥 CRITICAL' : milestone.importance > 6 ? '⚠️ IMPORTANT' : '📌 NOTABLE') +
                    '</span>' +
                '</div>' +
                
                '<!-- Navigation -->' +
                '<div style="display: flex; gap: 12px; justify-content: center;">' +
                    (tourState.currentStep > 0 ? 
                        '<button onclick="previousStep()" style="' +
                            'flex: 1;' +
                            'background: rgba(255, 255, 255, 0.05);' +
                            'border: 1px solid rgba(255, 255, 255, 0.1);' +
                            'color: #E2E8F0;' +
                            'padding: 10px 20px;' +
                            'border-radius: 8px;' +
                            'font-weight: 600;' +
                            'cursor: pointer;' +
                            'transition: all 0.2s;' +
                        '" onmouseover="this.style.background=\'rgba(255, 255, 255, 0.1)\'" onmouseout="this.style.background=\'rgba(255, 255, 255, 0.05)\'">' +
                            '← Previous' +
                        '</button>'
                    : '') +
                    
                    (tourState.currentStep < tourState.milestones.length - 1 ? 
                        '<button onclick="nextStep()" style="' +
                            'flex: 1;' +
                            'background: linear-gradient(135deg, #10B981, #3B82F6);' +
                            'border: none;' +
                            'color: white;' +
                            'padding: 10px 20px;' +
                            'border-radius: 8px;' +
                            'font-weight: 600;' +
                            'cursor: pointer;' +
                            'box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);' +
                            'transition: all 0.2s;' +
                        '" onmouseover="this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.transform=\'translateY(0)\'">' +
                            'Next →' +
                        '</button>'
                    : 
                        '<button onclick="finishTour()" style="' +
                            'flex: 1;' +
                            'background: linear-gradient(135deg, #10B981, #059669);' +
                            'border: none;' +
                            'color: white;' +
                            'padding: 10px 20px;' +
                            'border-radius: 8px;' +
                            'font-weight: 600;' +
                            'cursor: pointer;' +
                            'box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);' +
                        '">' +
                            '🎉 Finish Tour' +
                        '</button>'
                    ) +
                    
                    '<button onclick="closeTour()" style="' +
                        'background: transparent;' +
                        'border: 1px solid rgba(239, 68, 68, 0.3);' +
                        'color: #EF4444;' +
                        'padding: 10px 20px;' +
                        'border-radius: 8px;' +
                        'font-weight: 600;' +
                        'cursor: pointer;' +
                    '">' +
                        '✕' +
                    '</button>' +
                '</div>' +
            '</div>';
            
            document.body.appendChild(modal);
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
            vscode.postMessage({ command: 'tourCompleted', milestones: tourState.milestones.length });
        }

        function closeTour() {
            const modal = document.getElementById('tour-modal');
            if (modal) {
                modal.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => modal.remove(), 300);
            }
            tourState.isActive = false;
        }

        // Add CSS animations
        const style = document.createElement('style');
        style.textContent = \`
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        \`;
        document.head.appendChild(style);
        
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'setArchaeologistResult') {
                document.getElementById('archaeologist-content').innerText = message.text;
            } else if (message.command === 'setRefactorResult') {
                document.getElementById('refactor-content').innerText = message.text;
            }
        });
    </script>
</body>
</html>`;
    }

    escapeJs(text) { return text ? text.replace(/'/g, "\\'").replace(/"/g, '\\"') : ''; }
    escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text ? text.replace(/[&<>"']/g, m => map[m]) : '';
    }

    dispose() { if (this.panel) this.panel.dispose(); }
}

module.exports = TimelinePanel;
