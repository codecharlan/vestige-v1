package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

/**
 * Smart Code Navigation - Jump to related files based on commit history
 * Works automatically without requiring commits
 */
@Service(Service.Level.PROJECT)
class VestigeSmartNavigation(private val project: Project) {
    
    data class RelatedFile(
        val file: VirtualFile,
        val relationship: RelationshipType,
        val strength: Double,
        val reason: String
    )
    
    enum class RelationshipType {
        CHANGED_TOGETHER,
        SIMILAR_PATTERN,
        DEPENDENCY,
        COUPLED,
        TEMPORAL_SEQUENCE
    }
    
    /**
     * Get related files for a given file
     */
    fun getRelatedFiles(file: VirtualFile, limit: Int = 10): List<RelatedFile> {
        val related = mutableListOf<RelatedFile>()
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        val similarityRadar = project.getService(VestigeSimilarityRadar::class.java)
        
        // 1. Files that changed together (from git history)
        val coupledFiles = gitAnalyzer.getCoupledFiles(file)
        coupledFiles.forEach { coupling ->
            val vFile = findFileByPath(coupling.file) ?: return@forEach
            related.add(RelatedFile(
                file = vFile,
                relationship = RelationshipType.CHANGED_TOGETHER,
                strength = coupling.frequency / 100.0,
                reason = "Changed together ${coupling.frequency}% of the time"
            ))
        }
        
        // 2. Files with similar code patterns
        val similar = similarityRadar.findSimilarPatterns(file, 0.7)
        similar.forEach { match ->
            related.add(RelatedFile(
                file = match.file,
                relationship = RelationshipType.SIMILAR_PATTERN,
                strength = match.similarity,
                reason = "Similar code pattern (${(match.similarity * 100).toInt()}% match)"
            ))
        }
        
        // 3. Temporal sequence (files changed before/after this one)
        val temporal = findTemporalSequence(file)
        temporal.forEach { (vFile, strength, reason) ->
            related.add(RelatedFile(
                file = vFile,
                relationship = RelationshipType.TEMPORAL_SEQUENCE,
                strength = strength,
                reason = reason
            ))
        }
        
        return related
            .distinctBy { it.file.path }
            .sortedByDescending { it.strength }
            .take(limit)
    }
    
    /**
     * Find files that were changed in temporal sequence
     */
    private fun findTemporalSequence(file: VirtualFile): List<Triple<VirtualFile, Double, String>> {
        val results = mutableListOf<Triple<VirtualFile, Double, String>>()
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        
        // This would analyze commit order - simplified for now
        val coupledFiles = gitAnalyzer.getCoupledFiles(file)
        coupledFiles.forEach { coupling ->
            val vFile = findFileByPath(coupling.file) ?: return@forEach
            results.add(Triple(
                vFile,
                coupling.frequency / 100.0,
                "Often changed in sequence"
            ))
        }
        
        return results
    }
    
    /**
     * Get files that depend on this file (reverse dependencies)
     */
    fun getDependents(file: VirtualFile): List<RelatedFile> {
        val dependents = mutableListOf<RelatedFile>()
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        
        // Find files that import/include this file
        val allFiles = getAllCodeFiles()
        val fileName = file.nameWithoutExtension
        
        allFiles.forEach { otherFile ->
            if (otherFile.path == file.path) return@forEach
            
            val content = getFileContent(otherFile) ?: return@forEach
            if (content.any { it.contains(fileName) || it.contains(file.name) }) {
                dependents.add(RelatedFile(
                    file = otherFile,
                    relationship = RelationshipType.DEPENDENCY,
                    strength = 0.7,
                    reason = "References ${file.name}"
                ))
            }
        }
        
        return dependents
    }
    
    /**
     * Get navigation suggestions (like "Go to Related")
     */
    fun getNavigationSuggestions(file: VirtualFile): NavigationSuggestion {
        val related = getRelatedFiles(file, 5)
        val dependents = getDependents(file)
        
        return NavigationSuggestion(
            relatedFiles = related,
            dependents = dependents,
            quickActions = listOf(
                "Jump to most related file",
                "Show all files changed together",
                "Find similar patterns",
                "View dependency graph"
            )
        )
    }
    
    data class NavigationSuggestion(
        val relatedFiles: List<RelatedFile>,
        val dependents: List<RelatedFile>,
        val quickActions: List<String>
    )
    
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

