package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ide.util.PropertiesComponent
import java.util.concurrent.ConcurrentHashMap

@Service(Service.Level.PROJECT)
class VestigeService(private val project: Project) {
    private val analysisCache = ConcurrentHashMap<String, AnalysisResult>()
    var isEnabled: Boolean = true
    private val cache = mutableMapOf<String, String>() // This line is not used in the provided snippet, but added as per instruction.
    private val props = PropertiesComponent.getInstance()

    data class AnalysisResult(
        val stats: VestigeGitAnalyzer.FileStats?,
        val busFactor: VestigeGitAnalyzer.BusFactorInfo?,
        val debt: Double,
        val stability: Int,
        val onboardingTour: List<VestigeGitAnalyzer.OnboardingMilestone>? = null,
        val onboardingRecommendations: VestigeGitAnalyzer.OnboardingRecommendations? = null,
        val onboardingNarrative: String? = null,
        val timestamp: Long = System.currentTimeMillis()
    )

    fun analyzeFile(file: VirtualFile, force: Boolean = false): AnalysisResult? {
        if (!isEnabled && !force) return null
        
        val lastModified = file.modificationStamp
        val cacheKey = "vestige.cache.${file.path}"
        val cachedStamp = props.getLong(cacheKey, -1)

        if (!force && cachedStamp == lastModified) {
            println("Vestige: Using incremental cache for ${file.name}")
            return analysisCache[file.path] // Return cached result if available and up-to-date
        }

        // Perform analysis...
        println("Vestige: Analyzing ${file.name}...")
        
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)
        val stats = analyzer.getFileStats(file) ?: return null
        val busFactor = analyzer.calculateBusFactor(file)
        val debt = analyzer.calculateTechnicalDebt(file)
        
        // Stability Score: 100 - (commits * 2), min 0
        val stability = maxOf(0, 100 - (stats.commits * 2))
        
        // Elite: Onboarding Tour - Generate milestones for new developers
        val onboardingTour = analyzer.generateOnboardingTour(file)
        
        // Elite: Onboarding Recommendations - Expert contacts and related files
        val onboardingRecommendations = analyzer.generateOnboardingRecommendations(file)
        
        // Elite: AI-Powered Onboarding Narrative
        val onboardingNarrative = if (onboardingTour.isNotEmpty()) {
            try {
                val aiService = project.getService(VestigeAIService::class.java)
                val apiKey = PropertiesComponent.getInstance().getValue("vestige.openaiApiKey", "")
                aiService.generateOnboardingNarrative(
                    onboardingTour,
                    file.name,
                    onboardingRecommendations.facts,
                    apiKey
                )
            } catch (e: Exception) {
                null
            }
        } else {
            null
        }
        
        val result = AnalysisResult(
            stats, 
            busFactor, 
            debt, 
            stability,
            onboardingTour,
            onboardingRecommendations,
            onboardingNarrative
        )
        analysisCache[file.path] = result
        return result
    }

    fun getCachedAnalysis(file: VirtualFile): AnalysisResult? = analysisCache[file.path]
}
