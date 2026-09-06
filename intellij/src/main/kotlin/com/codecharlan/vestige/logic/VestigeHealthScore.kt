package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile

/**
 * Code Health Score Dashboard — overall project health with actionable insights.
 *
 * Performance contract (this class was a major freeze contributor and was
 * rewritten): the original computed eight categories independently, each
 * looping over its own 20–50 file sample and issuing fresh git calls, so a
 * single dashboard load cost roughly 250 git invocations plus ~70 whole-project
 * similarity scans — with no cancellation checks.
 *
 * This version samples once, collects every per-file signal in a single pass
 * (one `getFileStats` and one `calculateBusFactor` per sampled file), derives
 * all eight categories from that dataset, and polls for cancellation so the
 * user can always abort. Duplication now comes from the similarity index's
 * aggregate rather than per-file scans.
 */
@Service(Service.Level.PROJECT)
class VestigeHealthScore(private val project: Project) {

    data class HealthScore(
        val overall: Double,
        val categories: Map<Category, Double>,
        val trends: Map<Category, Trend>,
        val insights: List<Insight>,
        val recommendations: List<String>,
        /** How many files the score is based on — shown so the number is honest. */
        val filesSampled: Int = 0,
        val totalCodeFiles: Int = 0
    )

    enum class Category {
        MAINTAINABILITY,
        TESTABILITY,
        COMPLEXITY,
        DOCUMENTATION,
        COUPLING,
        DUPLICATION,
        STABILITY,
        TEAM_KNOWLEDGE
    }

    enum class Trend { IMPROVING, STABLE, DECLINING }

    data class Insight(
        val category: Category,
        val message: String,
        val severity: String,
        val actionable: Boolean
    )

    /** Everything we need about one file, gathered in a single visit. */
    private data class FileSignals(
        val commits: Int,
        val ageDays: Int,
        val busFactor: Int,
        val coupledCount: Int,
        val totalLines: Int,
        val docLines: Int,
        val complexity: Int,
        val looksLikeTest: Boolean,
        val hasAssertions: Boolean
    )

    private companion object {
        /** Files visited per health calculation. Each visit costs git calls. */
        private const val SAMPLE_SIZE = 40

        /** Coupling is the most expensive signal, so it gets a smaller sample. */
        private const val COUPLING_SAMPLE = 15

        private const val MAX_FILE_BYTES = 1L * 1024 * 1024
        private const val MAX_FILE_SCAN = 4_000

        private val CODE_EXTENSIONS = setOf(
            "kt", "java", "js", "ts", "tsx", "jsx", "py", "go", "rs", "cpp", "c", "h", "hpp"
        )
        private val SKIP_DIRS = setOf(
            "node_modules", "build", "out", "dist", "target", "vendor", "__pycache__", ".gradle"
        )
    }

    private val log = Logger.getInstance(VestigeHealthScore::class.java)

    fun calculateHealthScore(): HealthScore {
        val allFiles = collectCodeFiles()
        if (allFiles.isEmpty()) {
            return HealthScore(
                overall = 0.0,
                categories = emptyMap(),
                trends = emptyMap(),
                insights = emptyList(),
                recommendations = listOf("No code files found in project")
            )
        }

        val sample = deterministicSample(allFiles, SAMPLE_SIZE)
        val signals = gatherSignals(sample)

        if (signals.isEmpty()) {
            return HealthScore(
                overall = 0.0,
                categories = emptyMap(),
                trends = emptyMap(),
                insights = emptyList(),
                recommendations = listOf("No git-tracked code files could be analyzed"),
                totalCodeFiles = allFiles.size
            )
        }

        val categories = mutableMapOf<Category, Double>()
        categories[Category.MAINTAINABILITY] = scoreMaintainability(signals)
        categories[Category.TESTABILITY] = scoreTestability(signals)
        categories[Category.COMPLEXITY] = scoreComplexity(signals)
        categories[Category.DOCUMENTATION] = scoreDocumentation(signals)
        categories[Category.COUPLING] = scoreCoupling(signals)
        categories[Category.DUPLICATION] = scoreDuplication()
        categories[Category.STABILITY] = scoreStability(signals)
        categories[Category.TEAM_KNOWLEDGE] = scoreTeamKnowledge(signals)

        val insights = buildInsights(categories)
        val overall = categories.values.average()
        val trends = categories.mapValues { Trend.STABLE }

        return HealthScore(
            overall = overall,
            categories = categories,
            trends = trends,
            insights = insights,
            recommendations = buildRecommendations(categories),
            filesSampled = signals.size,
            totalCodeFiles = allFiles.size
        )
    }

