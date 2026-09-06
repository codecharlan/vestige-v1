import * as vscode from 'vscode';
import simpleGit, { SimpleGit, DefaultLogFields, ListLogLine } from 'simple-git';
import * as path from 'path';
import { Worker } from 'worker_threads';

export interface BlameLineInfo {
    hash: string;
    lineNo: number;
    isUncommitted: boolean;
    author?: string;
    date?: Date;
    summary?: string;
    content?: string;
}

export interface ChurnData {
    totalCommits: number;
    lastCommit: DefaultLogFields & ListLogLine | null;
    authors?: { name: string; count: number; percent: number }[];
    commits?: any[];
}

export interface LoreDecision {
    type: string;
    description: string;
    commitHash: string;
    date: Date;
}

const LORE_PATTERNS = [
    { pattern: /Architecture:|Design:|Structure:/i, type: 'architecture' },
    { pattern: /Decided to:|Decision:|We will:/i, type: 'decision' },
    { pattern: /Reasoning:|Why:|Rationale:/i, type: 'rationale' },
    { pattern: /Caution:|Warning:|Note:/i, type: 'warning' },
    { pattern: /Vendor:|Dependency:|replaced \w+ with \w+/i, type: 'pivot' }
];

class GitAnalyzer { [key: string]: any;
    constructor() {
        this.git = simpleGit();
        this._workerIdCounter = 0;
    }

