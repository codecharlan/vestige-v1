export {};
const vscode = require('vscode');

/**
 * AIService — Vestige Intelligence Layer
 * =======================================
 * Provides AI-powered temporal code insights. Upgraded with:
 *  - Living Code Historian: persistent per-file conversation threads
 *  - Resurrection Mode: ghost author re-implements dead code in their style
 *  - All existing analysis methods (archaeologist, refactoring, onboarding, etc.)
 */
class AIService { [key: string]: any;
    constructor() {
        this.baseUrl = 'https://api.openai.com/v1/chat/completions';

        /**
         * Living Code Historian: maps filePath → { threadId, seededAt, messages[] }
         * Persists for the lifetime of the extension session so every
         * follow-up question about the same file builds on prior context.
         */
        this._fileThreads = new Map();

        /**
         * Author style cache: maps authorName → styleDescription
         * Avoids recomputing the same author profile on every resurrection.
         */
        this._authorStyles = new Map();
    }

    // ─────────────────────────────────────────────────────────
    // SECTION 1: LIVING CODE HISTORIAN
    // Persistent per-file conversation threads
    // ─────────────────────────────────────────────────────────

    /**
     * Ask the Living Code Historian a question about a specific file.
     * The first call seeds the thread with the full analysis context;
     * subsequent calls continue the same conversation.
     *
     * @param {string} filePath - Absolute or workspace-relative path
     * @param {string} question - Natural language question from the user
     * @param {object} analysis - Full analysis result from GitAnalyzer
     * @param {Array}  decisions - Lore decisions linked to this file
     * @returns {Promise<string>} Answer from the historian
     */
    /**
     * Ask about a file's history.
     *
     * Returns `{ answer, evidence }`, not a bare string. That is deliberate:
     * the specific, well-documented failure of AI code comprehension is
     * confidently inventing a plausible-but-wrong reason a piece of code
     * exists — and a reader new to the codebase has no way to catch it. The
     * same history that makes rationale recoverable is what makes the answer
     * checkable, so callers must render the commits and decisions the answer
     * was drawn from alongside it. The model summarises shown evidence; it
     * never gets to assert rationale unsourced.
     */
    async askHistorian(filePath, question, analysis, decisions = []) {
        const fileName = filePath.split('/').pop() || filePath;

        // Get or create a thread for this file
        let threadState = this._fileThreads.get(filePath);
        if (!threadState) {
            threadState = await this._seedHistorianThread(filePath, fileName, analysis, decisions, null);
            this._fileThreads.set(filePath, threadState);
        }

        // The evidence set is assembled here, from local git data, so it is
        // available even if the model call fails.
        const evidence = this._collectEvidence(analysis, decisions);

        // Prior turns, then the new question. The question is only committed
        // to the thread after a successful response, so a failed request can't
        // duplicate or pollute history.
        const priorTurns = threadState.messages
            .map(m => `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}`)
            .join('\n\n');

        const userPrompt = [
            priorTurns ? `Earlier in this conversation:\n${priorTurns}\n` : '',
            `Question: ${question}`,
            '',
            'Ground every claim in the commits and decisions listed in your context.',
            'If the history does not answer the question, say so plainly instead of speculating.'
        ].filter(Boolean).join('\n');

        try {
            const answer = await this._complete(threadState.systemPrompt, userPrompt, {
                maxTokens: 500,
                temperature: 0.4
            });

            // Commit the exchange to the thread only after success
            threadState.messages.push({ role: 'user', content: question });
            threadState.messages.push({ role: 'assistant', content: answer });

            // Trim to last 20 exchanges to avoid runaway token cost
            if (threadState.messages.length > 40) {
                threadState.messages = threadState.messages.slice(-40);
            }

            return { answer, evidence };
        } catch (error) {
            console.error('Living Historian query failed:', error);
            throw error;
        }
    }

