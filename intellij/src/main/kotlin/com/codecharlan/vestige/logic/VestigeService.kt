package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.progress.ProgressManager
import com.intellij.util.Alarm
import com.intellij.util.concurrency.AppExecutorUtil
import java.util.Collections
import java.util.LinkedHashMap
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.math.max
import kotlin.math.min

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer

@Service(Service.Level.PROJECT)
class VestigeService(private val project: Project) : Disposable {
    // MAX_ENTRIES: make it configurable in future via properties
    private val maxCacheSize = PropertiesComponent.getInstance().getInt("com.codecharlan.vestige.maxCacheSize", 500)
    private val analysisCache = createLinkedHashMap<String, AnalysisResult>(maxCacheSize)
    var isEnabled: Boolean = true

    // Track file modification times for real-time analysis
    private val fileModificationTimes = createLinkedHashMap<String, Long>(1000)

    override fun dispose() {
        analysisCache.clear()
        fileModificationTimes.clear()
        pendingFiles.clear()
        refreshAlarm.cancelAllRequests()
        // Bounded executors from AppExecutorUtil must be shut down when their owner is disposed.
        analysisExecutor.shutdownNow()
    }

    companion object {
        /** Wide enough that a burst of analyses collapses into one repaint. */
        private const val PROJECT_VIEW_REFRESH_DELAY_MS = 2_000

        private fun <K, V> createLinkedHashMap(maxEntries: Int): MutableMap<K, V> {
            // Insertion-order, not access-order: an access-order LinkedHashMap
            // treats `get` as a structural modification, so every EDT cache
            // read contended on the same monitor as the background writers.
            return Collections.synchronizedMap(object : LinkedHashMap<K, V>(maxEntries, 0.75f, false) {
                override fun removeEldestEntry(eldest: Map.Entry<K, V>?): Boolean {
                    return size > maxEntries
                }
            })
        }
    }
    
    // Threading optimization: Bounded executor and pending task tracking
    private val analysisExecutor = AppExecutorUtil.createBoundedApplicationPoolExecutor("VestigeAnalysis", 3)
    private val pendingFiles = ConcurrentHashMap.newKeySet<String>()
    private val refreshAlarm = Alarm(Alarm.ThreadToUse.SWING_THREAD, project)
    private val refreshPending = java.util.concurrent.atomic.AtomicBoolean(false)

    data class AnalysisResult(
        val stats: VestigeGitAnalyzer.FileStats?,
        val busFactor: VestigeGitAnalyzer.BusFactorInfo?,
        val debt: Double,
        val stability: Int,
        val onboardingTour: List<VestigeGitAnalyzer.OnboardingMilestone>? = null,
        val onboardingRecommendations: VestigeGitAnalyzer.OnboardingRecommendations? = null,
        val onboardingNarrative: String? = null,
        val timestamp: Long = System.currentTimeMillis(),
        /** Stamp of the file this result was computed from; drives cache validity. */
        val modificationStamp: Long = -1,
        // New: Real-time analysis that works without git
        val realTimeStats: RealTimeStats? = null
    )
    
    /**
     * Real-time file statistics that work without git commits
     */
    data class RealTimeStats(
        val lineCount: Int,
        val complexity: Int,
        val fileSize: Long,
        val lastModified: Long,
        val hasGitHistory: Boolean,
        val isNewFile: Boolean,
        val estimatedAge: String, // "Just created", "Recently modified", etc.
        val codeHealth: String // "Healthy", "Needs attention", etc.
    )

    interface AnalysisListener {
        fun onAnalysisUpdated(file: VirtualFile, result: AnalysisResult)
    }
    
    private val listeners = CopyOnWriteArrayList<AnalysisListener>()
    fun addListener(listener: AnalysisListener) = listeners.add(listener)
    fun removeListener(listener: AnalysisListener) = listeners.remove(listener)

    fun analyzeFile(file: VirtualFile, force: Boolean = false): AnalysisResult? {
        val cached = getCachedAnalysis(file)

        // Freshness is judged by the file's modification stamp, not by wall
        // clock. A time-based TTL meant any repeating UI timer re-triggered a
        // full analysis the moment the TTL lapsed — a periodic freeze on an
        // idle IDE, forever.
        if (!force && cached != null && cached.modificationStamp == file.modificationStamp) {
            return cached
        }

        // Always compute asynchronously (never on the caller's thread); a force simply
        // bypasses the cache-freshness check above. Listeners are notified when done.
        analyzeFileAsync(file)
        return cached // Return stale but immediate result (may be null)
    }

