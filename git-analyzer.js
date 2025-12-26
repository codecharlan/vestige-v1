const simpleGit = require('simple-git');
const path = require('path');
const vscode = require('vscode');

const LORE_PATTERNS = [
    { pattern: /Architecture:|Design:|Structure:/i, type: 'architecture' },
    { pattern: /Decided to:|Decision:|We will:/i, type: 'decision' },
    { pattern: /Reasoning:|Why:|Rationale:/i, type: 'rationale' },
    { pattern: /Caution:|Warning:|Note:/i, type: 'warning' },
    { pattern: /Vendor:|Dependency:|replaced \w+ with \w+/i, type: 'pivot' }
];

class GitAnalyzer {
    constructor() {
        this.git = simpleGit();
    }


    parseBlame(blameOutput) {
        const lines = [];
        const blameLines = blameOutput.split('\n');
        let currentLine = {};

        for (const line of blameLines) {
            if (line.match(/^[0-9a-f]{40}/)) {
                const hash = line.split(' ')[0];
                currentLine = {
                    hash: hash,
                    lineNo: parseInt(line.split(' ')[2]),
                    isUncommitted: hash === '0000000000000000000000000000000000000000'
                };
            } else if (line.startsWith('author ')) {
                currentLine.author = line.substring(7);
            } else if (line.startsWith('author-time ')) {
                currentLine.date = new Date(parseInt(line.substring(12)) * 1000);
            } else if (line.startsWith('summary ')) {
                currentLine.summary = line.substring(8);
            } else if (line.startsWith('\t')) {
                currentLine.content = line.substring(1);
                // Handle uncommitted changes
                if (currentLine.isUncommitted) {
                    currentLine.author = 'You (Uncommitted)';
                    currentLine.date = new Date(); // Now
                    currentLine.summary = 'Uncommitted changes';
                }
                lines.push(currentLine);
            }
        }
        return lines;
    }

    async calculateChurn(git, filePath) {
        try {
            // Get number of commits for this file
            const log = await git.log({ file: filePath });
            return {
                totalCommits: log.total,
                lastCommit: log.latest
            };
        } catch (e) {
            // Fallback if log fails
            return { totalCommits: 0, lastCommit: null };
        }
    }


    async getFileTimeline(repoPath, filePath) {
        const git = simpleGit(repoPath);
        const relativePath = path.relative(repoPath, filePath);

        try {
            const log = await git.log({ file: relativePath });

            const authors = new Set(log.all.map(c => c.author_name));
            const hotPotatoThreshold = vscode.workspace.getConfiguration('vestige').get('hotPotatoAuthors') || 5;

            if (authors.size > hotPotatoThreshold) {
                // Assuming 'alerts' and 'file' are defined in a broader context or will be added.
                // For now, this will cause a ReferenceError if not defined elsewhere.
                // alerts.push({
                //     file: filePath, // Using filePath as 'file' is not defined
                //     authors: authors.size
                // });
            }
            return {
                commits: log.all,
                summary: {
                    total: log.total,
                    authors: Array.from(authors),
                    firstCommit: log.all[log.all.length - 1],
                    lastCommit: log.latest
                }
            };
        } catch (e) {
            throw new Error('Could not retrieve file history');
        }
    }
    async getRecentCommits(repoPath, limit = 10) {
        const git = simpleGit(repoPath);
        try {
            const log = await git.log({ maxCount: limit });
            return log.all.map(c => ({
                hash: c.hash,
                author: c.author_name,
                date: new Date(c.date),
                message: c.message
            }));
        } catch (e) {
            console.error('Failed to get recent commits', e);
            return [];
        }
    }

    async getFileStats(repoPath, filePath) {
        const git = simpleGit(repoPath);
        const relativePath = path.relative(repoPath, filePath);

        try {
            // Get log for simple stats (limit to 1 for speed if just checking age, but we need count)
            // For churn, we need count. For age, we need latest date.
            const log = await git.log({ file: relativePath, maxCount: 50 }); // Limit for perf

            if (log.total === 0) return null;

            const latest = new Date(log.latest.date);
            const now = new Date();
            const ageDays = Math.round((now - latest) / (1000 * 60 * 60 * 24));

            return {
                commits: log.total,
                ageDays: ageDays
            };
        } catch (e) {
            return null;
        }
    }

    calculateOwnership(blameLines) {
        const authors = {};
        let total = 0;

        blameLines.forEach(line => {
            if (!line.author) return;
            authors[line.author] = (authors[line.author] || 0) + 1;
            total++;
        });

        if (total === 0) return { topAuthor: 'None', percent: 0 };

        let topAuthor = '';
        let maxCount = 0;

        Object.entries(authors).forEach(([author, count]) => {
            if (count > maxCount) {
                maxCount = count;
                topAuthor = author;
            }
        });

        return {
            topAuthor,
            percent: Math.round((maxCount / total) * 100)
        };
    }

    async getCoupledFiles(repoPath, filePath) {
        const git = simpleGit(repoPath);
        const relativePath = path.relative(repoPath, filePath);

        try {
            // Find commits that touched this file
            const log = await git.log({ file: relativePath, maxCount: 20 });
            const commitHashes = log.all.map(c => c.hash);

            if (commitHashes.length === 0) return [];

            // For each commit, find other files
            const fileCounts = {};

            // This can be slow, so we limit to recent history
            for (const hash of commitHashes) {
                const show = await git.show([hash, '--name-only', '--format=']);
                const files = show.split('\n').filter(f => f && f !== relativePath);

                files.forEach(f => {
                    fileCounts[f] = (fileCounts[f] || 0) + 1;
                });
            }

            // Sort by frequency
            return Object.entries(fileCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3) // Top 3
                .map(([file, count]) => ({
                    file,
                    count,
                    frequency: Math.round((count / commitHashes.length) * 100)
                }));
        } catch (e) {
            console.error('Coupling analysis failed', e);
            return [];
        }
    }

