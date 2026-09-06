export {};
const simpleGit = require('simple-git');
const path = require('path');

class RepoAnalyzer { [key: string]: any;
    constructor(gitAnalyzer) {
        this.gitAnalyzer = gitAnalyzer;
    }

    async calculateRepoHealth(repoPath) {
        try {
            const git = simpleGit(repoPath);

            // Get all tracked files
            const files = await git.raw(['ls-files']);
            const fileList = files.split('\n').filter(f => f.trim());

            if (fileList.length === 0) {
                return { score: 0, metrics: {} };
            }

            // Sample up to 50 files for performance
            const sampleSize = Math.min(50, fileList.length);
            const sampledFiles = this.sampleArray(fileList, sampleSize);

            let totalBusFactor = 0;
            let busFactorSamples = 0;
            let fossilCount = 0;
            let highChurnCount = 0;
            let validFiles = 0;
            let hotspots = [];

            for (const file of sampledFiles) {
                const filePath = path.join(repoPath, file);

                try {
                    // Get file stats
                    const stats = await this.gitAnalyzer.getFileStats(repoPath, filePath);
                    if (!stats) continue;

                    validFiles++;

                    // Check if fossil (>1 year)
                    if (stats.ageDays > 365) {
                        fossilCount++;
                    }

                    // Check if high churn (>10 commits)
                    if (stats.commits > 10) {
                        highChurnCount++;
                    }

                    // Get bus factor (only count files that produced a real value,
                    // otherwise zero-results drag the average down artificially)
                    const busFactor = await this.gitAnalyzer.calculateBusFactor(repoPath, filePath);
                    if (busFactor && busFactor.busFactor > 0) {
                        totalBusFactor += busFactor.busFactor;
                        busFactorSamples++;
                    }

                    // Calculate Debt for hotspots
                    const debt = await this.gitAnalyzer.calculateTechnicalDebt(repoPath, filePath);
                    if (debt) {
                        // Only the relative score and its visible inputs. The
                        // dollar figure `calculateTechnicalDebt` also returns is
                        // an invented number (score × an arbitrary hourly rate)
                        // and is deliberately not propagated to the UI.
                        hotspots.push({
                            file: file,
                            debtScore: debt.score,
                            churn: debt.churn
                        });
                    }
                } catch (e) {
                    // Skip files that can't be analyzed
                    continue;
                }
            }

            // Pick Top 5 hotspots
            hotspots.sort((a, b) => b.debtScore - a.debtScore);
            const topHotspots = hotspots.slice(0, 5);

            if (validFiles === 0) {
                return { score: 5, metrics: { error: 'No analyzable files' } };
            }

            // Calculate metrics
            const avgBusFactor = busFactorSamples > 0 ? totalBusFactor / busFactorSamples : 0;
            const fossilPercent = (fossilCount / validFiles) * 100;
            const churnPercent = (highChurnCount / validFiles) * 100;

            // Calculate health score (0-10)
            let score = 10;

            // Penalize low bus factor (worse if <2)
            if (avgBusFactor < 2) score -= 3;
            else if (avgBusFactor < 3) score -= 1;

            // Penalize high fossil rate (>50%)
            if (fossilPercent > 50) score -= 2;
            else if (fossilPercent > 30) score -= 1;

            // Penalize high churn (>30%)
            if (churnPercent > 30) score -= 2;
            else if (churnPercent > 20) score -= 1;

            score = Math.max(0, Math.min(10, score));

            return {
                score: Math.round(score),
                metrics: {
                    avgBusFactor: avgBusFactor.toFixed(1),
                    fossilPercent: Math.round(fossilPercent),
                    churnPercent: Math.round(churnPercent),
                    filesAnalyzed: validFiles,
                    hotspots: topHotspots
                }
            };
        } catch (error) {
            console.error('Repo health calculation failed:', error);
            return { score: 0, metrics: { error: error.message } };
        }
    }

    /**
     * Lightweight whole-repo scan for visualizations (Pulse panel).
     * One `git log --numstat` pass instead of per-file git calls.
     * Returns { files: [{ path, lines, maxAge, churn }] }.
     */
    async analyzeAllFiles(repoPath) {
        try {
            const git = simpleGit(repoPath);

            const output = await git.raw([
                'log', '--numstat', '--no-renames', '--pretty=format:COMMIT:%at',
                '--max-count=500'
            ]);

            const now = Math.floor(Date.now() / 1000);
            const fileStats = new Map<string, { churn: number; lines: number; lastTouched: number }>();
            let currentTimestamp = now;

            for (const line of output.split('\n')) {
                if (line.startsWith('COMMIT:')) {
                    currentTimestamp = parseInt(line.substring(7)) || now;
                    continue;
                }
                // numstat rows: "<added>\t<deleted>\t<path>"
                const parts = line.split('\t');
                if (parts.length !== 3) continue;
                const added = parseInt(parts[0]) || 0;
                const deleted = parseInt(parts[1]) || 0;
                const file = parts[2];

                const entry = fileStats.get(file) || { churn: 0, lines: 0, lastTouched: currentTimestamp };
                entry.churn++;
                entry.lines += added - deleted;
                // log is newest-first, so the first time we see a file is its latest touch
                if (!fileStats.has(file)) entry.lastTouched = currentTimestamp;
                fileStats.set(file, entry);
            }

            const files = Array.from(fileStats.entries())
                .filter(([, s]) => s.lines > 0)
                .map(([file, s]) => ({
                    path: file,
                    lines: Math.max(1, s.lines),
                    maxAge: Math.round((now - s.lastTouched) / (60 * 60 * 24)),
                    churn: s.churn
                }))
                .sort((a, b) => b.churn - a.churn)
                .slice(0, 100);

            return { files };
        } catch (error) {
            console.error('analyzeAllFiles failed:', error);
            return { files: [] };
        }
    }

    sampleArray(array, size) {
        const shuffled = array.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, size);
    }
}

module.exports = RepoAnalyzer;