    _runWorker(taskName: string, payload: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, 'git-worker.js'));
            const id = this._workerIdCounter++;

            worker.on('message', (msg) => {
                if (msg.id === id) {
                    if (msg.error) reject(new Error(msg.error));
                    else resolve(msg.result);
                    worker.terminate();
                }
            });

            worker.on('error', (err) => {
                worker.terminate();
                reject(err);
            });
            worker.on('exit', (code) => {
                if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
            });

            worker.postMessage({ id, type: taskName, ...payload });
        });
    }

    parseBlame(blameOutput: string): BlameLineInfo[] {
        const lines: BlameLineInfo[] = [];
        const blameLines = blameOutput.split('\n');
        let currentLine: Partial<BlameLineInfo> = {};

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
                if (currentLine.hash !== undefined && currentLine.lineNo !== undefined) {
                    lines.push(currentLine as BlameLineInfo);
                }
            }
        }
        return lines;
    }

    async calculateChurn(git: SimpleGit, filePath: string): Promise<ChurnData> {
        try {
            // Get number of commits for this file
            const log = await git.log({ file: filePath });

            const authorCounts: Record<string, number> = {};
            for (const c of log.all) {
                authorCounts[c.author_name] = (authorCounts[c.author_name] || 0) + 1;
            }
            const authors = Object.entries(authorCounts)
                .map(([name, count]) => ({
                    name,
                    count,
                    percent: log.total > 0 ? Math.round((count / log.total) * 100) : 0
                }))
                .sort((a, b) => b.count - a.count);

            return {
                totalCommits: log.total,
                lastCommit: log.latest,
                authors,
                commits: log.all.slice(0, 200)
            };
        } catch (e) {
            // Fallback if log fails
            return { totalCommits: 0, lastCommit: null, authors: [], commits: [] };
        }
    }


    async getFileTimeline(repoPath, filePath) {
        const git = simpleGit(repoPath);
        const relativePath = path.relative(repoPath, filePath);

        try {
            const log = await git.log({ file: relativePath });

            const authors = new Set(log.all.map(c => c.author_name));

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
            const ageDays = Math.round((now.getTime() - latest.getTime()) / (1000 * 60 * 60 * 24));

            return {
                commits: log.total,
                ageDays: ageDays
            };
        } catch (e) {
            return null;
        }
    }

    calculateOwnership(blameLines) {
        const authors: Record<string, number> = {};
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
            // Two calls, and both are necessary.
            //
            // The obvious one-call version — `git log --name-only -- <path>` —
            // silently returns nothing useful: when a pathspec is supplied,
            // --name-only lists only the names *matching that pathspec*. So the
            // output contains just the file we started from, which then gets
            // filtered out as self-coupling, and every file appears to have no
            // co-change partners at all.
            //
            // Step 1: which commits touched this file.
            const hashOutput = await git.raw([
                'log', '--format=%H', '--max-count=50', '--', relativePath
            ]);
            const commitHashes = hashOutput.split('\n').map(h => h.trim()).filter(Boolean);
            if (commitHashes.length === 0) return [];

            // Step 2: the full file list of those commits, with no pathspec.
            // `git show` accepts many revisions at once, so this stays at one
            // process regardless of history length.
            const showOutput = await git.raw([
                'show', '--name-only', '--pretty=format:COMMIT:%H', ...commitHashes
            ]);

            const fileCounts: Record<string, number> = {};
            // Count each file at most once per commit — a commit listing the
            // same path twice (rename edge cases) must not inflate coupling.
            let seenInCommit = new Set<string>();

            for (const raw of showOutput.split('\n')) {
                const line = raw.trim();
                if (raw.startsWith('COMMIT:')) {
                    seenInCommit = new Set<string>();
                    continue;
                }
                if (!line || line === relativePath) continue;
                if (seenInCommit.has(line)) continue;
                seenInCommit.add(line);
                fileCounts[line] = (fileCounts[line] || 0) + 1;
            }

            return Object.entries(fileCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
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

    /**
     * Architectural Gravity Map
     * =========================
     * Builds a full co-change graph for the repo using a single git log call,
     * then runs lightweight community detection (greedy modularity) to identify
     * emergent architectural clusters — the *real* modules in the codebase.
     *
     * @param {string} repoPath
     * @param {number} maxCommits - How far back to look (default 500)
     * @returns {{ nodes, edges, clusters }} — suitable for force-graph rendering
     */
    async buildCoChangeGraph(repoPath, maxCommits = 500) {
        const git = simpleGit(repoPath);

        try {
            // One git call for the entire repo history with file names
            const logOutput = await git.raw([
                'log', '--name-only', '--pretty=format:COMMIT:%H',
                `--max-count=${maxCommits}`
            ]);

            // Parse into commit → [files] map
            const commitFiles = new Map<string, string[]>();
            let currentHash = null;

            for (const line of logOutput.split('\n')) {
                if (line.startsWith('COMMIT:')) {
                    currentHash = line.substring(7);
                    commitFiles.set(currentHash, []);
                } else if (line.trim() && currentHash) {
                    commitFiles.get(currentHash).push(line.trim());
                }
            }

            // Build co-change edge weights
            // edge key: "fileA|||fileB" (sorted alphabetically for uniqueness)
            const edgeWeights = new Map<string, number>();
            const nodeSet = new Set<string>();

            for (const [, files] of commitFiles) {
                if (files.length < 2 || files.length > 30) continue; // skip trivial/mega commits
                for (let i = 0; i < files.length; i++) {
                    nodeSet.add(files[i]);
                    for (let j = i + 1; j < files.length; j++) {
                        nodeSet.add(files[j]);
                        const key = [files[i], files[j]].sort().join('|||');
                        edgeWeights.set(key, (edgeWeights.get(key) || 0) + 1);
                    }
                }
            }

            // Build nodes array
            const nodes = Array.from(nodeSet).map(id => ({
                id,
                label: id.split('/').pop(), // Filename only for display
                fullPath: id,
            }));

            // Build edges array (only edges with weight >= 2)
            const edges = [];
            for (const [key, weight] of edgeWeights) {
                if (weight >= 2) {
                    const [source, target] = key.split('|||');
                    edges.push({ source, target, weight });
                }
            }

            // Detect architectural clusters via greedy community detection
            const clusters = this._detectClusters(nodes, edges);

            return { nodes, edges, clusters, commitCount: commitFiles.size };
        } catch (e) {
            console.error('Co-change graph build failed:', e);
            return { nodes: [], edges: [], clusters: [], commitCount: 0 };
        }
    }

    /**
     * Lightweight greedy community detection on the co-change graph.
     * Groups nodes into clusters by iteratively merging the highest-weight
     * connected components. Returns named clusters with member files.
     *
     * @private
     */
    _detectClusters(nodes, edges) {
        // Union-Find with weighted merging
        const parent = new Map<string, string>(nodes.map(n => [n.id, n.id]));
        const rank = new Map<string, number>(nodes.map(n => [n.id, 0]));
        const clusterWeight = new Map<string, number>(nodes.map(n => [n.id, 0]));

        const find = (x) => {
            if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
            return parent.get(x);
        };

        const union = (x, y, weight) => {
            const px = find(x), py = find(y);
            if (px === py) return;
            const rx = rank.get(px) || 0, ry = rank.get(py) || 0;
            const merged = rx >= ry ? px : py;
            const other = merged === px ? py : px;
            parent.set(other, merged);
            clusterWeight.set(merged, (clusterWeight.get(merged) || 0) + weight);
            if (rx === ry) rank.set(merged, rx + 1);
        };

        // Sort edges by weight descending — strongest couplings form clusters first
        const sorted = [...edges].sort((a, b) => b.weight - a.weight);
        for (const edge of sorted) {
            union(edge.source, edge.target, edge.weight);
        }

        // Group nodes by cluster root
        const clusterMap = new Map();
        for (const node of nodes) {
            const root = find(node.id);
            if (!clusterMap.has(root)) clusterMap.set(root, []);
            clusterMap.get(root).push(node);
        }

        // Name clusters by their most common directory prefix
        const clusters = [];
        let clusterId = 0;
        for (const [root, members] of clusterMap) {
            if (members.length < 2) continue; // Singletons not interesting
            const paths = members.map(m => m.fullPath);
            const commonPrefix = this._commonPathPrefix(paths);
            clusters.push({
                id: clusterId++,
                name: commonPrefix || `Cluster ${clusterId}`,
                root,
                members: members.map(m => m.id),
                memberCount: members.length,
                strength: clusterWeight.get(root) || 0,
            });
        }

        return clusters.sort((a, b) => b.strength - a.strength);
    }

    /** Find the longest common directory prefix of a list of paths. */
    _commonPathPrefix(paths) {
        if (!paths.length) return '';
        const parts = paths.map(p => p.split('/'));
        const minLen = Math.min(...parts.map(p => p.length));
        const common = [];
        for (let i = 0; i < minLen - 1; i++) {
            const segment = parts[0][i];
            if (parts.every(p => p[i] === segment)) common.push(segment);
            else break;
        }
        return common.join('/');
    }

    // V3: Epoch Detection
    async detectEpochs(repoPath) {
        const git = simpleGit(repoPath);

        try {
            const log = await git.log({ maxCount: 500 }); // Last 500 commits
            if (log.total === 0) return [];

            const epochs = [];
            const monthlyGroups: Record<string, { commits: any[]; keywords: Record<string, number> }> = {};

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
            const lines = await this._runWorker('parseBlame', { blameOutput: blame });

            const authorLines: Record<string, number> = {};
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

    /** Get a file's content as of a specific commit (used by resurrection + document provider). */
    async getFileAtCommit(repoPath, commitHash, relativePath) {
        const git = simpleGit(repoPath);
        return await git.show([`${commitHash}:${relativePath}`]);
    }

    /**
     * The current user's git identity, cached per repo.
     * Needed to tell someone whether *they* are a stranger to a file.
     */
    async getCurrentUser(repoPath) {
        if (this._currentUser && this._currentUser.repoPath === repoPath) {
            return this._currentUser;
        }
        try {
            const git = simpleGit(repoPath);
            const name = (await git.raw(['config', 'user.name'])).trim();
            const email = (await git.raw(['config', 'user.email'])).trim();
            this._currentUser = { repoPath, name, email };
            return this._currentUser;
        } catch (e) {
            this._currentUser = { repoPath, name: '', email: '' };
            return this._currentUser;
        }
    }

    /**
     * Minor-contributor risk for the current user on a file.
     *
     * This is the one ownership signal with strong empirical support: Bird et
     * al. (ESEC/FSE 2011) found the count of *minor contributors* — people who
     * authored under ~5% of a component — correlated with defects better than
     * any other metric Microsoft collected (ρ up to 0.93), while the
     * "ownership concentration" figure correlated far more weakly. Bus factor,
     * by contrast, has a measured error above 5 on small integers and its own
     * authors caution against treating it as an arbiter.
     *
     * So rather than labelling a file "bus factor 1", we answer the question a
     * developer can actually act on: am I about to change code I have almost
     * no history with, and who should review it?
     */
    async assessChangeRisk(repoPath, filePath) {
        const [user, busFactor] = await Promise.all([
            this.getCurrentUser(repoPath),
            this.calculateBusFactor(repoPath, filePath)
        ]);
        return this._riskFromContributors(busFactor?.contributors || [], user);
    }

    /**
     * Same assessment, but from blame lines already in hand — so the main
     * analysis pass doesn't pay for a second `git blame`.
     */
    _riskFromLines(lines, user) {
        const counts: Record<string, number> = {};
        let total = 0;
        (lines || []).forEach(l => {
            if (!l.author || l.author === 'You (Uncommitted)') return;
            counts[l.author] = (counts[l.author] || 0) + 1;
            total++;
        });
        if (total === 0) return null;

        const contributors = Object.entries(counts)
            .map(([name, count]) => ({
                name,
                linesOwned: count,
                percent: Math.round((count / total) * 100)
            }))
            .sort((a, b) => b.linesOwned - a.linesOwned);

        return this._riskFromContributors(contributors, user);
    }

    _riskFromContributors(contributors, user) {
        if (!contributors || contributors.length === 0) return null;

        const total = contributors.reduce((sum, c) => sum + (c.linesOwned || 0), 0);
        if (total === 0) return null;

        const mine = contributors.find(c =>
            c.name && user?.name && c.name.toLowerCase() === user.name.toLowerCase()
        );
        const myShare = mine ? (mine.percent || 0) : 0;
        const topOwner = contributors[0];

        // Bird et al.'s threshold: under 5% of the history is a "minor" contributor.
        const isMinorContributor = myShare < 5;
        const someoneElseOwnsIt = topOwner && (topOwner.percent || 0) >= 50 &&
            (!mine || topOwner.name !== mine.name);

        return {
            myShare,
            isMinorContributor,
            topOwner: topOwner ? { name: topOwner.name, percent: topOwner.percent } : null,
            contributorCount: contributors.length,
            // Only worth interrupting someone for when both hold.
            shouldSuggestReview: isMinorContributor && someoneElseOwnsIt,
            reason: isMinorContributor && someoneElseOwnsIt
                ? `You've authored ${myShare}% of this file; ${topOwner.name} has ${topOwner.percent}%.`
                : null
        };
    }

    /** Resolve any git ref (e.g. "abc123^") to a full commit hash. */
    async resolveCommit(repoPath, ref) {
        const git = simpleGit(repoPath);
        return (await git.revparse([ref])).trim();
    }

    /** Full diff of a single commit (used by Ghost Cursor replay + AI explain). */
    async getCommitDiff(repoPath, commitHash, filePath = null) {
        const git = simpleGit(repoPath);
        const args = ['show', commitHash];
        if (filePath) {
            args.push('--', path.relative(repoPath, filePath));
        }
        return await git.raw(args);
    }

    /** Commit message body for a single commit. */
    async getCommitMessage(repoPath, commitHash) {
        const git = simpleGit(repoPath);
        return await git.raw(['show', '-s', '--format=%B', commitHash]);
    }

    /**
     * History of a specific line range — `git log -L`.
     *
     * This answers the question people actually have. Blame answers a spatial
     * question ("how did each line of this file get here"), but the question
     * being asked is almost always temporal and narrow: "how did *this block*
     * come to look like this". `git log -L` is the right primitive for it and
     * is largely unknown, so surfacing it is genuine added value rather than
     * another blame overlay.
     *
     * @param startLine 1-indexed, inclusive
     * @param endLine   1-indexed, inclusive (defaults to startLine)
     */
    async getLineageChain(repoPath, filePath, startLine, endLine = null) {
        const git = simpleGit(repoPath);
        const relativePath = path.relative(repoPath, filePath);
        const from = Math.max(1, parseInt(startLine, 10) || 1);
        const to = Math.max(from, parseInt(endLine, 10) || from);

        try {
            // A unit separator keeps the delimiter out of commit subjects.
            const logOutput = await git.raw([
                'log',
                '-L', `${from},${to}:${relativePath}`,
                '--max-count=40',
                '--pretty=format:%x1fCOMMIT%x1f%H%x1f%an%x1f%aI%x1f%s',
                '--date=short'
            ]);

            const chain = [];
            // Records are introduced by our sentinel; everything between two
            // sentinels is the commit header plus its diff hunk.
            const blocks = logOutput.split('\x1fCOMMIT\x1f').slice(1);

            for (const block of blocks) {
                const newlineAt = block.indexOf('\n');
                const header = newlineAt === -1 ? block : block.slice(0, newlineAt);
                const body = newlineAt === -1 ? '' : block.slice(newlineAt + 1);
                const [hash, author, isoDate, ...subjectParts] = header.split('\x1f');
                if (!hash) continue;

                // Keep only the changed lines of the hunk — that's the story.
                const diffLines = body.split('\n')
                    .filter(l => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---'))
                    .slice(0, 30);

                chain.push({
                    hash,
                    shortHash: hash.slice(0, 7),
                    author,
                    date: isoDate ? new Date(isoDate) : null,
                    message: subjectParts.join('\x1f'),
                    diff: diffLines.join('\n')
                });
            }

            return chain; // Newest first, as git returns it
        } catch (e) {
            // Distinguish "git can't trace this" from "nothing ever changed
            // here". `git log -L` fails outright when the path isn't in HEAD —
            // a renamed, newly added, or untracked file — and reporting that
            // as "no history" sends the user looking for a problem that isn't
            // there.
            const message = String(e?.message || e);
            if (/no path .* in the commit|does not exist in|unknown revision/i.test(message)) {
                throw new Error(
                    `Git has no record of ${relativePath} at the current commit. ` +
                    `If the file is new, renamed, or not yet committed, there are no line revisions to trace.`
                );
            }
            console.error('Line history failed', e);
            return [];
        }
    }

    /**
     * Compare declared ownership (CODEOWNERS) against revealed ownership
     * (who actually commits).
     *
     * CODEOWNERS is hand-maintained and GitHub validates almost nothing about
     * it: bad lines are skipped silently, the file stops loading entirely over
     * 3MB, and nothing checks whether a named owner has ever touched the code
     * or is even still contributing. So the file quietly rots, and reviews keep
     * getting routed to people who left. Nothing in the ecosystem reports this,
     * and it is cheap to detect once you already know revealed ownership.
     */
    async auditCodeowners(repoPath) {
        const fs = require('fs');
        const candidates = [
            'CODEOWNERS',
            '.github/CODEOWNERS',
            'docs/CODEOWNERS',
            '.gitlab/CODEOWNERS'
        ];

        let ownersPath = null;
        for (const c of candidates) {
            const full = path.join(repoPath, c);
            if (fs.existsSync(full)) { ownersPath = full; break; }
        }
        if (!ownersPath) return null;

        const raw = fs.readFileSync(ownersPath, 'utf8');
        const stat = fs.statSync(ownersPath);

        const rules = [];
        const malformed = [];
        raw.split('\n').forEach((line, index) => {
            const text = line.trim();
            if (!text || text.startsWith('#')) return;

            // gitignore-style negation and character ranges are NOT supported
            // by CODEOWNERS, but look plausible enough that people write them.
            if (text.startsWith('!') || /\[[^\]]*\]/.test(text)) {
                malformed.push({ line: index + 1, text, reason: 'CODEOWNERS does not support "!" negation or [ ] ranges' });
                return;
            }

            const parts = text.split(/\s+/);
            const pattern = parts[0];
            const owners = parts.slice(1).filter(o => o.startsWith('@') || o.includes('@'));

            if (owners.length === 0) {
                malformed.push({ line: index + 1, text, reason: 'Rule has a pattern but no owner' });
                return;
            }
            rules.push({ line: index + 1, pattern, owners });
        });

        // Who actually contributes, over the recent history that matters.
        const git = simpleGit(repoPath);
        const activeSince = new Date();
        activeSince.setMonth(activeSince.getMonth() - 6);

        let contributors = new Map();
        let activeContributors = new Set();
        try {
            const log = await git.log({ maxCount: 1000 });
            log.all.forEach(c => {
                const name = (c.author_name || '').toLowerCase();
                const email = (c.author_email || '').toLowerCase();
                const handle = email.split('@')[0];
                [name, email, handle].filter(Boolean).forEach(k => contributors.set(k, true));
                if (new Date(c.date) > activeSince) {
                    [name, email, handle].filter(Boolean).forEach(k => activeContributors.add(k));
                }
            });
        } catch (e) {
            return null;
        }

        // Match an @handle against git identities. These rarely correspond
        // exactly, so some fuzziness is needed — but it has to be bounded.
        //
        // A previous version accepted any substring match in either direction,
        // which meant a one-character identity (the local part of `t@t.t`)
        // matched every handle containing a "t". Every owner then looked
        // legitimate and the audit reported nothing, ever. Substring matching
        // now requires a token of real length on both sides.
        const MIN_FUZZY = 4;
        const looksKnown = (owner, keys) => {
            const handle = owner.replace(/^@/, '').split('/').pop().toLowerCase();
            if (!handle) return true;

            for (const key of keys) {
                if (typeof key !== 'string' || !key) continue;
                if (key === handle) return true;
                // Only allow containment when both sides are long enough that
                // the overlap means something.
                if (key.length >= MIN_FUZZY && handle.length >= MIN_FUZZY &&
                    (key.includes(handle) || handle.includes(key))) {
                    return true;
                }
            }
            return false;
        };

        const findings = [];
        for (const rule of rules) {
            for (const owner of rule.owners) {
                // Teams (@org/team) can't be resolved from git history — skip.
                if (owner.includes('/')) continue;

                if (!looksKnown(owner, contributors.keys())) {
                    findings.push({
                        type: 'never-contributed',
                        line: rule.line,
                        pattern: rule.pattern,
                        owner,
                        detail: `${owner} is listed as an owner but has no commits in the last 1000 commits.`
                    });
                } else if (!looksKnown(owner, activeContributors)) {
                    findings.push({
                        type: 'inactive',
                        line: rule.line,
                        pattern: rule.pattern,
                        owner,
                        detail: `${owner} owns ${rule.pattern} but hasn't committed in over 6 months.`
                    });
                }
            }
        }

        return {
            path: path.relative(repoPath, ownersPath),
            ruleCount: rules.length,
            malformed,
            findings,
            // GitHub silently stops loading the file entirely past this size.
            oversized: stat.size > 3 * 1024 * 1024,
            sizeBytes: stat.size
        };
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

            // Relative ranking score. Deliberately NOT converted into money or
            // hours: the previous version multiplied this by $50/hr and
            // presented the product as an "estimated remediation cost", which
            // is an invented figure. The score orders files within one repo;
            // the raw inputs are returned alongside it so callers can show the
            // reasoning instead of a single opaque number.
            const debtScore = parseFloat((complexityFactor * churnFactor * Math.log(ageFactor)).toFixed(1));

            return {
                score: debtScore,
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

            const sample = this._sampleArray(fileList, 50);

            const zombieDays = Number(vscode.workspace.getConfiguration('vestige').get('zombieAgeDays')) || 365;

            const checks = sample.map(async (file) => {
                const log = await git.log({ file, maxCount: 1 });
                if (log.latest) {
                    const lastCommitDate = new Date(log.latest.date);
                    const ageDays = (now.getTime() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24);
                    if (ageDays > zombieDays) {
                        return {
                            file,
                            ageDays: Math.round(ageDays),
                            lastCommit: log.latest
                        };
                    }
                }
                return null;
            });

            const results = await Promise.all(checks);
            results.forEach(res => {
                if (res) zombies.push(res);
            });

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

            const driftDaysConfig = Number(vscode.workspace.getConfiguration('vestige').get('driftDays')) || 30;

            const docChecks = docs.map(async (doc) => {
                const docLog = await git.log({ file: doc, maxCount: 1 });
                if (!docLog.latest) return [];

                const docDate = new Date(docLog.latest.date);
                const docDir = path.dirname(doc);
                const siblingCode = code.filter(f => path.dirname(f) === docDir);
                
                const localAlerts = [];
                const codeChecks = siblingCode.map(async (codeFile) => {
                    const codeLog = await git.log({ file: codeFile, maxCount: 1 });
                    if (codeLog.latest) {
                        const codeDate = new Date(codeLog.latest.date);
                        const diffDays = (codeDate.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24);

                        if (diffDays > driftDaysConfig) {
                            localAlerts.push({
                                doc,
                                codeFile,
                                daysDrift: Math.round(diffDays)
                            });
                        }
                    }
                });
                await Promise.all(codeChecks);
                return localAlerts;
            });

            const results = await Promise.all(docChecks);
            results.forEach(res => driftAlerts.push(...res));

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
            const sample = this._sampleArray(fileList, 30);

            const hotPotatoThreshold = Number(vscode.workspace.getConfiguration('vestige').get('hotPotatoAuthors')) || 5;

            for (const file of sample) {
                const log = await git.log({ file, maxCount: 50 });
                const authors = new Set(log.all.map(c => c.author_email));

                // If > configured distinct authors in last 50 commits
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

    /** Fisher-Yates sample of up to `size` items, without mutating the input. */
    _sampleArray<T>(list: T[], size: number): T[] {
        if (list.length <= size) return list;
        const copy = [...list];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy.slice(0, size);
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
    /**
     * People who have committed alongside this file — NOT files.
     *
     * This returns author names. It was previously called
     * `findKnowledgeProximity` and its results were stored as
     * `knowledgeNeighbors`, which three separate surfaces then rendered as
     * "coupled files" — a table with a "File" column listing people's names.
     * The name now says what it returns; use `getCoupledFiles` for actual
     * file coupling.
     */
    async findFrequentCollaborators(repoPath, filePath) {
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
        const { timeline, churn, originalityIndex, stability, implicitLore = [] } = analysis;

        const firstCommitDate = timeline?.summary?.firstCommit?.date;
        const authorCount = (churn.authors || []).length || timeline?.summary?.authors?.length || 0;

        let story = `This file has been active since ${firstCommitDate ? new Date(firstCommitDate).toDateString() : 'unknown'}. `;
        story += `It has evolved through ${churn.totalCommits} changes by ${authorCount} author${authorCount === 1 ? '' : 's'}. `;

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
        const log = await git.log({ file: relativePath, maxCount: 50 });

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
        if (!churn.authors || churn.authors.length === 0) return gaps;
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

        // 1. Birth - the oldest surviving line (blame lines are ordered by line number,
        // not age, so find the minimum date explicitly)
        if (lines.length > 0) {
            const firstLine = lines.reduce((oldest, l) =>
                (l.date && (!oldest.date || new Date(l.date).getTime() < new Date(oldest.date).getTime())) ? l : oldest, lines[0]);
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
            const authorsByPeriod: Record<string, Record<string, number>> = {};
            const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

            lines.forEach(l => {
                const period = new Date(l.date).getTime() > oneYearAgo.getTime() ? 'recent' : 'legacy';
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
                const dateCompare = new Date(a.date || now).getTime() - new Date(b.date || now).getTime();
                return dateCompare !== 0 ? dateCompare : (b.importance || 0) - (a.importance || 0);
            })
            .slice(0, 15); // Limit to top 15 milestones
    }

    /**
     * Elite: Generate Onboarding Recommendations
     * Provides expert contacts and related files for new developers
     */
    generateOnboardingRecommendations(analysis) {
        const { busFactor, coupledFiles = [], churn = {} } = analysis;

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

        // Related files from real co-change history. `frequency` is the share
        // of this file's recent commits that also touched the other file, so
        // the reason can state the actual evidence instead of a vague label.
        const relatedFiles = coupledFiles
            .slice(0, 5)
            .map(n => ({
                file: n.file,
                coupling: n.frequency,
                coChanges: n.count,
                reason: `Changed together in ${n.count} of this file's recent commits (${n.frequency}%)`
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
            // Real file coupling, not author proximity. The previous version
            // read author names here and reported them as downstream files,
            // then invented a second "(Sub-dependency)" row per author with a
            // strength of 0.6× the first — a fabricated depth-2 ripple.
            const coupled = await this.getCoupledFiles(repoPath, filePath);

            for (const neighbor of (coupled || []).slice(0, 5)) {
                ripples.push({
                    file: neighbor.file,
                    strength: neighbor.frequency,
                    coChanges: neighbor.count,
                    depth: 1,
                    reason: `Changed together in ${neighbor.count} of the last commits touching ${path.basename(filePath)} (${neighbor.frequency}%)`
                });
            }
        } catch (e) { console.error('Coupling ripple analysis failed:', e); }
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
                    const log = await git.log({ file: p, maxCount: 10 });
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

        // Phase 5: Incremental Analysis & Caching (per file, per HEAD)
        let cacheKey: string | null = null;
        if (context) {
            const head = (await git.revparse(['HEAD'])).trim();
            cacheKey = `vestige.cache.${relativePath}.${head}`;
            if (!force) {
                const cached = context.globalState.get(cacheKey);
                if (cached) {
                    try {
                        return this._reviveAnalysis(JSON.parse(cached));
                    } catch (e) {
                        // Corrupt cache entry — fall through to a fresh analysis
                    }
                }
            }
        }

        // Per-line authorship (blame), plus the commit timeline for summary data
        const blameOutput = await git.raw(['blame', '--line-porcelain', '--', relativePath]);
        const lines = this.parseBlame(blameOutput);
        const timeline = await this.getFileTimeline(repoPath, filePath);
        const churn = await this.calculateChurn(git, relativePath);

        const originality = this.calculateOriginalityIndex(lines);
        const interest = this.calculateInterestRate(churn.totalCommits, lines.length);
        const conflicts = await this.checkPredictiveConflicts(repoPath, filePath);
        // Two different things, kept distinct: which FILES change with this one,
        // and which PEOPLE commit alongside it.
        const coupledFiles = await this.getCoupledFiles(repoPath, filePath);
        const collaborators = await this.findFrequentCollaborators(repoPath, filePath);
        const shadows = await this.findRecentDeletions(repoPath, filePath);

        // Elite AI: Automated Lore Suite
        const implicitLore = await this.extractImplicitLore(git, relativePath);
        const shadowLore = await this.detectShadowLore(git, relativePath);
        const implicitFAQ = await this.extractImplicitFAQ(repoPath, filePath);
        const vendorPivots = await this.detectVendorPivots(git, repoPath);
        const emergingPatterns = await this.detectEmergingPatterns(repoPath, filePath);
        const allLore = [...implicitLore, ...shadowLore, ...implicitFAQ, ...vendorPivots, ...emergingPatterns];

        const ownership = this.calculateOwnership(lines);
        const currentUser = await this.getCurrentUser(repoPath);
        const changeRisk = this._riskFromLines(lines, currentUser);
        const stability = Math.max(0, 100 - churn.totalCommits);
        const heat = this.calculateOwnershipHeat({ churn, ownership });
        const isZenith = this.detectZenithState({ stability, originalityIndex: originality, churn });
        const safetyScore = this.calculateSafetyScore({ implicitLore: allLore, churn, interestRate: interest });
        const bio = this.generateNarrativeBiography({
            timeline, churn, originalityIndex: originality,
            stability,
            implicitLore: allLore
        });

        const result = {
            lines,
            timeline,
            churn,
            ownership,
            changeRisk,
            filePath,
            ageDays: churn.lastCommit ? Math.round((Date.now() - new Date(churn.lastCommit.date).getTime()) / (1000 * 60 * 60 * 24)) : 0,
            originalityIndex: originality,
            interestRate: interest,
            predictiveConflicts: conflicts,
            coupledFiles,
            frequentCollaborators: collaborators,
            narrativeBiography: bio,
            ownershipHeat: heat,
            deletedChunks: shadows,
            stability,
            implicitLore: allLore,
            repoPath,
            safetyScore,
            refactorROI: this.calculateRefactorROI({ interestRate: interest, churn, stability }),
            prRisk: this.predictRisk({ interestRate: interest, churn, stability }),
            fossilZones: this.identifyFossilZones(lines),
            knowledgeGaps: this.calculateKnowledgeGaps({ lines, churn }),
            isZenith,
            echoedReviews: await this.extractEchoedReviews(git, relativePath),
            onboardingTour: this.generateOnboardingTour({ lines, churn, implicitLore: allLore, epochs: [] }),
            onboardingRecommendations: this.generateOnboardingRecommendations({ busFactor: null, coupledFiles, churn }),
            debtInterest: this.calculateDetailedDebtInterest(lines, churn),
            archDrift: this.checkArchitecturalDrift({ emergingPatterns, churn }),
            reputation: this.calculateDeveloperReputation({ isZenith, ownership, originalityIndex: originality }),
            badges: this.generateEvolutionaryBadges({ isZenith, churn, originalityIndex: originality, safetyScore }),
            butterflyRipples: await this.predictButterflyRipples(repoPath, filePath)
        };

        if (context && cacheKey) {
            try {
                await context.globalState.update(cacheKey, JSON.stringify(result));
                await this._pruneAnalysisCache(context, cacheKey);
            } catch (e) {
                // Cache write is best-effort
            }
        }

        return result;
    }

    /** Re-hydrate Date fields lost to JSON serialization in the incremental cache. */
    _reviveAnalysis(analysis) {
        const revive = (arr) => {
            (arr || []).forEach(item => {
                if (item && item.date) item.date = new Date(item.date);
            });
        };
        revive(analysis.lines);
        revive(analysis.implicitLore);
        revive(analysis.onboardingTour);
        revive(analysis.echoedReviews);
        return analysis;
    }

    /** Keep the globalState analysis cache bounded (old HEADs would otherwise accumulate forever). */
    async _pruneAnalysisCache(context, newestKey) {
        const indexKey = 'vestige.cacheIndex';
        const index: string[] = (context.globalState.get(indexKey) || []).filter(k => k !== newestKey);
        index.push(newestKey);
        while (index.length > 100) {
            const oldest = index.shift();
            await context.globalState.update(oldest, undefined);
        }
        await context.globalState.update(indexKey, index);
    }

    /**
     * Elite: Calculate Ownership Heat
     */
    calculateOwnershipHeat(analysis) {
        const authors = (analysis.churn.authors || []).length;
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
            let hunkStartLine = 0;
            let inHunk = false;
            let deletedLines = [];

            // Attribute accumulated deletions to the hunk (and commit) they came from
            const flush = () => {
                if (deletedLines.length > 0) {
                    deletions.push({
                        line: hunkStartLine,
                        content: deletedLines.join('\n'),
                        author: currentAuthor,
                        hash: currentHash
                    });
                    deletedLines = [];
                }
            };

            for (const line of patchLines) {
                if (line.startsWith('commit ')) {
                    flush();
                    currentHash = line.substring(7);
                    inHunk = false;
                } else if (line.startsWith('Author: ')) {
                    currentAuthor = line.substring(8);
                } else if (line.startsWith('@@ ')) {
                    const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
                    if (match) {
                        flush();
                        hunkStartLine = parseInt(match[1]);
                        inHunk = true;
                    }
                } else if (inHunk && line.startsWith('-') && !line.startsWith('---')) {
                    deletedLines.push(line.substring(1));
                }
            }

            flush();
        } catch (e) {
            console.error('Ghost shadow detection failed', e);
        }
        return deletions;
    }
}

module.exports = GitAnalyzer;