    /** Cache-only lookup for EDT callers (decorators, status bar, line markers). */
    fun getCachedAnalysisOnly(file: VirtualFile): AnalysisResult? = getCachedAnalysis(file)

    fun analyzeFileAsync(file: VirtualFile) {
        if (!isEnabled || !pendingFiles.add(file.path)) return
        
        ReadAction.nonBlocking<AnalysisResult?> {
            try {
                computeAnalysisSync(file)
            } finally {
                pendingFiles.remove(file.path)
            }
        }
        .inSmartMode(project)
        .expireWith(project)
        .coalesceBy(this, file)
        .finishOnUiThread(ModalityState.any()) { result ->
            if (result != null) {
                listeners.forEach { it.onAnalysisUpdated(file, result) }
                scheduleProjectViewRefresh()
            }
        }
        .submit(analysisExecutor)
    }

    /**
     * Coalesced project-view refresh.
     *
     * This used to run every 500ms after any analysis. Combined with a
     * decorator that kicked off analysis for uncached files, it formed a loop:
     * refresh -> decorate -> analyze -> refresh. Once the LRU started evicting,
     * the loop could not terminate. The decorator no longer schedules analysis,
     * and this window is much wider.
     */
    private fun scheduleProjectViewRefresh() {
        if (!refreshPending.compareAndSet(false, true)) return
        refreshAlarm.cancelAllRequests()
        refreshAlarm.addRequest({
            refreshPending.set(false)
            if (!project.isDisposed) {
                com.intellij.ide.projectView.ProjectView.getInstance(project).refresh()
            }
        }, PROJECT_VIEW_REFRESH_DELAY_MS)
    }

    private fun computeAnalysisSync(file: VirtualFile): AnalysisResult? {
        // Captured up front: the result is only a valid cache entry for the
        // version of the file it was actually computed from.
        val stamp = file.modificationStamp
        val realTimeStats = computeRealTimeStats(file)
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)

        // NOTE on the `catch` blocks below: ProcessCanceledException must be
        // rethrown, never swallowed. Swallowing it makes this work
        // uncancellable, which is what let a single analysis hold the read lock
        // (and therefore block keystrokes) for its full duration.
        val stats = runCancellable { analyzer.analyzeFile(file) }

        if (stats == null) {
            val result = AnalysisResult(
                stats = null,
                busFactor = null,
                debt = calculateDebtFromContent(realTimeStats),
                stability = calculateStabilityFromContent(realTimeStats),
                modificationStamp = stamp,
                realTimeStats = realTimeStats
            )
            analysisCache[file.path] = result
            return result
        }

        ProgressManager.checkCanceled()
        val busFactor = runCancellable { analyzer.calculateBusFactor(file) }
        ProgressManager.checkCanceled()
        val debt = runCancellable { analyzer.calculateTechnicalDebt(file) } ?: 0.0
        val stability = maxOf(0, 100 - (stats.commits * 2))

        ProgressManager.checkCanceled()
        val tour = runCancellable { analyzer.generateOnboardingTour(file) }
        ProgressManager.checkCanceled()
        val recommendations = runCancellable { analyzer.generateOnboardingRecommendations(file) }
        val narrative = buildString {
            append("The history of ${file.name} is a journey through ${stats.commits} iterations. ")
            if (busFactor != null && (busFactor.risk == "critical" || busFactor.risk == "high")) {
                append("Caution: High knowledge concentration detected. ")
            }
            if (debt > 10) {
                append("Architectural artifacts suggest accumulating technical entropy. ")
            }
            append("An expert archeologist would focus on the ${tour?.firstOrNull()?.type ?: "core"} milestones.")
        }
        
