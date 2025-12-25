const simpleGit = require('simple-git');
const path = require('path');

class RepoAnalyzer {
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

                    // Get bus factor
                    const busFactor = await this.gitAnalyzer.calculateBusFactor(repoPath, filePath);
                    if (busFactor && busFactor.busFactor > 0) {
                        totalBusFactor += busFactor.busFactor;
                    }

                    // Calculate Debt for hotspots
                    const debt = await this.gitAnalyzer.calculateTechnicalDebt(repoPath, filePath);
                    if (debt) {
                        hotspots.push({
                            file: file,
                            debtScore: debt.score,
                            cost: debt.cost
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
            const avgBusFactor = totalBusFactor / validFiles;
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
