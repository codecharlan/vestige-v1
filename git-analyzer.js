const simpleGit = require('simple-git');
const path = require('path');
const vscode = require('vscode');

class GitAnalyzer {
    constructor() {
        this.git = simpleGit();
    }

    async analyzeFile(repoPath, filePath) {
        try {
            const git = simpleGit(repoPath);
            const relativePath = path.relative(repoPath, filePath);

            // Check if file is tracked
            try {
                await git.raw(['ls-files', '--error-unmatch', relativePath]);
            } catch (e) {
                throw new Error('File is not tracked by git');
            }

            // Get blame data
            // Use -w to ignore whitespace changes if desired, but standard is better for accuracy
            const blame = await git.raw(['blame', '--line-porcelain', relativePath]);
            const lines = this.parseBlame(blame);

            // Calculate metrics
            const churn = await this.calculateChurn(git, relativePath);

            return {
                lines,
                churn
            };
        } catch (error) {
            console.error('Git analysis failed:', error);
            throw error;
        }
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

    async detectZombieCode(repoPath, filePath) {
        const stats = await this.getFileStats(repoPath, filePath);
        if (!stats) return null;

        const zombieDays = vscode.workspace.getConfiguration('vestige').get('zombieAgeDays') || 365;
        const msPerDay = 1000 * 60 * 60 * 24;
        const daysSinceLastCommit = (new Date() - stats.lastCommitDate) / msPerDay;

        if (daysSinceLastCommit > zombieDays) {
            return {
                isZombie: true,
                days: Math.floor(daysSinceLastCommit),
                lastAuthor: stats.lastAuthor
            };
        }
        return null;
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
}

module.exports = GitAnalyzer;
