const vscode = require('vscode');

class AIService {
    constructor() {
        this.baseUrl = 'https://api.openai.com/v1/chat/completions';
    }

    async explainCommit(diff, message, apiKey) {
        if (!apiKey) {
            throw new Error('OpenAI API key not configured. Set it in Vestige settings.');
        }

        const prompt = `You are a senior software engineer reviewing a git commit. Explain what this commit does in 2-3 sentences. Be concise and technical.

Commit Message: ${message}

Diff:
${diff.substring(0, 2000)} ${diff.length > 2000 ? '...(truncated)' : ''}

Explain the change:`;

        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: 'You are a helpful code review assistant.' },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 150,
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'API request failed');
            }

            const data = await response.json();
            return data.choices[0].message.content.trim();
        } catch (error) {
            console.error('AI explanation failed:', error);
            throw error;
        }
    }

    async explainText(prompt) {
        const apiKey = vscode.workspace.getConfiguration('vestige').get('openaiApiKey');
        if (!apiKey) {
            throw new Error('OpenAI API key not configured. Set it in Vestige settings.');
        }
        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: 'You are a helpful code historian assistant.' },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 300,
                    temperature: 0.3
                })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'API request failed');
            }
            const data = await response.json();
            return data.choices[0].message.content.trim();
        } catch (error) {
            console.error('AI explanation failed:', error);
            throw error;
        }
    }
    /**
     * Explain a Lore decision using the AI service.
     * @param {Object} decision - Decision object from LoreService.
     * @returns {Promise<string>} Explanation text.
     */
    async explainLoreDecision(decision) {
        const prompt = `You are a software historian. Explain why the following decision was made, summarizing the problem, the chosen solution, and any alternatives.\n\nTitle: ${decision.title}\nProblem: ${decision.context?.problem || 'N/A'}\nDecision: ${decision.decision}\nAlternatives: ${decision.alternatives ? JSON.stringify(decision.alternatives, null, 2) : 'None'}`;
        return await this.explainText(prompt);
    }

    /**
     * God-Tier: Generate a digital twin persona for a historical author.
     */
    async generateHistoricalPersona(author, history) {
        const prompt = `Analyze the code history for author "${author}":\n${JSON.stringify(history.slice(0, 5))}\n\nSynthesize their architectural "Persona". What is their style? (e.g. "Strict functionalist", "Pragmatic hacker"). Be concise.`;
        return await this.explainText(prompt);
    }

    /**
     * God-Tier: Pair program with a "Ghost" of a historical author.
     */
    async chatWithGhost(author, persona, userMessage, codeContext) {
        const apiKey = vscode.workspace.getConfiguration('vestige').get('openaiApiKey');
        if (!apiKey) throw new Error('API Key missing');

        const systemMsg = `You are the Ghost of ${author}. Your persona: ${persona}. Context: ${codeContext}. Answer the user's question as ${author}, focusing on your original architectural intent.`;

        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: systemMsg },
                        { role: 'user', content: userMessage }
                    ],
                    max_tokens: 300,
                    temperature: 0.7
                })
            });
            const data = await response.json();
            return data.choices?.[0]?.message?.content || "The ghost is silent...";
        } catch (e) {
            return "The temporal connection failed.";
        }
    }
}

module.exports = AIService;
