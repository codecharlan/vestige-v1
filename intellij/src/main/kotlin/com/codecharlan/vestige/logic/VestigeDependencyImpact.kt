package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.fileEditor.FileDocumentManager

/**
 * Dependency Impact Analyzer - See how changes affect other files
 * Works automatically without requiring commits
 */
@Service(Service.Level.PROJECT)
class VestigeDependencyImpact(private val project: Project) {
    
    data class ImpactAnalysis(
        val file: VirtualFile,
        val affectedFiles: List<AffectedFile>,
        val riskLevel: RiskLevel,
        val estimatedImpact: String,
        val suggestions: List<String>
    )
    
    data class AffectedFile(
        val file: VirtualFile,
        val impactType: ImpactType,
        val severity: Severity,
        val reason: String,
        val confidence: Double
    )
    
    enum class ImpactType {
        DIRECT_DEPENDENCY,
        INDIRECT_DEPENDENCY,
        COUPLED_FILE,
        SIMILAR_PATTERN,
        TEST_FILE
    }
    
    enum class RiskLevel {
        LOW,
        MEDIUM,
        HIGH,
        CRITICAL
    }
    
    enum class Severity {
        LOW,
        MEDIUM,
        HIGH
    }
    
    /**
     * Analyze impact of changing a file
     */
    fun analyzeImpact(file: VirtualFile): ImpactAnalysis {
        val affectedFiles = mutableListOf<AffectedFile>()
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        val smartNavigation = project.getService(VestigeSmartNavigation::class.java)
        val similarityRadar = project.getService(VestigeSimilarityRadar::class.java)
        
        // 1. Direct dependencies (files that import/use this file)
        val dependents = smartNavigation.getDependents(file)
        dependents.forEach { related ->
            affectedFiles.add(AffectedFile(
                file = related.file,
                impactType = ImpactType.DIRECT_DEPENDENCY,
                severity = Severity.HIGH,
                reason = related.reason,
                confidence = related.strength
            ))
        }
        
        // 2. Coupled files (files that change together)
        val coupledFiles = gitAnalyzer.getCoupledFiles(file)
        coupledFiles.forEach { coupling ->
            val vFile = findFileByPath(coupling.file) ?: return@forEach
            affectedFiles.add(AffectedFile(
                file = vFile,
                impactType = ImpactType.COUPLED_FILE,
                severity = if (coupling.frequency > 70) Severity.HIGH else Severity.MEDIUM,
                reason = "Frequently changed together (${coupling.frequency}%)",
                confidence = coupling.frequency / 100.0
            ))
        }
        
        // 3. Files with similar patterns (might need updates too)
        val similar = similarityRadar.findSimilarPatterns(file, 0.75)
        similar.take(5).forEach { match ->
            affectedFiles.add(AffectedFile(
                file = match.file,
                impactType = ImpactType.SIMILAR_PATTERN,
                severity = Severity.LOW,
                reason = "Similar code pattern (${(match.similarity * 100).toInt()}% match)",
                confidence = match.similarity
            ))
        }
        
        // 4. Test files
        val testFiles = findTestFiles(file)
        testFiles.forEach { testFile ->
            affectedFiles.add(AffectedFile(
                file = testFile,
                impactType = ImpactType.TEST_FILE,
                severity = Severity.HIGH,
                reason = "Test file - may need updates",
                confidence = 0.9
            ))
        }
        
        // Calculate risk level
        val riskLevel = calculateRiskLevel(affectedFiles)
        
        // Generate suggestions
        val suggestions = generateSuggestions(affectedFiles, riskLevel)
        
        return ImpactAnalysis(
            file = file,
            affectedFiles = affectedFiles.distinctBy { it.file.path },
            riskLevel = riskLevel,
            estimatedImpact = estimateImpact(affectedFiles),
            suggestions = suggestions
        )
    }
    
    /**
     * Predict what would break if this file is changed
     */
    fun predictBreakage(file: VirtualFile): List<BreakagePrediction> {
        val predictions = mutableListOf<BreakagePrediction>()
        val impact = analyzeImpact(file)
        
        impact.affectedFiles.forEach { affected ->
            if (affected.severity == Severity.HIGH && affected.impactType == ImpactType.DIRECT_DEPENDENCY) {
                predictions.add(BreakagePrediction(
                    file = affected.file,
                    reason = affected.reason,
                    probability = affected.confidence,
                    mitigation = "Review ${affected.file.name} after changes"
                ))
            }
        }
        
        return predictions
    }
    
    data class BreakagePrediction(
        val file: VirtualFile,
        val reason: String,
        val probability: Double,
        val mitigation: String
    )
    
