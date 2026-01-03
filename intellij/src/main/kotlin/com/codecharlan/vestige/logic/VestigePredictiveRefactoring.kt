package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.fileEditor.FileDocumentManager

/**
 * Predictive Refactoring Assistant - Analyzes patterns and suggests
 * refactorings before problems occur
 */
@Service(Service.Level.PROJECT)
class VestigePredictiveRefactoring(private val project: Project) {
    
    data class RefactoringSuggestion(
        val file: VirtualFile,
        val type: RefactoringType,
        val severity: Severity,
        val message: String,
        val location: Int, // Line number
        val confidence: Double,
        val suggestedAction: String
    )
    
    enum class RefactoringType {
        EXTRACT_METHOD,
        EXTRACT_CLASS,
        SIMPLIFY_CONDITIONAL,
        REMOVE_DUPLICATION,
        REDUCE_COMPLEXITY,
        IMPROVE_NAMING,
        REDUCE_COUPLING,
        INCREASE_COHESION
    }
    
    enum class Severity {
        LOW,
        MEDIUM,
        HIGH,
        CRITICAL
    }
    
    /**
     * Analyze file and generate refactoring suggestions
     */
    fun analyzeFile(file: VirtualFile): List<RefactoringSuggestion> {
        val document = FileDocumentManager.getInstance().getDocument(file) ?: return emptyList()
        val suggestions = mutableListOf<RefactoringSuggestion>()
        
        val content = (0 until document.lineCount)
            .map { 
                val start = document.getLineStartOffset(it)
                val end = document.getLineEndOffset(it)
                document.getText(com.intellij.openapi.util.TextRange(start, end))
            }
        
        // Check for various code smells
        suggestions.addAll(detectLongMethods(file, content))
        suggestions.addAll(detectComplexConditionals(file, content))
        suggestions.addAll(detectCodeDuplication(file, content))
        suggestions.addAll(detectHighComplexity(file, content))
        suggestions.addAll(detectPoorNaming(file, content))
        suggestions.addAll(detectTightCoupling(file, content))
        
        return suggestions.sortedByDescending { 
            it.severity.ordinal * 100 + it.confidence 
        }
    }
    
    private fun detectLongMethods(file: VirtualFile, content: List<String>): List<RefactoringSuggestion> {
        val suggestions = mutableListOf<RefactoringSuggestion>()
        var methodStart = -1
        var methodLineCount = 0
        var currentMethod = ""
        
        content.forEachIndexed { index, line ->
            if (line.contains("fun ") || line.contains("function ") || line.contains("def ") || 
                line.contains("public ") || line.contains("private ")) {
                if (methodStart != -1 && methodLineCount > 50) {
                    suggestions.add(RefactoringSuggestion(
                        file = file,
                        type = RefactoringType.EXTRACT_METHOD,
                        severity = if (methodLineCount > 100) Severity.CRITICAL else Severity.HIGH,
                        message = "Long method detected: $currentMethod (${methodLineCount} lines)",
                        location = methodStart,
                        confidence = 0.9,
                        suggestedAction = "Consider breaking this method into smaller, focused methods"
                    ))
                }
                methodStart = index
                methodLineCount = 0
                currentMethod = line.trim().take(50)
            } else if (methodStart != -1) {
                methodLineCount++
            }
        }
        
        return suggestions
    }
    
    private fun detectComplexConditionals(file: VirtualFile, content: List<String>): List<RefactoringSuggestion> {
        val suggestions = mutableListOf<RefactoringSuggestion>()
        
        content.forEachIndexed { index, line ->
            val ifCount = line.split("if").size - 1
            val andCount = line.split("&&").size - 1
            val orCount = line.split("||").size - 1
            
            val complexity = ifCount + andCount + orCount
            if (complexity > 3) {
                suggestions.add(RefactoringSuggestion(
                    file = file,
                    type = RefactoringType.SIMPLIFY_CONDITIONAL,
                    severity = if (complexity > 5) Severity.HIGH else Severity.MEDIUM,
                    message = "Complex conditional detected (complexity: $complexity)",
                    location = index,
                    confidence = 0.85,
                    suggestedAction = "Extract condition into a well-named boolean method"
                ))
            }
        }
        
        return suggestions
    }
    