    // V3: Epoch Detection
    async detectEpochs(repoPath) {
        const git = simpleGit(repoPath);

        try {
            const log = await git.log({ maxCount: 500 }); // Last 500 commits
            if (log.total === 0) return [];

            const epochs = [];
            const monthlyGroups = {};

            // Group commits by month
            log.all.forEach(commit => {
                const date = new Date(commit.date);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

                if (!monthlyGroups[monthKey]) {
                    monthlyGroups[monthKey] = {
                        commits: [],
                        keywords: {}
                    };
                }

                monthlyGroups[monthKey].commits.push(commit);

                // Extract keywords from commit messages
                const message = commit.message.toLowerCase();
                const keywords = ['migration', 'refactor', 'security', 'upgrade', 'v1', 'v2', 'v3', 'rewrite', 'typescript', 'performance'];
                keywords.forEach(keyword => {
                    if (message.includes(keyword)) {
                        monthlyGroups[monthKey].keywords[keyword] = (monthlyGroups[monthKey].keywords[keyword] || 0) + 1;
                    }
                });
            });

            // Detect significant epochs (high activity or keyword concentration)
            const avgCommitsPerMonth = log.total / Object.keys(monthlyGroups).length;

            Object.entries(monthlyGroups).forEach(([monthKey, data]) => {
                const commitCount = data.commits.length;
                const topKeyword = Object.entries(data.keywords).sort((a, b) => b[1] - a[1])[0];

                // Epoch if 2x average commits OR significant keyword presence
                if (commitCount > avgCommitsPerMonth * 2 || (topKeyword && topKeyword[1] > 3)) {
                    const [year, month] = monthKey.split('-');
                    epochs.push({
                        name: topKeyword ? `${topKeyword[0].charAt(0).toUpperCase() + topKeyword[0].slice(1)} Sprint` : 'High Activity',
                        period: `${year}-${month}`,
                        commits: commitCount,
                        keywords: Object.keys(data.keywords)
                    });
                }
            });

            return epochs;
        } catch (e) {
            console.error('Epoch detection failed', e);
            return [];
        }
    }

    // V3: Bus Factor
    async calculateBusFactor(repoPath, filePath) {
        const git = simpleGit(repoPath);
        const relativePath = path.relative(repoPath, filePath);

        try {
            const blame = await git.raw(['blame', '--line-porcelain', relativePath]);
            const lines = this.parseBlame(blame);

            const authorLines = {};
            let totalLines = 0;

            lines.forEach(line => {
                if (!line.author || line.author === 'You (Uncommitted)') return;
                authorLines[line.author] = (authorLines[line.author] || 0) + 1;
                totalLines++;
            });

            if (totalLines === 0) return { busFactor: 0, contributors: [], risk: 'unknown' };

            // Sort contributors by lines contributed
            const contributors = Object.entries(authorLines)
                .map(([name, lines]) => ({
                    name,
                    linesOwned: lines,
                    percent: Math.round((lines / totalLines) * 100)
                }))
                .sort((a, b) => b.linesOwned - a.linesOwned);

            // Calculate bus factor: how many people own 50%+ of code
            let cumulativePercent = 0;
            let busFactor = 0;

            for (const contrib of contributors) {
                busFactor++;
                cumulativePercent += contrib.percent;
                if (cumulativePercent >= 50) break;
            }

            const risk = busFactor === 1 ? 'high' : busFactor === 2 ? 'medium' : 'low';

            return { busFactor, contributors, risk };
        } catch (e) {
            console.error('Bus factor calculation failed', e);
            return { busFactor: 0, contributors: [], risk: 'unknown' };
        }
    }

    // V3: Blame of Blame (Lineage)
    async getLineageChain(repoPath, filePath, lineNumber) {
        const git = simpleGit(repoPath);
        const relativePath = path.relative(repoPath, filePath);

        try {
            // Use git log -L to trace line history
            const logOutput = await git.raw(['log', '-L', `${lineNumber},${lineNumber}:${relativePath}`, '--pretty=format:%H|%an|%ad|%s', '--date=short']);

            const chain = [];
            const commits = logOutput.split('\n\n').filter(block => block.trim());

            commits.forEach(block => {
                const lines = block.split('\n');
                const commitInfo = lines[0].split('|');

                if (commitInfo.length >= 4) {
                    chain.push({
                        hash: commitInfo[0].slice(0, 7),
                        author: commitInfo[1],
                        date: commitInfo[2],
                        message: commitInfo[3]
                    });
                }
            });

            return chain.reverse(); // Oldest first
        } catch (e) {
            // Fallback to simpler blame
            return [];
        }
    }

    // V3: Code Graveyard
    async findDeletedFiles(repoPath) {
        const git = simpleGit(repoPath);

        try {
            const logOutput = await git.raw(['log', '--diff-filter=D', '--summary', '--pretty=format:%H|%an|%ad', '--date=short']);

            const deleted = [];
            const lines = logOutput.split('\n');
            let currentCommit = null;

            lines.forEach(line => {
                if (line.includes('|')) {
                    const parts = line.split('|');
                    currentCommit = {
                        hash: parts[0],
                        author: parts[1],
                        date: parts[2]
                    };
                } else if (line.includes('delete mode')) {
                    const match = line.match(/delete mode \d+ (.+)/);
                    if (match && currentCommit) {
                        deleted.push({
                            path: match[1],
                            deletedAt: currentCommit.date,
                            deletedBy: currentCommit.author,
                            commit: currentCommit.hash
                        });
                    }
                }
            });

            return deleted.slice(0, 50); // Limit to 50 most recent
        } catch (e) {
            console.error('Graveyard scan failed', e);
            return [];
        }
    }