    /**
     * Single pass: one git-stats call and (for a subset) one bus-factor and one
     * coupling call per file, plus one text read reused by every content metric.
     */
    private fun gatherSignals(sample: List<VirtualFile>): List<FileSignals> {
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        val results = mutableListOf<FileSignals>()

        sample.forEachIndexed { index, file ->
            ProgressManager.checkCanceled()
            try {
                val stats = gitAnalyzer.getFileStats(file) ?: return@forEachIndexed
                val lines = readLines(file) ?: emptyList()

                val docLines = lines.count {
                    val t = it.trim()
                    t.startsWith("//") || t.startsWith("/*") || t.startsWith("*") || t.startsWith("#")
                }
                val complexity = lines.count { line ->
                    val t = line.trim()
                    t.startsWith("if") || t.startsWith("for") || t.startsWith("while") ||
                        t.startsWith("when") || t.startsWith("case") || t.startsWith("catch") ||
                        t.contains("&&") || t.contains("||")
                }
                val nameLooksLikeTest = file.name.contains("test", ignoreCase = true) ||
                    file.name.contains("spec", ignoreCase = true)
                val hasAssertions = lines.any {
                    it.contains("assert") || it.contains("expect(") || it.contains(".should")
                }

                // Bus factor is a blame-class operation; only the first
                // COUPLING_SAMPLE files pay for coupling on top of it.
                val busFactor = gitAnalyzer.calculateBusFactor(file).busFactor
                val coupled = if (index < COUPLING_SAMPLE) {
                    gitAnalyzer.getCoupledFiles(file).size
                } else {
                    -1 // not measured for this file
                }

                results.add(
                    FileSignals(
                        commits = stats.commits,
                        ageDays = stats.ageDays,
                        busFactor = busFactor,
                        coupledCount = coupled,
                        totalLines = lines.size,
                        docLines = docLines,
                        complexity = complexity,
                        looksLikeTest = nameLooksLikeTest,
                        hasAssertions = hasAssertions
                    )
                )
            } catch (e: com.intellij.openapi.progress.ProcessCanceledException) {
                throw e
            } catch (e: Exception) {
                log.debug("Skipping ${file.name} in health scoring", e)
            }
        }
        return results
    }

    private fun scoreMaintainability(signals: List<FileSignals>): Double = signals.map {
        when {
            it.commits > 50 -> 0.3
            it.complexity > 40 -> 0.5
            it.ageDays > 365 && it.commits < 5 -> 0.7
            else -> 0.9
        }
    }.average()

    private fun scoreTestability(signals: List<FileSignals>): Double {
        // Ratio of test files is the honest signal here; a file "containing the
        // word test" told us nothing, which is what the original measured.
        val testFiles = signals.count { it.looksLikeTest }
        val withAssertions = signals.count { it.hasAssertions }
        val ratio = testFiles.toDouble() / signals.size
        val assertionBonus = if (withAssertions > 0) 0.1 else 0.0
        return (ratio * 2.5 + assertionBonus).coerceIn(0.1, 1.0)
    }

    private fun scoreComplexity(signals: List<FileSignals>): Double = signals.map {
        val density = if (it.totalLines > 0) it.complexity.toDouble() / it.totalLines else 0.0
        when {
            density > 0.25 -> 0.2
            density > 0.15 -> 0.5
            density > 0.08 -> 0.7
            else -> 0.9
        }
    }.average()

    private fun scoreDocumentation(signals: List<FileSignals>): Double = signals.map {
        val ratio = if (it.totalLines > 0) it.docLines.toDouble() / it.totalLines else 0.0
        when {
            ratio > 0.20 -> 0.9
            ratio > 0.10 -> 0.7
            ratio > 0.05 -> 0.5
            else -> 0.3
        }
    }.average()

    private fun scoreCoupling(signals: List<FileSignals>): Double {
        val measured = signals.filter { it.coupledCount >= 0 }
        if (measured.isEmpty()) return 0.5
        return measured.map {
            when {
                it.coupledCount > 10 -> 0.3
                it.coupledCount > 5 -> 0.5
                it.coupledCount > 2 -> 0.7
                else -> 0.9
            }
        }.average()
    }

    private fun scoreDuplication(): Double {
        return try {
            val ratio = project.getService(VestigeSimilarityRadar::class.java).duplicateWindowRatio()
            when {
                ratio > 0.25 -> 0.3
                ratio > 0.12 -> 0.5
                ratio > 0.04 -> 0.7
                else -> 0.9
            }
        } catch (e: com.intellij.openapi.progress.ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            log.debug("Duplication scoring unavailable", e)
            0.5
        }
    }