    /**
     * Visual dependency graph data
     */
    fun getDependencyGraph(file: VirtualFile): DependencyGraph {
        val impact = analyzeImpact(file)
        val nodes = mutableListOf<GraphNode>()
        val edges = mutableListOf<GraphEdge>()
        
        // Add current file as center node
        nodes.add(GraphNode(
            id = file.path,
            label = file.name,
            type = NodeType.CENTER,
            size = 20
        ))
        
        // Add affected files as nodes
        impact.affectedFiles.forEach { affected ->
            nodes.add(GraphNode(
                id = affected.file.path,
                label = affected.file.name,
                type = when (affected.impactType) {
                    ImpactType.DIRECT_DEPENDENCY -> NodeType.DEPENDENCY
                    ImpactType.COUPLED_FILE -> NodeType.COUPLED
                    ImpactType.SIMILAR_PATTERN -> NodeType.SIMILAR
                    ImpactType.TEST_FILE -> NodeType.TEST
                    else -> NodeType.OTHER
                },
                size = (affected.confidence * 15).toInt() + 5
            ))
            
            // Add edge
            edges.add(GraphEdge(
                from = file.path,
                to = affected.file.path,
                type = affected.impactType.name,
                weight = affected.confidence
            ))
        }
        
        return DependencyGraph(nodes, edges)
    }
    
    data class DependencyGraph(
        val nodes: List<GraphNode>,
        val edges: List<GraphEdge>
    )
    
    data class GraphNode(
        val id: String,
        val label: String,
        val type: NodeType,
        val size: Int
    )
    
    enum class NodeType {
        CENTER,
        DEPENDENCY,
        COUPLED,
        SIMILAR,
        TEST,
        OTHER
    }
    
    data class GraphEdge(
        val from: String,
        val to: String,
        val type: String,
        val weight: Double
    )
    
    private fun calculateRiskLevel(affectedFiles: List<AffectedFile>): RiskLevel {
        val highSeverityCount = affectedFiles.count { it.severity == Severity.HIGH }
        val directDeps = affectedFiles.count { it.impactType == ImpactType.DIRECT_DEPENDENCY }
        
        return when {
            highSeverityCount > 10 || directDeps > 5 -> RiskLevel.CRITICAL
            highSeverityCount > 5 || directDeps > 2 -> RiskLevel.HIGH
            highSeverityCount > 2 -> RiskLevel.MEDIUM
            else -> RiskLevel.LOW
        }
    }
    
    private fun estimateImpact(affectedFiles: List<AffectedFile>): String {
        val highCount = affectedFiles.count { it.severity == Severity.HIGH }
        val total = affectedFiles.size
        
        return when {
            total == 0 -> "No impact detected"
            highCount > 5 -> "High impact: $highCount critical files affected"
            highCount > 2 -> "Medium impact: $highCount important files affected"
            else -> "Low impact: $total files may need attention"
        }
    }
    
    private fun generateSuggestions(affectedFiles: List<AffectedFile>, riskLevel: RiskLevel): List<String> {
        val suggestions = mutableListOf<String>()
        
        when (riskLevel) {
            RiskLevel.CRITICAL -> {
                suggestions.add("⚠️ CRITICAL: Review all affected files before making changes")
                suggestions.add("Consider creating a feature branch for these changes")
            }
            RiskLevel.HIGH -> {
                suggestions.add("Review affected files after changes")
                suggestions.add("Run tests for related files")
            }
            RiskLevel.MEDIUM -> {
                suggestions.add("Monitor affected files for issues")
            }
            RiskLevel.LOW -> {
                suggestions.add("Low risk - proceed with changes")
            }
        }
        
        val testFiles = affectedFiles.filter { it.impactType == ImpactType.TEST_FILE }
        if (testFiles.isNotEmpty()) {
            suggestions.add("📝 Update ${testFiles.size} test file(s) after changes")
        }
        
        return suggestions
    }
    
    private fun findTestFiles(file: VirtualFile): List<VirtualFile> {
        val testFiles = mutableListOf<VirtualFile>()
        val fileName = file.nameWithoutExtension
        val basePath = project.basePath ?: return emptyList()
        
        // Look for test files with similar names
        val allFiles = getAllCodeFiles()
        allFiles.forEach { testFile ->
            if (testFile.name.contains(fileName, ignoreCase = true) &&
                (testFile.name.contains("test", ignoreCase = true) ||
                 testFile.name.contains("spec", ignoreCase = true) ||
                 testFile.path.contains("test", ignoreCase = true))) {
                testFiles.add(testFile)
            }
        }
        
        return testFiles
    }
    
    private fun findFileByPath(path: String): VirtualFile? {
        val basePath = project.basePath ?: return null
        val fullPath = if (path.startsWith(basePath)) path else "$basePath/$path"
        return com.intellij.openapi.vfs.VfsUtil.findFileByIoFile(
            java.io.File(fullPath), true
        )
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
}