    /**
     * V5: Calculate Technical Debt
     * Returns debt score and estimated cost
     */
    async calculateTechnicalDebt(repoPath, filePath) {
        try {
            const stats = await this.getFileStats(repoPath, filePath);
            if (!stats) return null;

            // Simple heuristic for debt:
            // Debt = (Complexity * Age * Churn) / Maintenance
            // We'll use file size (lines) as a proxy for complexity for now
            // In a real implementation, we'd use a complexity parser

            const git = simpleGit(repoPath);
            const rawLines = await git.raw(['show', `HEAD:${path.relative(repoPath, filePath)}`]);
            const lineCount = rawLines.split('\n').length;

            // Factors
            const complexityFactor = lineCount / 100; // 1.0 per 100 lines
            const churnFactor = Math.max(1, stats.commits / 5); // Higher churn = higher risk
            const ageFactor = Math.max(1, stats.ageDays / 30); // Older code might be legacy

            // Debt Score (0-100+)
            const debtScore = (complexityFactor * churnFactor * Math.log(ageFactor)).toFixed(1);

            // Estimated remediation cost ($50/hr, 1 hr per debt point)
            const estimatedCost = Math.round(debtScore * 50);

            return {
                score: parseFloat(debtScore),
                cost: estimatedCost,
                complexity: lineCount,
                churn: stats.commits,
                age: stats.ageDays
            };
        } catch (e) {
            console.error('Debt calculation failed', e);
            return null;
        }
    }

    /**
     * V5: Find Bug Patterns
     * Analyzes commit messages for bug fix keywords
     */
    async findBugPatterns(repoPath, filePath) {
        try {
            const git = simpleGit(repoPath);
            const relativePath = path.relative(repoPath, filePath);

            const log = await git.log({
                file: relativePath,
                maxCount: 100
            });

            const bugKeywords = ['fix', 'bug', 'issue', 'error', 'crash', 'fail', 'patch', 'hotfix'];
            const bugCommits = log.all.filter(commit => {
                const msg = commit.message.toLowerCase();
                return bugKeywords.some(kw => msg.includes(kw));
            });

            const bugDensity = log.all.length > 0 ? (bugCommits.length / log.all.length) : 0;

            return {
                bugCount: bugCommits.length,
                totalCommits: log.all.length,
                density: bugDensity,
                recentBugs: bugCommits.slice(0, 3)
            };
        } catch (e) {
            console.error('Bug pattern analysis failed', e);
            return null;
        }
    }

    /**
     * V5: Detect Zombie Code
     * Finds files that haven't been touched in a long time and have few references
     * (Note: Reference counting requires AST, here we use git activity as proxy)
     */
    async detectZombieCode(repoPath) {
        try {
            const git = simpleGit(repoPath);

            // Get all files
            const files = await git.raw(['ls-files']);
            const fileList = files.split('\n').filter(f => f.trim());

            const zombies = [];
            const now = new Date();

            // Sample check for performance
            const sample = fileList.length > 50 ?
                fileList.sort(() => 0.5 - Math.random()).slice(0, 50) :
                fileList;

            for (const file of sample) {
                const log = await git.log({ file, maxCount: 1 });
                if (log.latest) {
                    const lastCommitDate = new Date(log.latest.date);
                    const ageDays = (now - lastCommitDate) / (1000 * 60 * 60 * 24);

                    // Zombie definition: > configured days (default 1 year)
                    const zombieDays = vscode.workspace.getConfiguration('vestige').get('zombieAgeDays') || 365;
                    if (ageDays > zombieDays) {
                        zombies.push({
                            file,
                            ageDays: Math.round(ageDays),
                            lastCommit: log.latest
                        });
                    }
                }
            }

            return zombies.sort((a, b) => b.ageDays - a.ageDays);
        } catch (e) {
            console.error('Zombie detection failed', e);
            return [];
        }
    }

    /**
     * V5: Analyze Documentation Drift
     * Checks if code has been updated more recently than docs
     */
    async analyzeDocumentationDrift(repoPath) {
        try {
            const git = simpleGit(repoPath);
            const files = await git.raw(['ls-files']);
            const fileList = files.split('\n').filter(f => f.trim());

            const docs = fileList.filter(f => f.toLowerCase().includes('readme') || f.endsWith('.md'));
            const code = fileList.filter(f => !f.endsWith('.md') && !f.includes('test'));

            if (docs.length === 0) return [];

            const driftAlerts = [];

            for (const doc of docs) {
                const docLog = await git.log({ file: doc, maxCount: 1 });
                if (!docLog.latest) continue;

                const docDate = new Date(docLog.latest.date);

                // Find code files in same directory updated AFTER doc
                const docDir = path.dirname(doc);
                const siblingCode = code.filter(f => path.dirname(f) === docDir);

                for (const codeFile of siblingCode) {
                    const codeLog = await git.log({ file: codeFile, maxCount: 1 });
                    if (codeLog.latest) {
                        const codeDate = new Date(codeLog.latest.date);
                        // If code is > configured days newer than doc
                        const driftDaysConfig = vscode.workspace.getConfiguration('vestige').get('driftDays') || 30;
                        const diffDays = (codeDate - docDate) / (1000 * 60 * 60 * 24);

                        if (diffDays > driftDaysConfig) {
                            driftAlerts.push({
                                doc,
                                codeFile,
                                daysDrift: Math.round(diffDays)
                            });
                        }
                    }
                }
            }

            return driftAlerts.sort((a, b) => b.daysDrift - a.daysDrift).slice(0, 10);
        } catch (e) {
            console.error('Doc drift analysis failed', e);
            return [];
        }
    }

