package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

/**
 * Code Health Score Dashboard - Overall project health with actionable insights
 */
@Service(Service.Level.PROJECT)
class VestigeHealthScore(private val project: Project) {
    
    data class HealthScore(
        val overall: Double,
        val categories: Map<Category, Double>,
        val trends: Map<Category, Trend>,
        val insights: List<Insight>,
        val recommendations: List<String>
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
    
    enum class Trend {
        IMPROVING,
        STABLE,
        DECLINING
    }
    
    data class Insight(
        val category: Category,
        val message: String,
        val severity: String,
        val actionable: Boolean
    )
    
    /**
     * Calculate overall project health score
     */
    fun calculateHealthScore(): HealthScore {
        val allFiles = getAllCodeFiles()
        if (allFiles.isEmpty()) {
            return HealthScore(
                overall = 0.0,
                categories = emptyMap(),
                trends = emptyMap(),
                insights = emptyList(),
                recommendations = listOf("No code files found in project")
            )
        }
        
        val categories = mutableMapOf<Category, Double>()
        val insights = mutableListOf<Insight>()
        
        // Calculate each category
        categories[Category.MAINTAINABILITY] = calculateMaintainability(allFiles)
        categories[Category.TESTABILITY] = calculateTestability(allFiles)
        categories[Category.COMPLEXITY] = calculateComplexityScore(allFiles)
        categories[Category.DOCUMENTATION] = calculateDocumentationScore(allFiles)
        categories[Category.COUPLING] = calculateCouplingScore(allFiles)
        categories[Category.DUPLICATION] = calculateDuplicationScore(allFiles)
        categories[Category.STABILITY] = calculateStabilityScore(allFiles)
        categories[Category.TEAM_KNOWLEDGE] = calculateTeamKnowledgeScore(allFiles)
        
        // Generate insights
        generateInsights(categories, insights, allFiles)
        
        // Calculate overall score (weighted average)
        val overall = categories.values.average()
        
        // Calculate trends (simplified - would use historical data)
        val trends = categories.mapValues { Trend.STABLE }
        
        // Generate recommendations
        val recommendations = generateRecommendations(categories, insights)
        
        return HealthScore(
            overall = overall,
            categories = categories,
            trends = trends,
            insights = insights,
            recommendations = recommendations
        )
    }
    
    private fun calculateMaintainability(files: List<VirtualFile>): Double {
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        val predictiveRefactoring = project.getService(VestigePredictiveRefactoring::class.java)
        
        var totalScore = 0.0
        var count = 0
        
        files.take(50).forEach { file -> // Sample for performance
            val stats = gitAnalyzer.getFileStats(file) ?: return@forEach
            val suggestions = predictiveRefactoring.analyzeFile(file)
            
            val score = when {
                stats.commits > 50 -> 0.3 // High churn = low maintainability
                suggestions.size > 10 -> 0.5 // Many refactoring suggestions
                stats.ageDays > 365 && stats.commits < 5 -> 0.7 // Stable but old
                else -> 0.9 // Good maintainability
            }
            
            totalScore += score
            count++
        }
        
        return if (count > 0) totalScore / count else 0.5
    }
    
    private fun calculateTestability(files: List<VirtualFile>): Double {
        var totalScore = 0.0
        var count = 0
        
        files.take(50).forEach { file ->
            val content = getFileContent(file) ?: return@forEach
            val hasTests = content.any { 
                it.contains("test") || it.contains("spec") || it.contains("Test")
            }
            val hasAssertions = content.any {
                it.contains("assert") || it.contains("expect") || it.contains("should")
            }
            
            val score = when {
                hasTests && hasAssertions -> 0.9
                hasTests -> 0.7
                else -> 0.4
            }
            
            totalScore += score
            count++
        }
        
        return if (count > 0) totalScore / count else 0.5
    }
    
    private fun calculateComplexityScore(files: List<VirtualFile>): Double {
        val service = project.getService(VestigeService::class.java)
        var totalComplexity = 0.0
        var count = 0
        
        files.take(50).forEach { file ->
            val result = service.analyzeFile(file) ?: return@forEach
            val complexity = result.realTimeStats?.complexity ?: 0
            
            val score = when {
                complexity > 50 -> 0.2
                complexity > 30 -> 0.5
                complexity > 15 -> 0.7
                else -> 0.9
            }
            
            totalComplexity += score
            count++
        }
        
        return if (count > 0) totalComplexity / count else 0.5
    }
    
    private fun calculateDocumentationScore(files: List<VirtualFile>): Double {
        var totalScore = 0.0
        var count = 0
        
        files.take(50).forEach { file ->
            val content = getFileContent(file) ?: return@forEach
            val docLines = content.count { 
                it.trim().startsWith("//") || 
                it.trim().startsWith("/*") ||
                it.trim().startsWith("*") ||
                it.contains("/**")
            }
            val totalLines = content.size
            
            val docRatio = if (totalLines > 0) docLines.toDouble() / totalLines else 0.0
            val score = when {
                docRatio > 0.2 -> 0.9
                docRatio > 0.1 -> 0.7
                docRatio > 0.05 -> 0.5
                else -> 0.3
            }
            
            totalScore += score
            count++
        }
        
        return if (count > 0) totalScore / count else 0.5
    }
    
    private fun calculateCouplingScore(files: List<VirtualFile>): Double {
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        var totalScore = 0.0
        var count = 0
        
        files.take(30).forEach { file ->
            val coupled = gitAnalyzer.getCoupledFiles(file)
            val score = when {
                coupled.size > 10 -> 0.3 // High coupling
                coupled.size > 5 -> 0.5
                coupled.size > 2 -> 0.7
                else -> 0.9 // Low coupling
            }
            
            totalScore += score
            count++
        }
        
        return if (count > 0) totalScore / count else 0.5
    }
    
    private fun calculateDuplicationScore(files: List<VirtualFile>): Double {
        val similarityRadar = project.getService(VestigeSimilarityRadar::class.java)
        var totalDuplication = 0.0
        var count = 0
        
        files.take(20).forEach { file ->
            val similar = similarityRadar.findSimilarPatterns(file, 0.8)
            val score = when {
                similar.size > 5 -> 0.3 // High duplication
                similar.size > 2 -> 0.5
                similar.size > 0 -> 0.7
                else -> 0.9 // Low duplication
            }
            
            totalDuplication += score
            count++
        }
        
        return if (count > 0) totalDuplication / count else 0.5
    }
    
    private fun calculateStabilityScore(files: List<VirtualFile>): Double {
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        var totalStability = 0.0
        var count = 0
        
        files.take(50).forEach { file ->
            val stats = gitAnalyzer.getFileStats(file) ?: return@forEach
            val commitsPerDay = stats.commits.toDouble() / maxOf(1, stats.ageDays)
            
            val score = when {
                commitsPerDay > 0.5 -> 0.3 // Very unstable
                commitsPerDay > 0.2 -> 0.5
                commitsPerDay > 0.1 -> 0.7
                else -> 0.9 // Stable
            }
            
            totalStability += score
            count++
        }
        
        return if (count > 0) totalStability / count else 0.5
    }
    
    private fun calculateTeamKnowledgeScore(files: List<VirtualFile>): Double {
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        var totalScore = 0.0
        var count = 0
        
        files.take(50).forEach { file ->
            val busFactor = gitAnalyzer.calculateBusFactor(file)
            val score = when {
                busFactor.busFactor <= 1 -> 0.2 // Critical
                busFactor.busFactor <= 2 -> 0.4
                busFactor.busFactor <= 3 -> 0.6
                else -> 0.9 // Good knowledge distribution
            }
            
            totalScore += score
            count++
        }
        
        return if (count > 0) totalScore / count else 0.5
    }
    
    private fun generateInsights(
        categories: Map<Category, Double>,
        insights: MutableList<Insight>,
        files: List<VirtualFile>
    ) {
        categories.forEach { (category, score) ->
            when {
                score < 0.4 -> insights.add(Insight(
                    category = category,
                    message = "${category.name} needs immediate attention (score: ${(score * 100).toInt()}%)",
                    severity = "CRITICAL",
                    actionable = true
                ))
                score < 0.6 -> insights.add(Insight(
                    category = category,
                    message = "${category.name} could be improved (score: ${(score * 100).toInt()}%)",
                    severity = "MEDIUM",
                    actionable = true
                ))
            }
        }
    }
    
    private fun generateRecommendations(
        categories: Map<Category, Double>,
        insights: List<Insight>
    ): List<String> {
        val recommendations = mutableListOf<String>()
        
        if (categories[Category.DUPLICATION] ?: 1.0 < 0.6) {
            recommendations.add("🔍 Consider extracting common patterns to reduce duplication")
        }
        
        if (categories[Category.DOCUMENTATION] ?: 1.0 < 0.6) {
            recommendations.add("📝 Add more documentation to improve code understanding")
        }
        
        if (categories[Category.COUPLING] ?: 1.0 < 0.6) {
            recommendations.add("🔗 Reduce coupling between modules for better maintainability")
        }
        
        if (categories[Category.TEAM_KNOWLEDGE] ?: 1.0 < 0.6) {
            recommendations.add("👥 Improve knowledge sharing to reduce bus factor risk")
        }
        
        if (recommendations.isEmpty()) {
            recommendations.add("✅ Project health looks good! Keep up the great work!")
        }
        
        return recommendations
    }
    
    private fun getAllCodeFiles(): List<VirtualFile> {
        val basePath = project.basePath ?: return emptyList()
        val baseDir = com.intellij.openapi.vfs.VfsUtil.findFileByIoFile(
            java.io.File(basePath), true
        ) ?: return emptyList()
        
        val files = mutableListOf<VirtualFile>()
        collectCodeFiles(baseDir, files)
        return files
    }
    
    private fun collectCodeFiles(dir: VirtualFile, files: MutableList<VirtualFile>) {
        if (dir.isDirectory) {
            dir.children.forEach { child ->
                if (child.isDirectory && !child.name.startsWith(".") && child.name != "node_modules") {
                    collectCodeFiles(child, files)
                } else if (!child.isDirectory && isCodeFile(child)) {
                    files.add(child)
                }
            }
        }
    }
    
    private fun isCodeFile(file: VirtualFile): Boolean {
        val ext = file.extension ?: return false
        return ext in listOf("kt", "java", "js", "ts", "tsx", "jsx", "py", "go", "rs", "cpp", "c", "h", "hpp")
    }
    
    private fun getFileContent(file: VirtualFile): List<String>? {
        val document = com.intellij.openapi.fileEditor.FileDocumentManager.getInstance().getDocument(file) ?: return null
        return (0 until document.lineCount)
            .map { 
                val start = document.getLineStartOffset(it)
                val end = document.getLineEndOffset(it)
                document.getText(com.intellij.openapi.util.TextRange(start, end))
            }
    }
}

