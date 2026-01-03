package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.ReadAction
import com.intellij.util.Alarm
import com.intellij.util.concurrency.AppExecutorUtil
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.max
import kotlin.math.min

@Service(Service.Level.PROJECT)
class VestigeService(private val project: Project) {
    private val analysisCache = ConcurrentHashMap<String, AnalysisResult>()
    var isEnabled: Boolean = true
    private val props = PropertiesComponent.getInstance()
    
    // Track file modification times for real-time analysis
    private val fileModificationTimes = ConcurrentHashMap<String, Long>()
    
    // Threading optimization: Bounded executor and pending task tracking
    private val analysisExecutor = AppExecutorUtil.createBoundedApplicationPoolExecutor("VestigeAnalysis", 3)
    private val pendingFiles = ConcurrentHashMap.newKeySet<String>()
    private val refreshAlarm = Alarm(Alarm.ThreadToUse.SWING_THREAD, project)

    data class AnalysisResult(
        val stats: VestigeGitAnalyzer.FileStats?,
        val busFactor: VestigeGitAnalyzer.BusFactorInfo?,
        val debt: Double,
        val stability: Int,
        val onboardingTour: List<VestigeGitAnalyzer.OnboardingMilestone>? = null,
        val onboardingRecommendations: VestigeGitAnalyzer.OnboardingRecommendations? = null,
        val onboardingNarrative: String? = null,
        val timestamp: Long = System.currentTimeMillis(),
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
    
    private val listeners = mutableListOf<AnalysisListener>()
    fun addListener(listener: AnalysisListener) = listeners.add(listener)

    fun analyzeFile(file: VirtualFile, force: Boolean = false): AnalysisResult? {
        // Synchronous fast-path for cached results
        val cached = getCachedAnalysis(file)
        if (!force && cached != null && cached.timestamp > System.currentTimeMillis() - 60000) {
            return cached
        }
        
        // Trigger async update if not forced (to keep UI responsive)
        if (!force) {
            analyzeFileAsync(file)
            return cached // Return stale but immediate result
        }
        
        return computeAnalysisSync(file)
    }

    fun analyzeFileAsync(file: VirtualFile) {
        if (!isEnabled || !pendingFiles.add(file.path)) return
        
        ReadAction.nonBlocking<AnalysisResult?> {
            try {
                computeAnalysisSync(file)
            } finally {
                pendingFiles.remove(file.path)
            }
        }
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

    private fun scheduleProjectViewRefresh() {
        refreshAlarm.cancelAllRequests()
        refreshAlarm.addRequest({
            if (!project.isDisposed) {
                com.intellij.ide.projectView.ProjectView.getInstance(project).refresh()
            }
        }, 500) // Throttle refresh to every 500ms
    }

    private fun computeAnalysisSync(file: VirtualFile): AnalysisResult? {
        val lastModified = file.modificationStamp
        val cacheKey = "vestige.cache.${file.path}"
        
        val realTimeStats = computeRealTimeStats(file)
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)
        val stats = try { analyzer.analyzeFile(file) } catch (e: Exception) { null }
        
        if (stats == null) {
            val result = AnalysisResult(
                stats = null,
                busFactor = null,
                debt = calculateDebtFromContent(realTimeStats),
                stability = calculateStabilityFromContent(realTimeStats),
                realTimeStats = realTimeStats
            )
            analysisCache[file.path] = result
            return result
        }
        
        val busFactor = try { analyzer.calculateBusFactor(file) } catch (e: Exception) { null }
        val debt = try { analyzer.calculateTechnicalDebt(file) } catch (e: Exception) { 0.0 }
        val stability = maxOf(0, 100 - (stats.commits * 2))
        
        val result = AnalysisResult(
            stats, 
            busFactor, 
            debt, 
            stability,
            realTimeStats = realTimeStats
        )
        analysisCache[file.path] = result
        props.setValue(cacheKey, lastModified.toString())
        return result
    }
    
    /**
     * Compute real-time statistics from file content (no git required)
     */
    private fun computeRealTimeStats(file: VirtualFile): RealTimeStats {
        val document = FileDocumentManager.getInstance().getDocument(file)
        val lineCount = document?.lineCount ?: 0
        val fileSize = file.length
        val lastModified = file.modificationStamp
        
        // Calculate complexity (simple heuristic: lines + nesting)
        val complexity = calculateComplexity(document)
        
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