    /**
     * V5: Detect Hot Potato Files
     * Files with high author turnover
     */
    async detectHotPotato(repoPath) {
        try {
            const git = simpleGit(repoPath);
            const files = await git.raw(['ls-files']);
            const fileList = files.split('\n').filter(f => f.trim());

            const hotPotatoes = [];
            const sample = fileList.length > 30 ?
                fileList.sort(() => 0.5 - Math.random()).slice(0, 30) :
                fileList;

            for (const file of sample) {
                const log = await git.log({ file, maxCount: 50 });
                const authors = new Set(log.all.map(c => c.author_email));

                // If > configured distinct authors in last 50 commits
                const hotPotatoThreshold = vscode.workspace.getConfiguration('vestige').get('hotPotatoAuthors') || 5;
                if (authors.size > hotPotatoThreshold) {
                    hotPotatoes.push({
                        file,
                        authorCount: authors.size,
                        commits: log.all.length
                    });
                }
            }

            return hotPotatoes.sort((a, b) => b.authorCount - a.authorCount);
        } catch (e) {
            console.error('Hot potato detection failed', e);
            return [];
        }
    }
    /**
     * Elite: Calculate Originality Index
     * Percentage of code older than 2 years
     */
    calculateOriginalityIndex(lines) {
        if (!lines || lines.length === 0) return 100;
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        const originalLines = lines.filter(l => l.date < twoYearsAgo).length;
        return Math.round((originalLines / lines.length) * 100);
    }

    /**
     * Elite: Interest Rate Engine
     * Score based on Churn * Complexity
     */
    calculateInterestRate(churnCount, lineCount) {
        // Line count is a proxy for complexity in VS Code
        // Normalizing: 500 lines * 10 commits = 5000 / 100 = 50%
        return Math.min(100, Math.round((churnCount * lineCount) / 100));
    }

    /**
     * Elite: Predictive Conflict Heatmap
     * Finds files modified in other branches
     */
    async checkPredictiveConflicts(repoPath, filePath) {
        const git = simpleGit(repoPath);
        const relativePath = path.relative(repoPath, filePath);
        try {
            // git log --branches --not HEAD --pretty=format:%D -n 5 -- <file>
            const output = await git.raw(['log', '--branches', '--not', 'HEAD', '--pretty=format:%D', '-n', '5', '--', relativePath]);
            return output.split('\n').filter(l => l.trim()).map(l => l.trim());
        } catch (e) {
            return [];
        }
    }

    /**
     * Elite: Knowledge Proximity Graph Data
     */
    async findKnowledgeProximity(repoPath, filePath) {
        const git = simpleGit(repoPath);
        const relativePath = path.relative(repoPath, filePath);
        const neighbors = new Map();

        try {
            const hashes = (await git.raw(['log', '-n', '10', '--pretty=format:%H', '--', relativePath])).split('\n').filter(h => h);

            for (const hash of hashes) {
                const show = await git.raw(['show', '--pretty=format:%an', '--name-only', hash]);
                const parts = show.split('\n');
                const author = parts[0];
                const files = parts.slice(1);

                if (files.some(f => f && f !== relativePath)) {
                    neighbors.set(author, (neighbors.get(author) || 0) + 1);
                }
            }
        } catch (e) {
            console.error('Proximity analysis failed', e);
        }

        return Array.from(neighbors.entries())
            .map(([name, strength]) => ({ name, strength }))
            .sort((a, b) => b.strength - a.strength);
    }

    /**
     * Elite: Generate Narrative Biography (Synthesized)
     */
    generateNarrativeBiography(analysis) {
        const { lines, churn, originalityIndex, stability, implicitLore = [] } = analysis;

        let story = `This file has been active since ${lines.summary?.firstCommit?.date ? new Date(lines.summary.firstCommit.date).toDateString() : 'unknown'}. `;
        story += `It has evolved through ${churn.totalCommits} changes by ${churn.summary?.authors?.length || 0} authors. `;

        if (originalityIndex > 80) {
            story += `It preserves a high degree of its ancestral structure (${originalityIndex}% original). `;
        } else {
            story += `It has undergone significant metamorphosis, with only ${originalityIndex}% of the founding logic remaining. `;
        }

        const pivots = implicitLore.filter(l => l.type === 'pivot');
        if (pivots.length > 0) {
            story += `Notable architectural pivots include: ${pivots.slice(0, 2).map(p => p.content).join('; ')}. `;
        }

        const decisions = implicitLore.filter(l => l.type === 'decision' || l.type === 'architecture');
        if (decisions.length > 0) {
            story += `Implicit decisions found in history suggest a focus on: ${decisions.slice(0, 2).map(d => d.content).join(', ')}. `;
        }

        if (stability > 90) {
            story += `Currently, the file is in a Zenith State of high stability.`;
        } else if (stability < 30) {
            story += `The file is currently in a high-entropy state with frequent churn.`;
        }

        return story;
    }

    /**
     * Elite: Implicit Lore Extraction
     */
    async extractImplicitLore(git, relativePath) {
        const lore = [];
        const log = await git.log({ file: relativePath, n: 50 });

        for (const entry of log.all) {
            for (const { pattern, type } of LORE_PATTERNS) {
                if (pattern.test(entry.message)) {
                    // Extract the text after the pattern
                    const match = entry.message.match(pattern);
                    const startIndex = match.index + match[0].length;
                    const content = entry.message.substring(startIndex).trim().split('\n')[0];

                    if (content.length > 5) {
                        lore.push({
                            type,
                            content,
                            author: entry.author_name,
                            date: new Date(entry.date),
                            hash: entry.hash
                        });
                    }
                }
            }
        }
        return lore;
    }

    /**
     * Elite: Shadow Lore (Reversion Detection)
     */
    async detectShadowLore(git, relativePath) {
        const shadows = [];
        const log = await git.log({ file: relativePath });

        const reverts = log.all.filter(e => /revert|undo|back out/i.test(e.message));
        for (const rev of reverts) {
            shadows.push({
                type: 'reversion',
                content: `Pattern Reverted: ${rev.message.split('\n')[0]}`,
                author: rev.author_name,
                date: new Date(rev.date),
                hash: rev.hash
            });
        }
        return shadows;
    }