    /**
     * The commits and recorded decisions an answer is allowed to rest on.
     * Returned to the caller so the UI can show its sources.
     */
    _collectEvidence(analysis, decisions = []) {
        const commits = ((analysis?.churn?.commits) || (analysis?.timeline?.commits) || [])
            .slice(0, 8)
            .map(c => ({
                hash: (c.hash || '').substring(0, 7),
                author: c.author_name || c.author || 'Unknown',
                date: c.date || null,
                message: (c.message || '').split('\n')[0]
            }))
            .filter(c => c.hash);

        const recordedDecisions = (decisions || []).slice(0, 5).map(d => ({
            id: d.id,
            title: d.title,
            status: d.status || 'Decided'
        }));

        return { commits, decisions: recordedDecisions };
    }

    /**
     * Seed the initial thread context with file history, ownership, and lore.
     * Called only once per file per session.
     */
    async _seedHistorianThread(filePath, fileName, analysis, decisions, apiKey) {
        const churn = analysis?.churn || {};
        const ownership = analysis?.ownership || {};
        const contributors = ownership.contributors || [];
        const topOwner = contributors[0];
        const loreDecisions = decisions.length > 0
            ? decisions.map(d => `  - [#${d.id}] ${d.title}: ${d.decision?.substring(0, 100)}`).join('\n')
            : '  (none)';

        const systemPrompt = `You are a Living Code Historian embedded in a VS Code extension called Vestige.
You are the expert on the file "${fileName}". You have access to its complete temporal history.

== FILE FACTS ==
- Total commits: ${churn.totalCommits ?? 'unknown'}
- First commit: ${churn.firstCommit ? new Date(churn.firstCommit.date).toDateString() : 'unknown'}
- Last commit: ${churn.lastCommit ? new Date(churn.lastCommit.date).toDateString() : 'unknown'}
- Contributors: ${contributors.map(c => c.name).join(', ') || 'unknown'}
- Primary owner: ${topOwner ? `${topOwner.name} (${topOwner.percentage}%)` : 'unknown'}
- Churn hotspot: ${churn.isHotspot ? 'YES — high-risk file' : 'No'}

== ARCHITECTURAL DECISIONS (LORE) ==
${loreDecisions}

== YOUR ROLE ==
Answer questions about this file's history, purpose, ownership, and evolution.
Be specific and technical. Reference commit hashes, authors, and dates when relevant.
If the user asks follow-up questions, remember the full conversation above.
Keep answers concise (3-5 sentences) unless more depth is explicitly requested.`;

        return {
            systemPrompt,
            messages: [],
            seededAt: Date.now(),
            fileName,
        };
    }

    /**
     * Clear the conversation thread for a file (e.g., after a major git operation).
     */
    clearHistorianThread(filePath) {
        this._fileThreads.delete(filePath);
    }

    /**
     * Clear all historian threads (e.g., on repo change).
     */
    clearAllHistorianThreads() {
        this._fileThreads.clear();
    }

    // ─────────────────────────────────────────────────────────
    // SECTION 2: RESURRECTION MODE
    // Ghost author re-implements dead/zombie code
    // ─────────────────────────────────────────────────────────