    private fun scoreStability(signals: List<FileSignals>): Double = signals.map {
        val commitsPerDay = it.commits.toDouble() / maxOf(1, it.ageDays)
        when {
            commitsPerDay > 0.5 -> 0.3
            commitsPerDay > 0.2 -> 0.5
            commitsPerDay > 0.1 -> 0.7
            else -> 0.9
        }
    }.average()

    private fun scoreTeamKnowledge(signals: List<FileSignals>): Double = signals.map {
        when {
            it.busFactor <= 1 -> 0.2
            it.busFactor <= 2 -> 0.4
            it.busFactor <= 3 -> 0.6
            else -> 0.9
        }
    }.average()

    private fun buildInsights(categories: Map<Category, Double>): List<Insight> {
        val insights = mutableListOf<Insight>()
        categories.forEach { (category, score) ->
            val label = category.name.lowercase().replace('_', ' ')
            when {
                score < 0.4 -> insights.add(
                    Insight(category, "$label needs attention (${(score * 100).toInt()}%)", "CRITICAL", true)
                )
                score < 0.6 -> insights.add(
                    Insight(category, "$label could be improved (${(score * 100).toInt()}%)", "MEDIUM", true)
                )
            }
        }
        return insights
    }

    private fun buildRecommendations(categories: Map<Category, Double>): List<String> {
        val recommendations = mutableListOf<String>()
        if ((categories[Category.DUPLICATION] ?: 1.0) < 0.6) {
            recommendations.add("Extract repeated blocks — duplicated code was detected across multiple files")
        }
        if ((categories[Category.DOCUMENTATION] ?: 1.0) < 0.6) {
            recommendations.add("Document the least-commented files to speed up onboarding")
        }
        if ((categories[Category.COUPLING] ?: 1.0) < 0.6) {
            recommendations.add("Several files change together frequently — consider clarifying module boundaries")
        }
        if ((categories[Category.TEAM_KNOWLEDGE] ?: 1.0) < 0.6) {
            recommendations.add("Single-owner files carry knowledge risk — pair or review across them")
        }
        if ((categories[Category.STABILITY] ?: 1.0) < 0.6) {
            recommendations.add("High-churn files are worth stabilising with tests before further change")
        }
        if (recommendations.isEmpty()) {
            recommendations.add("No structural risks stood out in this sample")
        }
        return recommendations
    }

    /**
     * Stable sample so the score doesn't jitter between reloads on an unchanged
     * repository (the original re-randomised on every run).
     */
    private fun deterministicSample(files: List<VirtualFile>, size: Int): List<VirtualFile> {
        if (files.size <= size) return files
        val sorted = files.sortedBy { it.path }
        val step = sorted.size.toDouble() / size
        return (0 until size).map { sorted[(it * step).toInt().coerceAtMost(sorted.size - 1)] }
    }

    private fun readLines(file: VirtualFile): List<String>? {
        if (file.length > MAX_FILE_BYTES) return null
        return try {
            // Only already-open files go through the Document (so unsaved edits
            // count); everything else is read straight from the VFS, which
            // avoids materialising a Document per project file.
            val cached = com.intellij.openapi.application.ReadAction.compute<com.intellij.openapi.editor.Document?, RuntimeException> {
                FileDocumentManager.getInstance().getCachedDocument(file)
            }
            val text = if (cached != null) {
                com.intellij.openapi.application.ReadAction.compute<String, RuntimeException> { cached.text }
            } else {
                VfsUtilCore.loadText(file)
            }
            text.lineSequence().take(MAX_FILE_SCAN).toList()
        } catch (e: com.intellij.openapi.progress.ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    private fun collectCodeFiles(): List<VirtualFile> {
        val basePath = project.basePath ?: return emptyList()
        val baseDir = VfsUtilCore.findRelativeFile(basePath, null) ?: return emptyList()

        val files = mutableListOf<VirtualFile>()
        val stack = ArrayDeque<VirtualFile>()
        stack.addLast(baseDir)

        while (stack.isNotEmpty() && files.size < 20_000) {
            ProgressManager.checkCanceled()
            val dir = stack.removeLast()
            val children = try { dir.children } catch (e: Exception) { continue } ?: continue
            for (child in children) {
                if (child.isDirectory) {
                    if (!child.name.startsWith(".") && child.name !in SKIP_DIRS) stack.addLast(child)
                } else if (child.extension?.lowercase() in CODE_EXTENSIONS) {
                    files.add(child)
                }
            }
        }
        return files
    }
}