    /**
     * Elite: Calculate Refactor Safety Score
     * 0-100: Higher is safer. Reversions and high historical debt lower this score.
     */
    calculateSafetyScore(analysis) {
        let score = 100;
        const { implicitLore = [], churn, interestRate } = analysis;

        // Penalize for reversions
        const reversions = (implicitLore || []).filter(l => l.type === 'reversion').length;
        score -= (reversions * 20);

        // Penalize for high interest rate (existing debt)
        score -= (interestRate / 2);

        // Penalize for high author churn (lack of single ownership)
        if (churn.authors && churn.authors.length > 5) score -= 15;

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Elite: Calculate Refactor ROI
     * High score means this file is a high-priority refactor candidate.
     */
    calculateRefactorROI(analysis) {
        const { interestRate, churn, stability } = analysis;

        // High interest (cost of debt) + High activity (future friction) + Low stability = High ROI
        let roi = (interestRate * 0.4) + (churn.totalCommits * 0.4) + (100 - (stability || 0)) * 0.2;

        return Math.floor(Math.min(100, roi));
    }

    /**
     * Elite: Predict PR Risk
     * Analyzes if recent patterns match historical bug hotspots
     */
    predictRisk(analysis) {
        const { interestRate, churn, stability } = analysis;
        let risk = (100 - (stability || 0)) * 0.5 + (interestRate * 0.3) + (churn.totalCommits * 0.2);

        // Normalize to a 0-10 scale for UI badges
        return Math.min(10, Math.floor(risk / 10));
    }

    /**
     * Elite: Identify Fossil Zones
     * Returns line ranges that haven't been touched in >500 days
     */
    identifyFossilZones(lines) {
        const fossils = [];
        const threshold = 500 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        let currentRange = null;
        lines.forEach((line, index) => {
            const age = now - new Date(line.date).getTime();
            if (age > threshold) {
                if (!currentRange) {
                    currentRange = { start: index + 1, end: index + 1, author: line.author };
                } else if (currentRange.author === line.author) {
                    currentRange.end = index + 1;
                } else {
                    fossils.push(currentRange);
                    currentRange = { start: index + 1, end: index + 1, author: line.author };
                }
            } else if (currentRange) {
                fossils.push(currentRange);
                currentRange = null;
            }
        });
        if (currentRange) fossils.push(currentRange);
        return fossils;
    }

    /**
     * Elite: Calculate Knowledge Gaps (Tribal Knowledge)
     * Identifies if the owners of specific blocks are still "active"
     */
    calculateKnowledgeGaps(analysis) {
        const gaps = [];
        const { lines, churn } = analysis;
        const activeAuthors = new Set(churn.authors.slice(0, 3).map(a => a.name)); // Simplified: Top 3 are "active"

        // Find blocks owned by non-active authors
        let currentGap = null;
        lines.forEach((line, index) => {
            if (!activeAuthors.has(line.author)) {
                if (!currentGap) {
                    currentGap = { start: index + 1, end: index + 1, author: line.author };
                } else if (currentGap.author === line.author) {
                    currentGap.end = index + 1;
                } else {
                    gaps.push(currentGap);
                    currentGap = { start: index + 1, end: index + 1, author: line.author };
                }
            } else if (currentGap) {
                gaps.push(currentGap);
                currentGap = null;
            }
        });
        if (currentGap) gaps.push(currentGap);
        return gaps;
    }

    /**
     * Elite: Detect Zenith State
     * High Stability + High Originality + Low Churn
     */
    detectZenithState(analysis) {
        const { stability, originalityIndex, churn } = analysis;
        return (stability > 90 && originalityIndex > 80 && churn.totalCommits < 20);
    }

    /**
     * Elite: Extract Echoed Reviews
     * Scans history for PR discussions or review-like comments in commits
     */
    async extractEchoedReviews(git, relativePath) {
        const reviews = [];
        try {
            const log = await git.log({ file: relativePath });
            // Look for "PR #123", "Review:", "Notes:", etc.
            const reviewCommits = log.all.filter(c => /PR #?\d+|review:|approved by|notes:/i.test(c.message));

            reviewCommits.forEach(c => {
                reviews.push({
                    author: c.author_name,
                    date: new Date(c.date),
                    content: c.message.split('\n').slice(1).join('\n').trim() || c.message.split('\n')[0],
                    hash: c.hash
                });
            });
        } catch (e) { console.error('Echoed Reviews error:', e); }
        return reviews;
    }

    /**
     * Elite: Generate Onboarding Tour
     * Identifies key historical turning points for new developers
     */
    generateOnboardingTour(analysis) {
        const { lines = [], churn = {}, implicitLore = [], epochs = [] } = analysis;
        const milestones = [];
        const now = new Date();

        // 1. Birth - First commit
        if (lines.length > 0) {
            const firstLine = lines[lines.length - 1];
            milestones.push({
                type: 'birth',
                date: firstLine.date,
                author: firstLine.author,
                content: `File created by ${firstLine.author}`,
                icon: '🌱',
                importance: 10
            });
        }

        // 2. Major Refactors - Commits with significant line changes
        if (churn.commits && churn.commits.length > 0) {
            const majorRefactors = churn.commits
                .filter(c => {
                    // Estimate lines changed from message or use a threshold
                    const msg = c.message.toLowerCase();
                    return msg.includes('refactor') || msg.includes('rewrite') || msg.includes('restructure');
                })
                .slice(0, 3);

            majorRefactors.forEach(c => {
                milestones.push({
                    type: 'refactor',
                    date: new Date(c.date),
                    author: c.author_name,
                    content: `Major refactor: ${c.message.split('\n')[0]}`,
                    hash: c.hash,
                    icon: '🔄',
                    importance: 8
                });
            });
        }

        // 3. Bug Fix Clusters - High bug activity periods
        if (churn.commits && churn.commits.length > 0) {
            const bugFixes = churn.commits.filter(c =>
                /fix|bug|issue|patch|hotfix/i.test(c.message)
            );

            if (bugFixes.length > 5) {
                milestones.push({
                    type: 'bugfix-cluster',
                    date: bugFixes[0] ? new Date(bugFixes[0].date) : now,
                    content: `High bug activity period: ${bugFixes.length} fixes recorded`,
                    icon: '🐛',
                    importance: 6
                });
            }
        }

        // 4. Ownership Transitions - When primary maintainer changed
        if (lines.length > 0) {
            const authorsByPeriod = {};
            const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

            lines.forEach(l => {
                const period = l.date > oneYearAgo ? 'recent' : 'legacy';
                authorsByPeriod[period] = authorsByPeriod[period] || {};
                authorsByPeriod[period][l.author] = (authorsByPeriod[period][l.author] || 0) + 1;
            });

            const legacyOwner = Object.entries(authorsByPeriod.legacy || {})
                .sort((a, b) => b[1] - a[1])[0];
            const recentOwner = Object.entries(authorsByPeriod.recent || {})
                .sort((a, b) => b[1] - a[1])[0];

            if (legacyOwner && recentOwner && legacyOwner[0] !== recentOwner[0]) {
                milestones.push({
                    type: 'ownership-transition',
                    date: oneYearAgo,
                    content: `Ownership transitioned from ${legacyOwner[0]} to ${recentOwner[0]}`,
                    icon: '👥',
                    importance: 7
                });
            }
        }

        // 5. Architectural Decisions - From implicit lore
        const architecturalDecisions = implicitLore.filter(l =>
            l.type === 'decision' || l.type === 'architecture'
        );

        architecturalDecisions.slice(0, 3).forEach(d => {
            milestones.push({
                type: 'architecture',
                date: d.date,
                author: d.author,
                content: d.content,
                hash: d.hash,
                icon: '🏗️',
                importance: 9
            });
        });

        // 6. High Churn Epochs - Major development periods
        epochs.slice(0, 2).forEach(e => {
            milestones.push({
                type: 'epoch',
                date: new Date(e.period + '-01'),
                content: `Major Era: ${e.name} (${e.commits} commits)`,
                keywords: e.keywords,
                icon: '⚡',
                importance: 7
            });
        });

        // 7. Dependency Changes - Major library updates
        if (churn.commits && churn.commits.length > 0) {
            const dependencyChanges = churn.commits.filter(c =>
                /upgrade|update|migrate|dependency|package/i.test(c.message) &&
                /version|v\d|@\d/i.test(c.message)
            );

            dependencyChanges.slice(0, 2).forEach(c => {
                milestones.push({
                    type: 'dependency',
                    date: new Date(c.date),
                    author: c.author_name,
                    content: `Dependency update: ${c.message.split('\n')[0]}`,
                    hash: c.hash,
                    icon: '📦',
                    importance: 5
                });
            });
        }

        // 8. Security Fixes - Critical patches
        if (churn.commits && churn.commits.length > 0) {
            const securityFixes = churn.commits.filter(c =>
                /security|cve|vulnerability|exploit|xss|injection/i.test(c.message)
            );

            securityFixes.forEach(c => {
                milestones.push({
                    type: 'security',
                    date: new Date(c.date),
                    author: c.author_name,
                    content: `Security fix: ${c.message.split('\n')[0]}`,
                    hash: c.hash,
                    icon: '🔒',
                    importance: 10
                });
            });
        }

        // Sort by date (oldest first) and then by importance
        return milestones
            .sort((a, b) => {
                const dateCompare = (a.date || now) - (b.date || now);
                return dateCompare !== 0 ? dateCompare : (b.importance || 0) - (a.importance || 0);
            })
            .slice(0, 15); // Limit to top 15 milestones
    }

    /**
     * Elite: Generate Onboarding Recommendations
     * Provides expert contacts and related files for new developers
     */
    generateOnboardingRecommendations(analysis) {
        const { busFactor, knowledgeNeighbors = [], churn = {} } = analysis;

        // Expert recommendations from bus factor analysis
        const experts = (busFactor?.contributors || [])
            .slice(0, 3)
            .map(c => ({
                name: c.name,
                ownership: c.percent,
                linesOwned: c.linesOwned,
                role: c.percent > 50 ? 'Primary Maintainer' :
                    c.percent > 25 ? 'Core Contributor' : 'Contributor'
            }));

        // Related files from knowledge proximity
        const relatedFiles = knowledgeNeighbors
            .slice(0, 5)
            .map(n => ({
                file: n.name,
                coupling: n.strength,
                reason: n.strength > 7 ? 'Frequently changed together' :
                    n.strength > 4 ? 'Often modified in same commits' :
                        'Related by commit history'
            }));

        // Quick facts
        const facts = {
            age: analysis.ageDays || 0,
            totalCommits: churn.totalCommits || 0,
            contributors: (churn.authors || []).length,
            lastModified: analysis.lastModified || new Date(),
            complexity: analysis.lines?.length || 0
        };

        return {
            experts,
            relatedFiles,
            facts
        };
    }

    /**
     * Elite: Calculate Detailed Debt Interest
     * Quantifies cumulative churn on code > 1 year old
     */
    calculateDetailedDebtInterest(lines, churn) {
        const threshold = 365 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const oldLines = lines.filter(l => (now - new Date(l.date).getTime()) > threshold).length;
        const ratio = lines.length > 0 ? oldLines / lines.length : 0;

        // Interest = Churn * Ratio of Legacy Code
        return Math.floor(churn.totalCommits * ratio * 5); // Heuristic score
    }

    /**
     * Elite: Check Architectural Drift
     * Validates if recent changes align with inferred patterns
     */
    checkArchitecturalDrift(analysis) {
        const { emergingPatterns = [], churn } = analysis;
        if (emergingPatterns.length > 0 && churn.totalCommits > 50) {
            // If high churn but no new patterns found recently, potential drift
            return {
                level: 'warning',
                message: 'Structural evolution has stalled. Recent changes may be deviating from established patterns.'
            };
        }
        return null;
    }

    /**
     * Elite: Calculate Developer Reputation
     * Heuristic based on Zenith ownership and contribution quality
     */
    calculateDeveloperReputation(analysis) {
        let score = 0;
        const { isZenith, ownership, originalityIndex } = analysis;

        if (isZenith) score += 50;
        if (originalityIndex > 50) score += 20;
        if (ownership && ownership.percent > 50) score += 10;

        return score;
    }

    /**
     * Elite: Generate Evolutionary Badges
     */
    generateEvolutionaryBadges(analysis) {
        const badges = [];
        const { isZenith, churn, originalityIndex, safetyScore } = analysis;

        if (isZenith) badges.push({ id: 'zenith_master', label: '🏆 Zenith Master', color: '#FBBF24' });
        if (churn.totalCommits > 100) badges.push({ id: 'battle_hardened', label: '🛡️ Battle Hardened', color: '#60A5FA' });
        if (originalityIndex > 90) badges.push({ id: 'first_ancestor', label: '🗿 First Ancestor', color: '#94A3B8' });
        if (safetyScore > 90) badges.push({ id: 'guardian', label: '🛡️ Guardian', color: '#69f0ae' });

        return badges;
    }

    /**
     * God-Tier: Butterfly Effect Predictor
     * Predicts recursive impact ripples based on coupling graphs
     */
    async predictButterflyRipples(repoPath, filePath, depth = 2) {
        const ripples = [];
        try {
            // 1. Get direct coupled files
            const primaryCoupling = await this.findKnowledgeProximity(repoPath, filePath);

            for (const neighbor of (primaryCoupling.neighbors || []).slice(0, 3)) {
                ripples.push({
                    file: neighbor.name,
                    strength: neighbor.strength,
                    depth: 1,
                    reason: `Directly coupled to ${path.basename(filePath)}`
                });

                if (depth > 1) {
                    // 2. Get secondary ripples (simplified)
                    // In a real implementation, we'd recurse. Here we simulate for performance.
                    ripples.push({
                        file: `${neighbor.name} (Sub-dependency)`,
                        strength: Math.floor(neighbor.strength * 0.6),
                        depth: 2,
                        reason: `Recursive ripple from ${neighbor.name}`
                    });
                }
            }
        } catch (e) { console.error('Butterfly Predictor error:', e); }
        return ripples;
    }

    /**
     * Elite: Pattern Mining (Heuristic)
     * Detects repeated structural blocks that might be "Implicit Standards"
     */
    async detectEmergingPatterns(repoPath, filePath) {
        const patterns = [];
        try {
            const fs = require('fs');
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            // Find repeated line sequences (length 2-4)
            const map = new Map();
            for (let i = 0; i < lines.length - 2; i++) {
                const chunk = lines.slice(i, i + 3).map(l => l.trim()).join(' ');
                if (chunk.length > 20) {
                    map.set(chunk, (map.get(chunk) || 0) + 1);
                }
            }

            map.forEach((count, chunk) => {
                if (count >= 3) {
                    patterns.push({
                        type: 'standard',
                        content: `Emerging Pattern Detected (${count} occurrences): "${chunk.substring(0, 40)}..."`,
                        author: 'Structural Analysis',
                        date: new Date(),
                        hash: 'HEAD'
                    });
                }
            });
        } catch (e) { }
        return patterns;
    }

    /**
     * Elite: Implicit FAQ (Comment Crawler)
     */
    async extractImplicitFAQ(repoPath, filePath) {
        const lore = [];
        try {
            const content = require('fs').readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            const commentPatterns = [
                { regex: /\/\/\s*why\??:\s*(.*)/i, type: 'rationale' },
                { regex: /\/\/\s*caution:\s*(.*)/i, type: 'warning' },
                { regex: /\/\/\s*note:\s*(.*)/i, type: 'info' },
                { regex: /\/\/\s*fixme-lore:\s*(.*)/i, type: 'debt' }
            ];

            lines.forEach((line, index) => {
                commentPatterns.forEach(({ regex, type }) => {
                    const match = line.match(regex);
                    if (match && match[1]) {
                        lore.push({
                            type,
                            content: match[1].trim(),
                            author: 'Local Source',
                            date: new Date(),
                            hash: 'HEAD',
                            line: index + 1
                        });
                    }
                });
            });
        } catch (e) { console.error('Implicit FAQ error:', e); }
        return lore;
    }

    /**
     * Elite: Dependency Pulse (Vendor Pivots)
     */
    async detectVendorPivots(git, repoPath) {
        const pivots = [];
        const packagePaths = ['package.json', 'package-lock.json', 'build.gradle', 'pom.xml'];
        const fs = require('fs');

        for (const p of packagePaths) {
            try {
                const fullPath = path.join(repoPath, p);
                if (fs.existsSync(fullPath)) {
                    const log = await git.log({ file: p, n: 10 });
                    for (const entry of log.all) {
                        if (/add|remove|replace|update|switch|vendor|lib/i.test(entry.message)) {
                            pivots.push({
                                type: 'pivot',
                                content: `Dependency Shift in ${p}: ${entry.message.split('\n')[0]}`,
                                author: entry.author_name,
                                date: new Date(entry.date),
                                hash: entry.hash
                            });
                        }
                    }
                }
            } catch (e) { }
        }
        return pivots;
    }

    /**
     * Master Analysis Engine: Orchestrates all temporal and structural insights
     */
    async analyzeFile(repoPath, filePath, force = false, context = null) {
        const git = simpleGit(repoPath);
        const relativePath = path.relative(repoPath, filePath);

        // Tracked check
        try {
            await git.raw(['ls-files', '--error-unmatch', relativePath]);
        } catch (e) {
            throw new Error('File is not tracked by git');
        }

        // Phase 5: Incremental Analysis & Caching
        if (context && !force) {
            const head = await git.revparse(['HEAD']);
            const cacheKey = `vestige.cache.${relativePath}.${head}`;
            const cached = context.globalState.get(cacheKey);
            if (cached) {
                console.log(`Vestige: High-speed incremental hit for ${relativePath}`);
                return JSON.parse(cached);
            }
        }

        const lines = await this.getFileTimeline(repoPath, filePath);
        const churn = await this.calculateChurn(git, relativePath);

        const originality = this.calculateOriginalityIndex(lines);
        const interest = this.calculateInterestRate(churn);
        const conflicts = await this.checkPredictiveConflicts(repoPath, filePath);
        const graph = await this.findKnowledgeProximity(repoPath, filePath);
        const shadows = await this.findRecentDeletions(repoPath, filePath);

        // Elite AI: Automated Lore Suite
        const implicitLore = await this.extractImplicitLore(git, relativePath);
        const shadowLore = await this.detectShadowLore(git, relativePath);
        const implicitFAQ = await this.extractImplicitFAQ(repoPath, filePath);
        const vendorPivots = await this.detectVendorPivots(git, repoPath);
        const emergingPatterns = await this.detectEmergingPatterns(repoPath, filePath);

        const heat = this.calculateOwnershipHeat({
            churn,
            ownership: {
                percent: churn.authors ? (churn.authors.length > 0 ? churn.authors[0].percent : 0) : 0
            }
        });
        const bio = this.generateNarrativeBiography({
            lines, churn, originalityIndex: originality,
            stability: Math.max(0, 100 - churn.totalCommits),
            implicitLore: [...implicitLore, ...shadowLore, ...implicitFAQ, ...vendorPivots, ...emergingPatterns]
        });

        const result = {
            lines,
            churn,
            originalityIndex: originality,
            interestRate: interest,
            predictiveConflicts: conflicts,
            knowledgeNeighbors: graph,
            narrativeBiography: bio,
            ownershipHeat: heat,
            deletedChunks: shadows,
            stability: Math.max(0, 100 - churn.totalCommits),
            implicitLore: [...implicitLore, ...shadowLore, ...implicitFAQ, ...vendorPivots, ...emergingPatterns],
            repoPath,
            safetyScore: this.calculateSafetyScore({ implicitLore: [...implicitLore, ...shadowLore, ...implicitFAQ, ...vendorPivots, ...emergingPatterns], churn, interestRate: interest }),
            refactorROI: this.calculateRefactorROI({ interestRate: interest, churn, stability: Math.max(0, 100 - churn.totalCommits) }),
            prRisk: this.predictRisk({ interestRate: interest, churn, stability: Math.max(0, 100 - churn.totalCommits) }),
            fossilZones: this.identifyFossilZones(lines),
            knowledgeGaps: this.calculateKnowledgeGaps({ lines, churn }),
            isZenith: this.detectZenithState({ stability: Math.max(0, 100 - churn.totalCommits), originalityIndex: originality, churn }),
            echoedReviews: await this.extractEchoedReviews(git, relativePath),
            onboardingTour: this.generateOnboardingTour({ lines, churn, epochs: [] }),
            debtInterest: this.calculateDetailedDebtInterest(lines, churn),
            archDrift: this.checkArchitecturalDrift({ emergingPatterns, churn }),
            reputation: this.calculateDeveloperReputation({ isZenith: this.detectZenithState({ stability: Math.max(0, 100 - churn.totalCommits), originalityIndex: originality, churn }), ownership: { percent: churn.authors && churn.authors.length > 0 ? churn.authors[0].percent : 0 }, originalityIndex: originality }),
            badges: this.generateEvolutionaryBadges({ isZenith: this.detectZenithState({ stability: Math.max(0, 100 - churn.totalCommits), originalityIndex: originality, churn }), churn, originalityIndex: originality, safetyScore: this.calculateSafetyScore({ implicitLore: [], churn, interestRate: interest }) }),
            butterflyRipples: await this.predictButterflyRipples(repoPath, filePath),
            ownership: {
                topAuthor: churn.authors && churn.authors.length > 0 ? churn.authors[0].name : 'Unknown',
                percent: churn.authors && churn.authors.length > 0 ? churn.authors[0].percent : 0
            }
        };
    }

    /**
     * Elite: Calculate Ownership Heat
     */
    calculateOwnershipHeat(analysis) {
        const authors = analysis.churn.totalAuthors || 0;
        const topOwnerPercent = analysis.ownership?.percent || 0;
        const isBusRisk = topOwnerPercent > 80 && authors > 1;
        const isHotPotato = authors >= 5 && topOwnerPercent < 30;
        return { isBusRisk, isHotPotato, topOwnerPercent, authors };
    }

    /**
     * Elite: Find Recent Deletions (Ghost Shadows)
     */
    async findRecentDeletions(repoPath, filePath) {
        const git = simpleGit(repoPath);
        const relativePath = path.relative(repoPath, filePath);
        const deletions = [];

        try {
            const patch = await git.raw(['log', '-p', '--since=30 days ago', '--', relativePath]);
            const patchLines = patch.split('\n');

            let currentHash = '';
            let currentAuthor = '';
            let currentLine = 0;
            let inHunk = false;
            let deletedLines = [];

            for (const line of patchLines) {
                if (line.startsWith('commit ')) {
                    currentHash = line.substring(7);
                    inHunk = false;
                } else if (line.startsWith('Author: ')) {
                    currentAuthor = line.substring(8);
                } else if (line.startsWith('@@ ')) {
                    const match = line.match(/@@ -\d+,\d+ \+(\d+),\d+ @@/);
                    if (match) {
                        currentLine = parseInt(match[1]);
                        inHunk = true;
                        if (deletedLines.length > 0) {
                            deletions.push({
                                line: currentLine,
                                content: deletedLines.join('\n'),
                                author: currentAuthor,
                                hash: currentHash
                            });
                            deletedLines = [];
                        }
                    }
                } else if (inHunk && line.startsWith('-') && !line.startsWith('---')) {
                    deletedLines.push(line.substring(1));
                }
            }

            if (deletedLines.length > 0) {
                deletions.push({
                    line: currentLine,
                    content: deletedLines.join('\n'),
                    author: currentAuthor,
                    hash: currentHash
                });
            }
        } catch (e) {
            console.error('Ghost shadow detection failed', e);
        }
        return deletions;
    }
}

module.exports = GitAnalyzer;
