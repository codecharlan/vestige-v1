package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.fileEditor.FileDocumentManager
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.min

/**
 * Code Similarity Radar - Automatically detects similar code patterns
 * across the codebase without requiring commits
 */
@Service(Service.Level.PROJECT)
class VestigeSimilarityRadar(private val project: Project) {
    
    data class SimilarityMatch(
        val file: VirtualFile,
        val similarity: Double,
        val matchingLines: List<Int>,
        val pattern: String,
        val suggestion: String
    )
    
    data class CodePattern(
        val lines: List<String>,
        val hash: String,
        val frequency: Int
    )
    
    private val patternCache = ConcurrentHashMap<String, List<CodePattern>>()
    private val similarityCache = ConcurrentHashMap<String, List<SimilarityMatch>>()
    
    /**
     * Find similar code patterns for a given file
     */
    fun findSimilarPatterns(file: VirtualFile, threshold: Double = 0.7): List<SimilarityMatch> {
        val cacheKey = "${file.path}|$threshold"
        similarityCache[cacheKey]?.let { return it }
        
        val document = FileDocumentManager.getInstance().getDocument(file) ?: return emptyList()
        val fileContent = (0 until document.lineCount)
            .map { 
                val start = document.getLineStartOffset(it)
                val end = document.getLineEndOffset(it)
                document.getText(com.intellij.openapi.util.TextRange(start, end))
            }
            .filter { it.trim().isNotEmpty() && !it.trim().startsWith("//") }
        
        if (fileContent.size < 5) return emptyList()
        
        val matches = mutableListOf<SimilarityMatch>()
        val allFiles = getAllCodeFiles()
        
        // Extract patterns from current file (3-10 line chunks)
        val patterns = extractPatterns(fileContent)
        
        allFiles.forEach { otherFile ->
            if (otherFile.path == file.path) return@forEach
            
            val otherContent = getFileContent(otherFile) ?: return@forEach
            if (otherContent.size < 5) return@forEach
            
            patterns.forEach { pattern ->
                val similarity = calculateSimilarity(pattern.lines, otherContent)
                if (similarity >= threshold) {
                    val matchingLines = findMatchingLines(pattern.lines, otherContent)
                    matches.add(SimilarityMatch(
                        file = otherFile,
                        similarity = similarity,
                        matchingLines = matchingLines,
                        pattern = pattern.lines.joinToString("\n").take(100),
                        suggestion = generateSuggestion(pattern, similarity)
                    ))
                }
            }
        }
        
        val sorted = matches.sortedByDescending { it.similarity }.take(10)
        similarityCache[cacheKey] = sorted
        return sorted
    }
    
    /**
     * Extract code patterns from file content
     */
    private fun extractPatterns(content: List<String>): List<CodePattern> {
        val patterns = mutableListOf<CodePattern>()
        
        // Extract patterns of different sizes (3-10 lines)
        for (size in 3..min(10, content.size)) {
            for (i in 0..(content.size - size)) {
                val chunk = content.subList(i, i + size)
                val normalized = normalizeCode(chunk)
                val hash = normalized.joinToString("|").hashCode().toString()
                
                patterns.add(CodePattern(
                    lines = chunk,
                    hash = hash,
                    frequency = 1
                ))
            }
        }
        
        return patterns.distinctBy { it.hash }
    }
    
    /**
     * Normalize code for comparison (remove variable names, etc.)
     */
    private fun normalizeCode(lines: List<String>): List<String> {
        return lines.map { line ->
            line.trim()
                .replace(Regex("\\b[a-z][a-zA-Z0-9]*\\b"), "VAR") // Variable names
                .replace(Regex("\\b[A-Z][a-zA-Z0-9]*\\b"), "CLASS") // Class names
                .replace(Regex("\\d+"), "NUM") // Numbers
                .replace(Regex("\"[^\"]*\""), "\"STRING\"") // Strings
        }
    }
    
    /**
     * Calculate similarity between two code chunks
     */
    private fun calculateSimilarity(pattern: List<String>, content: List<String>): Double {
        val normalizedPattern = normalizeCode(pattern)
        var maxSimilarity = 0.0
        
        for (i in 0..(content.size - pattern.size)) {
            val chunk = content.subList(i, i + pattern.size)
            val normalizedChunk = normalizeCode(chunk)
            
            var matches = 0
            normalizedPattern.forEachIndexed { index, line ->
                if (index < normalizedChunk.size && normalizedChunk[index] == line) {
                    matches++
                }
            }
            
            val similarity = matches.toDouble() / normalizedPattern.size
            maxSimilarity = maxOf(maxSimilarity, similarity)
        }
        
        return maxSimilarity
    }
    
    /**
     * Find matching line numbers in target file
     */
    private fun findMatchingLines(pattern: List<String>, content: List<String>): List<Int> {
        val normalizedPattern = normalizeCode(pattern)
        val matches = mutableListOf<Int>()
        
        for (i in 0..(content.size - pattern.size)) {
            val chunk = content.subList(i, i + pattern.size)
            val normalizedChunk = normalizeCode(chunk)
            
            if (normalizedChunk == normalizedPattern) {
                matches.add(i)
            }
        }
        
        return matches
    }
    
    /**
     * Generate suggestion for similar code
     */
    private fun generateSuggestion(pattern: CodePattern, similarity: Double): String {
        return when {
            similarity > 0.9 -> "Consider extracting this pattern into a shared function"
            similarity > 0.8 -> "High similarity detected - might benefit from refactoring"
            else -> "Similar pattern found - review for duplication"
        }
    }
    
    /**
     * Get all code files in project
     */
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
        val document = FileDocumentManager.getInstance().getDocument(file) ?: return null
        return (0 until document.lineCount)
            .map { 
                val start = document.getLineStartOffset(it)
                val end = document.getLineEndOffset(it)
                document.getText(com.intellij.openapi.util.TextRange(start, end))
            }
            .filter { it.trim().isNotEmpty() && !it.trim().startsWith("//") }
    }
    
    /**
     * Get extraction opportunities (duplicated code that should be extracted)
     */
    fun getExtractionOpportunities(): List<ExtractionOpportunity> {
        val opportunities = mutableListOf<ExtractionOpportunity>()
        val allFiles = getAllCodeFiles()
        
        allFiles.forEach { file1 ->
            allFiles.forEach { file2 ->
                if (file1.path >= file2.path) return@forEach // Avoid duplicates
                
                val matches = findSimilarPatterns(file1, 0.85)
                matches.forEach { match ->
                    if (match.file.path == file2.path) {
                        opportunities.add(ExtractionOpportunity(
                            file1 = file1,
                            file2 = file2,
                            pattern = match.pattern,
                            similarity = match.similarity,
                            suggestedName = suggestFunctionName(match.pattern)
                        ))
                    }
                }
            }
        }
        
        return opportunities.sortedByDescending { it.similarity }.take(20)
    }
    
    data class ExtractionOpportunity(
        val file1: VirtualFile,
        val file2: VirtualFile,
        val pattern: String,
        val similarity: Double,
        val suggestedName: String
    )
    
    private fun suggestFunctionName(pattern: String): String {
        // Simple heuristic: look for function-like patterns
        val lines = pattern.lines()
        lines.forEach { line ->
            if (line.contains("fun ") || line.contains("function ") || line.contains("def ")) {
                val match = Regex("(fun|function|def)\\s+([a-zA-Z0-9_]+)").find(line)
                return match?.groupValues?.get(2) ?: "extractedFunction"
            }
        }
        return "extractedFunction"
    }
}