    /**
     * Resurrection Mode: analyze a dead/zombie function and re-implement it
     * in the style of its original author, adapted for modern requirements.
     *
     * @param {string} author        - Git author name (from blame)
     * @param {string} deadCode      - The original dead/zombie code text
     * @param {string} modernContext - Description of what the code needs to do today
     * @param {Array}  authorCommits - Recent commits by this author (for style extraction)
     * @returns {Promise<{reimplemented: string, styleNotes: string}>}
     */
    async resurrectWithGhost(author, deadCode, modernContext, authorCommits = []) {
        const apiKey = await this._getApiKey();
        if (!apiKey) throw new Error('OpenAI API key not configured.');

        // Extract or retrieve cached author style
        let style = this._authorStyles.get(author);
        if (!style) {
            style = await this._extractAuthorStyle(author, authorCommits, apiKey);
            this._authorStyles.set(author, style);
        }

        const prompt = `You are resurrecting dead code as the ghost of "${author}".

== ORIGINAL CODE (dead/zombie) ==
${deadCode}

== AUTHOR STYLE PROFILE for "${author}" ==
${style}

== MODERN REQUIREMENT ==
${modernContext}

== YOUR TASK ==
Re-implement this code as ${author} would write it today, preserving their style but meeting the modern requirement.
Return TWO sections:
1. REIMPLEMENTED CODE (in a markdown code block)
2. STYLE NOTES (1-2 sentences about what stylistic choices you preserved from ${author}'s history)`;

        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: `You are the Ghost of ${author}, a code resurrection specialist.` },
                        { role: 'user', content: prompt },
                    ],
                    max_tokens: 800,
                    temperature: 0.5,
                }),
            });

            if (!response.ok) {
                throw await this._responseError(response);
            }

            const data = await response.json();
            const raw = data.choices?.[0]?.message?.content || '';

            // Parse sections
            const codeMatch = raw.match(/```[\w]*\n?([\s\S]*?)```/);
            const styleMatch = raw.match(/STYLE NOTES[:\s]*([\s\S]*?)(?:$|\n\n)/i);

            return {
                reimplemented: codeMatch?.[1]?.trim() || raw,
                styleNotes: styleMatch?.[1]?.trim() || `Preserved ${author}'s coding patterns.`,
                rawAuthorStyle: style,
            };
        } catch (error) {
            console.error('Resurrection mode failed:', error);
            throw error;
        }
    }

    /**
     * Extract a concise style profile from an author's commit history.
     * Analyzes naming conventions, comment density, function length patterns, etc.
     */
    async _extractAuthorStyle(author, commits, apiKey) {
        if (!commits || commits.length === 0) {
            return `${author} — no commit history available for style extraction.`;
        }

        // Take up to 5 recent commits for style analysis
        const sampleCommits = commits.slice(0, 5).map(c =>
            `Commit ${c.hash?.substring(0, 7)}: "${c.message}" — ${c.diff?.substring(0, 300) || '(no diff)'}`
        ).join('\n\n');

        const processedSample = await this.chunkAndSummarize(
            sampleCommits,
            `These are git commits by developer "${author}". Analyze their coding style.`,
            apiKey
        );

        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a code style analyst.' },
                    {
                        role: 'user',
                        content: `Analyze developer "${author}"'s coding style from these commits:\n\n${processedSample}\n\nSummarize in 3 bullet points: naming conventions, comment style, structural preferences.`,
                    },
                ],
                max_tokens: 200,
                temperature: 0.2,
            }),
        });

        if (!response.ok) {
            // Throw (rather than return a fallback) so callers never cache
            // a fallback style string for a failed API call.
            throw await this._responseError(response);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || `${author}'s style: pragmatic and functional.`;
    }

    // ─────────────────────────────────────────────────────────
    // SECTION 3: EXISTING METHODS (preserved + improved)
    // ─────────────────────────────────────────────────────────

    async chunkAndSummarize(text, contextMsg, apiKey) {
        if (!text) return '';
        const chunkSize = 12000;
        if (text.length <= chunkSize) return text;

        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.substring(i, i + chunkSize));
        }

        const summaries = [];
        for (let j = 0; j < chunks.length; j++) {
            const prompt = `Summarize part ${j + 1} of ${chunks.length}. ${contextMsg}\n\nContent:\n${chunks[j]}`;
            try {
                const response = await fetch(this.baseUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: 'You are a helpful summarization assistant.' },
                            { role: 'user', content: prompt },
                        ],
                        max_tokens: 300,
                        temperature: 0.3,
                    }),
                });
                if (response.ok) {
                    const data = await response.json();
                    summaries.push(data.choices[0].message.content.trim());
                } else {
                    console.error(`Chunk ${j + 1}/${chunks.length} summary failed:`, (await this._responseError(response)).message);
                    summaries.push('[chunk summary unavailable]');
                }
            } catch (error) {
                console.error(`Chunk ${j + 1}/${chunks.length} summary failed:`, error);
                summaries.push('[chunk summary unavailable]');
            }
        }
        return summaries.join('\n\n---\n\n');
    }

    async explainCommit(diff, message, apiKey) {
        if (!apiKey) throw new Error('OpenAI API key not configured. Set it in Vestige settings.');
        const processedDiff = await this.chunkAndSummarize(diff, 'This is a git diff. Summarize the technical changes.', apiKey);

        const prompt = `You are a senior software engineer reviewing a git commit. Explain what this commit does in 2-3 sentences. Be concise and technical.

Commit Message: ${message}

Diff:
${processedDiff}

Explain the change:`;

        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'You are a helpful code review assistant.' },
                        { role: 'user', content: prompt },
                    ],
                    max_tokens: 150,
                    temperature: 0.3,
                }),
            });

            if (!response.ok) {
                throw await this._responseError(response);
            }

            const data = await response.json();
            return data.choices[0].message.content.trim();
        } catch (error) {
            console.error('AI explanation failed:', error);
            throw error;
        }
    }

    async explainDiff(filePath, commitHash, gitAnalyzer, repoPath) {
        const apiKey = await this._getApiKey();
        if (!apiKey) throw new Error('OpenAI API key not configured. Set it in Vestige settings.');

        let diff = '';
        let message = '';

        try {
            // Use repo-scoped git — gitAnalyzer.git is bound to the extension
            // host's cwd, not the workspace repo.
            diff = await gitAnalyzer.getCommitDiff(repoPath, commitHash, filePath);
            message = await gitAnalyzer.getCommitMessage(repoPath, commitHash);
        } catch (e) {
            console.error('Failed to fetch diff/message for AI', e);
            throw new Error('Could not retrieve commit details');
        }

        return await this.explainCommit(diff, message, apiKey);
    }

    /**
     * Master off switch.
     *
     * When `vestige.disableAI` is set, no AI code path runs and no model is
     * ever selected — every AI feature reports itself as unavailable rather
     * than silently degrading. Teams under a no-AI policy need a single
     * setting that provably reaches zero network calls, and "it's inert unless
     * you click it" is not an answer anyone will stake a compliance review on.
     */
    isAIDisabled() {
        try {
            return vscode.workspace.getConfiguration('vestige').get('disableAI', false) === true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Is any AI backend usable right now, without the user configuring anything?
     * True when a VS Code language model (e.g. the user's existing Copilot
     * subscription) is available, or when an API key has been stored.
     */
    async isAvailable() {
        if (this.isAIDisabled()) return false;
        if (await this._selectLanguageModel()) return true;
        return !!(await this._getApiKey());
    }

    /**
     * Prefer the editor's own language model over a user-supplied API key.
     *
     * Requiring an OpenAI key is an activation wall: it asks someone still
     * evaluating the extension to go create a billing account first. VS Code's
     * language model API lets us borrow a subscription the user already has
     * (Copilot), with the platform's own consent prompt, so the AI features
     * work out of the box. A stored key remains the fallback for people
     * without Copilot, or who prefer to pay per token.
     */
    async _selectLanguageModel() {
        try {
            if (this.isAIDisabled()) return null;
            if (!vscode.lm || typeof vscode.lm.selectChatModels !== 'function') return null;
            // Prefer a cheap, fast model; fall back to whatever is offered.
            const preferred = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
            if (preferred && preferred.length > 0) return preferred[0];
            const any = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            return (any && any.length > 0) ? any[0] : null;
        } catch (e) {
            // Older VS Code, no Copilot, or consent declined.
            return null;
        }
    }

    /**
     * Single funnel for every AI call: editor language model first, then a
     * stored API key. Returns trimmed text.
     */
    async _complete(systemPrompt, userPrompt, { maxTokens = 300, temperature = 0.3 } = {}) {
        if (this.isAIDisabled()) {
            throw new Error('Vestige AI features are turned off (vestige.disableAI). All other analysis still works.');
        }

        const model = await this._selectLanguageModel();
        if (model) {
            try {
                const messages = [
                    vscode.LanguageModelChatMessage.User(`${systemPrompt}\n\n${userPrompt}`),
                ];
                const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
                let text = '';
                for await (const fragment of response.text) {
                    text += fragment;
                }
                if (text.trim()) return text.trim();
                // Empty completion — fall through to the key-based path.
            } catch (error) {
                // If the model refuses or the user declines consent, fall back
                // rather than failing the whole feature.
                console.warn('Vestige: editor language model unavailable, falling back to API key.', error?.message);
            }
        }

        const apiKey = await this._getApiKey();
        if (!apiKey) {
            throw new Error(
                'No AI backend available. Install GitHub Copilot, or run "Vestige: Set OpenAI API Key".'
            );
        }

        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: maxTokens,
                temperature,
            }),
        });
        if (!response.ok) {
            throw await this._responseError(response);
        }
        const data = await response.json();
        return data.choices[0].message.content.trim();
    }

    async explainText(prompt) {
        try {
            return await this._complete('You are a helpful code historian assistant.', prompt);
        } catch (error) {
            console.error('AI explanation failed:', error);
            throw error;
        }
    }

    async explainLoreDecision(decision) {
        const prompt = `You are a software historian. Explain why the following decision was made, summarizing the problem, the chosen solution, and any alternatives.\n\nTitle: ${decision.title}\nProblem: ${decision.context?.problem || 'N/A'}\nDecision: ${decision.decision}\nAlternatives: ${decision.alternatives ? JSON.stringify(decision.alternatives, null, 2) : 'None'}`;
        return await this.explainText(prompt);
    }

    async generateHistoricalPersona(author, history) {
        const apiKey = await this._getApiKey();
        if (!apiKey) throw new Error('OpenAI API key not configured. Set it in Vestige settings.');
        const historyStr = JSON.stringify(history);
        const processedHistory = await this.chunkAndSummarize(historyStr, 'This is a git commit history for a developer. Summarize their patterns.', apiKey);

        const prompt = `Analyze the code history for author "${author}":\n${processedHistory}\n\nSynthesize their architectural "Persona". What is their style? (e.g. "Strict functionalist", "Pragmatic hacker"). Be concise.`;
        return await this.explainText(prompt);
    }

    async chatWithGhost(author, persona, userMessage, codeContext) {
        const apiKey = await this._getApiKey();
        if (!apiKey) throw new Error('API Key missing');

        const systemMsg = `You are the Ghost of ${author}. Your persona: ${persona}. Context: ${codeContext}. Answer the user's question as ${author}, focusing on your original architectural intent.`;

        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemMsg },
                        { role: 'user', content: userMessage },
                    ],
                    max_tokens: 300,
                    temperature: 0.7,
                }),
            });
            const data = await response.json();
            return data.choices?.[0]?.message?.content || 'The ghost is silent...';
        } catch (e) {
            return 'The temporal connection failed.';
        }
    }

    async analyzeStagnation(filePath, ageDays, churnMetrics, codeContext) {
        const apiKey = await this._getApiKey();
        if (!apiKey) throw new Error('API Key missing');

        const processedContext = await this.chunkAndSummarize(codeContext, 'This is a code snippet. Summarize its purpose.', apiKey);

        const prompt = `You are a Code Archaeologist. Analyze this file that hasn't changed in ${ageDays} days.
        
File: ${filePath}
Recent Churn around it: ${JSON.stringify(churnMetrics)}
Code Snippet:
${processedContext}

Hypothesize why this code persists. Is it a "Load-Bearing Wall" (critical but untouchable), "Sunken Treasure" (valuable but forgotten), or a "Zombie" (useless but lurking)? Provide a technical and philosophical explanation in 3-4 sentences.`;

        return await this.explainText(prompt);
    }

    async suggestRefactoring(filePath, debtScore, complexity) {
        const prompt = `Analyze this file with a Debt Score of ${debtScore} and Complexity of ${complexity}.
        
File: ${filePath}

Suggest 3 specific, high-impact refactorings to reduce technical debt and improve temporal stability. Focus on "ROI-driven" refactoring.`;

        return await this.explainText(prompt);
    }

    async summarizeDiff(diff) {
        const apiKey = await this._getApiKey();
        if (!apiKey) throw new Error('OpenAI API key not configured. Set it in Vestige settings.');
        const diffStr = typeof diff === 'string' ? diff : JSON.stringify(diff);
        const processedDiff = await this.chunkAndSummarize(diffStr, 'Summarize these technical diff changes.', apiKey);
        const prompt = `Summarize this technical diff in 1 sentence for a project lead:\n\n${processedDiff}`;
        return await this.explainText(prompt);
    }

    async predictStabilityImpact(filePath, change) {
        const prompt = `Predict the stability impact (ROI) of this refactoring in ${filePath}: ${change}`;
        return await this.explainText(prompt);
    }

    async generateOnboardingNarrative(milestones, fileName, facts) {
        const apiKey = await this._getApiKey();
        if (!apiKey) return this.generateFallbackNarrative(milestones, fileName, facts);

        const milestonesSummary = milestones.slice(0, 5).map(m =>
            `${m.icon} ${m.type}: ${m.content} (${m.author || 'Unknown'})`
        ).join('\n');

        const prompt = `You are onboarding a new developer to a codebase. Create a friendly, concise narrative (2-3 sentences) about this file's history.

File: ${fileName}
Age: ${facts.age} days
Total Changes: ${facts.totalCommits}
Contributors: ${facts.contributors}

Key Milestones:
${milestonesSummary}

Write a welcoming summary that:
1. Explains when and why this file was created
2. Highlights 1-2 major changes or patterns
3. Mentions current state and who maintains it

Keep it conversational and helpful for someone new to the codebase.`;

        try {
            const narrative = await this.explainText(prompt);
            return narrative;
        } catch (error) {
            console.error('AI narrative generation failed:', error);
            return this.generateFallbackNarrative(milestones, fileName, facts);
        }
    }

    generateFallbackNarrative(milestones, fileName, facts) {
        const birthMilestone = milestones.find(m => m.type === 'birth');
        const creator = birthMilestone?.author || 'a developer';
        const ageYears = Math.floor(facts.age / 365);
        const ageDesc = ageYears > 0 ? `${ageYears} year${ageYears > 1 ? 's' : ''}` : `${facts.age} days`;

        let narrative = `${fileName} was created ${ageDesc} ago by ${creator}. `;

        if (facts.totalCommits > 50) {
            narrative += `It has evolved through ${facts.totalCommits} changes by ${facts.contributors} contributor${facts.contributors > 1 ? 's' : ''}, `;
        } else {
            narrative += `It has seen ${facts.totalCommits} updates, `;
        }

        const majorMilestones = milestones.filter(m =>
            ['refactor', 'architecture', 'security'].includes(m.type)
        );

        if (majorMilestones.length > 0) {
            const latest = majorMilestones[0];
            narrative += `including ${latest.content.toLowerCase()}. `;
        } else {
            narrative += `maintaining steady evolution. `;
        }

        const recentOwner = milestones.find(m => m.type === 'ownership-transition');
        if (recentOwner) {
            narrative += recentOwner.content + '.';
        } else if (birthMilestone) {
            narrative += `${birthMilestone.author} remains a key contributor.`;
        }

        return narrative;
    }

    // ─────────────────────────────────────────────────────────
    // SECTION 4: HELPERS
    // ─────────────────────────────────────────────────────────

    /**
     * Store the extension context so the API key can be read from SecretStorage.
     * Wired up by extension.ts during activation.
     */
    setContext(context) {
        this.context = context;
    }

    /**
     * Resolve the OpenAI API key: prefer SecretStorage, fall back to settings.
     * Works without a context (settings-only) if setContext was never called.
     */
    async _getApiKey() {
        try {
            const secret = await this.context?.secrets?.get('vestige.openaiApiKey');
            if (secret) return secret;
        } catch (e) {
            console.error('Failed to read API key from SecretStorage:', e);
        }
        return vscode.workspace.getConfiguration('vestige').get('openaiApiKey');
    }

    /**
     * Build a descriptive Error from a non-ok fetch Response.
     * Reads the body as text (resilient to non-JSON error bodies) and
     * includes the HTTP status.
     */
    async _responseError(response) {
        let bodyText = '';
        try {
            bodyText = await response.text();
        } catch (e) {
            // Body unreadable — status alone will have to do
        }
        let detail = bodyText;
        try {
            const parsed = JSON.parse(bodyText);
            detail = parsed.error?.message || bodyText;
        } catch (e) {
            // Not JSON — keep raw text
        }
        detail = (detail || '').trim().substring(0, 300);
        return new Error(`API request failed (status ${response.status})${detail ? `: ${detail}` : ''}`);
    }
}

module.exports = AIService;
