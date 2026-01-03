package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.fileEditor.FileDocumentManager

/**
 * Auto-Documentation Generator - Generates docs from git history
 * and code patterns automatically
 */
@Service(Service.Level.PROJECT)
class VestigeAutoDocumentation(private val project: Project) {
    
    data class DocumentationSuggestion(
        val file: VirtualFile,
        val line: Int,
        val type: DocType,
        val suggestedComment: String,
        val confidence: Double
    )
    
    enum class DocType {
        FUNCTION,
        CLASS,
        MODULE,
        PARAMETER,
        RETURN_VALUE,
        USAGE_EXAMPLE
    }
    
    /**
     * Generate documentation suggestions for a file
     */
    fun generateDocumentation(file: VirtualFile): List<DocumentationSuggestion> {
        val suggestions = mutableListOf<DocumentationSuggestion>()
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        val document = FileDocumentManager.getInstance().getDocument(file) ?: return emptyList()
        
        val content = (0 until document.lineCount)
            .map { 
                val start = document.getLineStartOffset(it)
                val end = document.getLineEndOffset(it)
                document.getText(com.intellij.openapi.util.TextRange(start, end))
            }
        
        // Extract function signatures and generate docs
        content.forEachIndexed { index, line ->
            if (isFunctionSignature(line)) {
                val doc = generateFunctionDoc(line, index, file, gitAnalyzer)
                if (doc != null) {
                    suggestions.add(doc)
                }
            }
            
            if (isClassSignature(line)) {
                val doc = generateClassDoc(line, index, file, gitAnalyzer)
                if (doc != null) {
                    suggestions.add(doc)
                }
            }
        }
        
        return suggestions
    }
    
    private fun isFunctionSignature(line: String): Boolean {
        return line.contains("fun ") || 
               line.contains("function ") || 
               line.contains("def ") ||
               (line.contains("public ") && line.contains("(")) ||
               (line.contains("private ") && line.contains("("))
    }
    
    private fun isClassSignature(line: String): Boolean {
        return line.contains("class ") && 
               !line.contains("import") &&
               !line.contains("//")
    }
    
    private fun generateFunctionDoc(
        signature: String,
        line: Int,
        file: VirtualFile,
        gitAnalyzer: VestigeGitAnalyzer
    ): DocumentationSuggestion? {
        val functionName = extractFunctionName(signature)
        val params = extractParameters(signature)
        
        // Get commit history for context
        val stats = gitAnalyzer.getFileStats(file)
        val commitContext = if (stats != null) {
            "This function has been modified ${stats.commits} times"
        } else {
            "Recently added function"
        }
        
        val doc = buildString {
            append("/**\n")
            append(" * $functionName\n")
            if (params.isNotEmpty()) {
                append(" *\n")
                params.forEach { param ->
                    append(" * @param $param - parameter description\n")
                }
            }
            append(" * @return - return value description\n")
            append(" * @note $commitContext\n")
            append(" */")
        }
        
        return DocumentationSuggestion(
            file = file,
            line = line,
            type = DocType.FUNCTION,
            suggestedComment = doc,
            confidence = 0.8
        )
    }
    
    private fun generateClassDoc(
        signature: String,
        line: Int,
        file: VirtualFile,
        gitAnalyzer: VestigeGitAnalyzer
    ): DocumentationSuggestion? {
        val className = extractClassName(signature)
        val stats = gitAnalyzer.getFileStats(file)
        
        val doc = buildString {
            append("/**\n")
            append(" * $className\n")
            append(" *\n")
            if (stats != null) {
                append(" * This class has been part of the codebase for ${stats.ageDays} days\n")
                append(" * and has been modified ${stats.commits} times.\n")
            }
            append(" */")
        }
        
        return DocumentationSuggestion(
            file = file,
            line = line,
            type = DocType.CLASS,
            suggestedComment = doc,
            confidence = 0.7
        )
    }
    
    private fun extractFunctionName(signature: String): String {
        val patterns = listOf(
            Regex("fun\\s+([a-zA-Z0-9_]+)"),
            Regex("function\\s+([a-zA-Z0-9_]+)"),
            Regex("def\\s+([a-zA-Z0-9_]+)"),
            Regex("(?:public|private|protected)\\s+\\w+\\s+([a-zA-Z0-9_]+)\\s*\\(")
        )
        
        patterns.forEach { pattern ->
            pattern.find(signature)?.let {
                return it.groupValues[1]
            }
        }
        
        return "function"
    }
    
    private fun extractClassName(signature: String): String {
        Regex("class\\s+([a-zA-Z0-9_]+)").find(signature)?.let {
            return it.groupValues[1]
        }
        return "Class"
    }
    
    private fun extractParameters(signature: String): List<String> {
        val paramMatch = Regex("\\(([^)]*)\\)").find(signature)
        if (paramMatch == null) return emptyList()
        
        val params = paramMatch.groupValues[1]
        if (params.isBlank()) return emptyList()
        
        return params.split(",")
            .map { it.trim().split(":").first().trim().split(" ").last() }
            .filter { it.isNotBlank() }
    }
    
    /**
     * Generate module-level documentation
     */
    fun generateModuleDoc(file: VirtualFile): String {
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        val stats = gitAnalyzer.getFileStats(file)
        val busFactor = gitAnalyzer.calculateBusFactor(file)
        
        return buildString {
            append("/**\n")
            append(" * ${file.name}\n")
            append(" *\n")
            if (stats != null) {
                append(" * File Statistics:\n")
                append(" * - Age: ${stats.ageDays} days\n")
                append(" * - Commits: ${stats.commits}\n")
                append(" * - Top Contributor: ${stats.topAuthor}\n")
            }
            if (busFactor.busFactor > 0) {
                append(" * - Bus Factor: ${busFactor.busFactor}\n")
            }
            append(" */")
        }
    }
    
    /**
     * Extract "why" from commit messages
     */
    fun extractWhyFromHistory(file: VirtualFile): String {
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        // This would analyze commit messages to extract reasoning
        // Simplified for now
        return "This file has evolved over time based on changing requirements"
    }
}