    private fun detectCodeDuplication(file: VirtualFile, content: List<String>): List<RefactoringSuggestion> {
        val suggestions = mutableListOf<RefactoringSuggestion>()
        val similarityRadar = project.getService(VestigeSimilarityRadar::class.java)
        
        val similar = similarityRadar.findSimilarPatterns(file, 0.8)
        if (similar.isNotEmpty()) {
            suggestions.add(RefactoringSuggestion(
                file = file,
                type = RefactoringType.REMOVE_DUPLICATION,
                severity = Severity.MEDIUM,
                message = "Found ${similar.size} similar code patterns",
                location = 0,
                confidence = 0.9,
                suggestedAction = "Consider extracting common code into shared functions"
            ))
        }
        
        return suggestions
    }
    
    private fun detectHighComplexity(file: VirtualFile, content: List<String>): List<RefactoringSuggestion> {
        val suggestions = mutableListOf<RefactoringSuggestion>()
        var complexity = 0
        var methodStart = -1
        
        content.forEachIndexed { index, line ->
            if (line.contains("fun ") || line.contains("function ") || line.contains("def ")) {
                if (methodStart != -1 && complexity > 15) {
                    suggestions.add(RefactoringSuggestion(
                        file = file,
                        type = RefactoringType.REDUCE_COMPLEXITY,
                        severity = if (complexity > 25) Severity.CRITICAL else Severity.HIGH,
                        message = "High cyclomatic complexity detected: $complexity",
                        location = methodStart,
                        confidence = 0.9,
                        suggestedAction = "Break down into smaller, testable methods"
                    ))
                }
                methodStart = index
                complexity = 0
            } else {
                // Count decision points
                complexity += line.split("if", "else", "for", "while", "switch", "case", "catch").size - 1
            }
        }
        
        return suggestions
    }
    
    private fun detectPoorNaming(file: VirtualFile, content: List<String>): List<RefactoringSuggestion> {
        val suggestions = mutableListOf<RefactoringSuggestion>()
        
        content.forEachIndexed { index, line ->
            // Check for single-letter variables, abbreviations, etc.
            val poorNames = Regex("\\b([a-z]|temp|tmp|data|obj|val|var|foo|bar|baz)\\b").findAll(line)
            if (poorNames.count() > 2) {
                suggestions.add(RefactoringSuggestion(
                    file = file,
                    type = RefactoringType.IMPROVE_NAMING,
                    severity = Severity.LOW,
                    message = "Poor variable naming detected",
                    location = index,
                    confidence = 0.7,
                    suggestedAction = "Use descriptive names that explain intent"
                ))
            }
        }
        
        return suggestions.take(5) // Limit to avoid spam
    }
    
    private fun detectTightCoupling(file: VirtualFile, content: List<String>): List<RefactoringSuggestion> {
        val suggestions = mutableListOf<RefactoringSuggestion>()
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        
        val coupledFiles = gitAnalyzer.getCoupledFiles(file)
        if (coupledFiles.size > 5) {
            suggestions.add(RefactoringSuggestion(
                file = file,
                type = RefactoringType.REDUCE_COUPLING,
                severity = Severity.MEDIUM,
                message = "High coupling detected: ${coupledFiles.size} files frequently changed together",
                location = 0,
                confidence = 0.8,
                suggestedAction = "Consider introducing interfaces or dependency injection"
            ))
        }
        
        return suggestions
    }
    
    /**
     * Get predictive warnings (code that will become a problem)
     */
    fun getPredictiveWarnings(file: VirtualFile): List<String> {
        val warnings = mutableListOf<String>()
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        val stats = gitAnalyzer.getFileStats(file)
        
        // Predict based on trends
        if (stats != null) {
            val commitsPerDay = stats.commits.toDouble() / maxOf(1, stats.ageDays)
            if (commitsPerDay > 0.5) {
                warnings.add("⚠️ High change frequency detected - this file may need architectural attention")
            }
            
            if (stats.commits > 30 && stats.ageDays < 90) {
                warnings.add("⚠️ Rapidly evolving file - consider stabilizing the API")
            }
        }
        
        return warnings
    }
}