        val result = AnalysisResult(
            stats,
            busFactor,
            debt,
            stability,
            onboardingTour = tour,
            onboardingRecommendations = recommendations,
            onboardingNarrative = narrative,
            modificationStamp = stamp,
            realTimeStats = realTimeStats
        )
        analysisCache[file.path] = result
        return result
    }

    /**
     * Run a git operation, tolerating failure but never hiding cancellation.
     */
    private inline fun <T> runCancellable(block: () -> T): T? = try {
        block()
    } catch (e: ProcessCanceledException) {
        throw e
    } catch (e: Exception) {
        null
    }
    
    /**
     * Compute real-time statistics from file content (no git required)
     */
    private fun computeRealTimeStats(file: VirtualFile): RealTimeStats {
        // Document access must happen under a read action (this is reentrant, so it is
        // also safe when we are already inside ReadAction.nonBlocking).
        val (lineCount, complexity) = ReadAction.compute<Pair<Int, Int>, RuntimeException> {
            val document = FileDocumentManager.getInstance().getDocument(file)
            Pair(document?.lineCount ?: 0, calculateComplexity(document))
        }
        val fileSize = file.length
        val lastModified = file.modificationStamp
        
        // Check if file has git history
        val hasGitHistory = try {
            val analyzer = project.getService(VestigeGitAnalyzer::class.java)
            analyzer.getFileStats(file) != null
        } catch (e: Exception) {
            false
        }
        
        val isNewFile = !hasGitHistory
        
        // Estimate age based on modification time
        val previousModTime = fileModificationTimes[file.path] ?: 0L
        val estimatedAge = when {
            isNewFile -> "Just created"
            previousModTime == 0L -> "Recently modified"
            System.currentTimeMillis() - previousModTime < 3600000 -> "Modified < 1h ago"
            System.currentTimeMillis() - previousModTime < 86400000 -> "Modified today"
            else -> "Modified recently"
        }
        
        fileModificationTimes[file.path] = System.currentTimeMillis()
        
        // Code health heuristic
        val codeHealth = when {
            lineCount == 0 -> "Empty"
            lineCount < 50 -> "Healthy"
            lineCount < 200 -> "Moderate"
            complexity > 50 -> "Needs attention"
            else -> "Healthy"
        }
        
        return RealTimeStats(
            lineCount = lineCount,
            complexity = complexity,
            fileSize = fileSize,
            lastModified = lastModified,
            hasGitHistory = hasGitHistory,
            isNewFile = isNewFile,
            estimatedAge = estimatedAge,
            codeHealth = codeHealth
        )
    }
    
    /**
     * Simple complexity calculation from document content
     */
    private fun calculateComplexity(document: com.intellij.openapi.editor.Document?): Int {
        if (document == null) return 0
        
        var complexity = 0
        var maxIndent = 0
        
        for (i in 0 until document.lineCount) {
            val start = document.getLineStartOffset(i)
            val end = document.getLineEndOffset(i)
            val line = document.getText(com.intellij.openapi.util.TextRange(start, end))
            val indent = line.takeWhile { it == ' ' || it == '\t' }.length
            maxIndent = max(maxIndent, indent)
            
            // Count control flow keywords (simple heuristic)
            val keywords = listOf("if", "else", "for", "while", "switch", "case", "try", "catch", "finally")
            keywords.forEach { keyword ->
                if (line.contains(keyword, ignoreCase = true)) {
                    complexity++
                }
            }
        }
        
        return complexity + (maxIndent / 4) // Add nesting depth
    }
    
    /**
     * Calculate technical debt from file content (no git required)
     */
    private fun calculateDebtFromContent(stats: RealTimeStats): Double {
        val lineFactor = stats.lineCount / 100.0
        val complexityFactor = stats.complexity / 10.0
        return lineFactor * complexityFactor * 0.5
    }
    
    /**
     * Calculate stability from content (no git required)
     */
    private fun calculateStabilityFromContent(stats: RealTimeStats): Int {
        return when {
            stats.lineCount < 50 -> 100
            stats.lineCount < 200 -> 80
            stats.complexity < 20 -> 70
            else -> 50
        }
    }

    fun getCachedAnalysis(file: VirtualFile): AnalysisResult? = analysisCache[file.path]
    
    /**
     * Get quick stats for status bar (always works, even without git)
     */
    fun getQuickStats(file: VirtualFile): String {
        val result = analyzeFile(file) ?: return "🗿 Vestige: Ready"
        val realTime = result.realTimeStats
        
        return when {
            realTime != null && realTime.isNewFile -> "✨ New file: ${realTime.lineCount} lines"
            result.stats != null -> "🗿 ${result.stats.commits} commits | ${result.stability}% stable"
            realTime != null -> "📝 ${realTime.lineCount} lines | ${realTime.codeHealth}"
            else -> "🗿 Vestige: Ready"
        }
    }
}
