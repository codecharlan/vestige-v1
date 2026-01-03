package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.fileEditor.FileDocumentManager

/**
 * Pattern Detector & Anti-Pattern Finder - Automatic detection
 * of patterns and anti-patterns in code
 */
@Service(Service.Level.PROJECT)
class VestigePatternDetector(private val project: Project) {
    
    data class PatternDetection(
        val file: VirtualFile,
        val patterns: List<DetectedPattern>,
        val antiPatterns: List<DetectedAntiPattern>,
        val suggestions: List<PatternSuggestion>
    )
    
    data class DetectedPattern(
        val type: PatternType,
        val location: Int,
        val description: String,
        val confidence: Double,
        val isGood: Boolean
    )
    
    data class DetectedAntiPattern(
        val type: AntiPatternType,
        val location: Int,
        val description: String,
        val severity: Severity,
        val fix: String
    )
    
    data class PatternSuggestion(
        val pattern: String,
        val file: VirtualFile,
        val reason: String,
        val benefit: String
    )
    
    enum class PatternType {
        FACTORY,
        SINGLETON,
        OBSERVER,
        STRATEGY,
        DECORATOR,
        ADAPTER,
        TEMPLATE_METHOD,
        BUILDER,
        REPOSITORY,
        SERVICE_LAYER
    }
    
    enum class AntiPatternType {
        GOD_OBJECT,
        SPAGHETTI_CODE,
        COPY_PASTE,
        MAGIC_NUMBERS,
        LONG_PARAMETER_LIST,
        FEATURE_ENVY,
        DATA_CLASS,
        ANEMIC_DOMAIN,
        CIRCLES,
        SHOTGUN_SURGERY
    }
    
    enum class Severity {
        LOW,
        MEDIUM,
        HIGH,
        CRITICAL
    }
    
    /**
     * Detect patterns and anti-patterns in a file
     */
    fun detectPatterns(file: VirtualFile): PatternDetection {
        val document = FileDocumentManager.getInstance().getDocument(file) ?: return PatternDetection(
            file, emptyList(), emptyList(), emptyList()
        )
        
        val content = (0 until document.lineCount)
            .map { 
                val start = document.getLineStartOffset(it)
                val end = document.getLineEndOffset(it)
                document.getText(com.intellij.openapi.util.TextRange(start, end))
            }
        
        val patterns = mutableListOf<DetectedPattern>()
        val antiPatterns = mutableListOf<DetectedAntiPattern>()
        
        // Detect design patterns
        patterns.addAll(detectDesignPatterns(content))
        
        // Detect anti-patterns
        antiPatterns.addAll(detectAntiPatterns(content, file))
        
        // Generate suggestions
        val suggestions = generateSuggestions(patterns, antiPatterns, file)
        
        return PatternDetection(
            file = file,
            patterns = patterns,
            antiPatterns = antiPatterns,
            suggestions = suggestions
        )
    }
    
    private fun detectDesignPatterns(content: List<String>): List<DetectedPattern> {
        val patterns = mutableListOf<DetectedPattern>()
        
        content.forEachIndexed { index, line ->
            // Factory Pattern
            if (line.contains("Factory") || (line.contains("create") && line.contains("new"))) {
                patterns.add(DetectedPattern(
                    type = PatternType.FACTORY,
                    location = index,
                    description = "Factory pattern detected",
                    confidence = 0.7,
                    isGood = true
                ))
            }
            
            // Singleton Pattern
            if (line.contains("getInstance") || (line.contains("private") && line.contains("constructor"))) {
                patterns.add(DetectedPattern(
                    type = PatternType.SINGLETON,
                    location = index,
                    description = "Singleton pattern detected",
                    confidence = 0.6,
                    isGood = true
                ))
            }
            
            // Builder Pattern
            if (line.contains("Builder") || (line.contains("build") && line.contains("return"))) {
                patterns.add(DetectedPattern(
                    type = PatternType.BUILDER,
                    location = index,
                    description = "Builder pattern detected",
                    confidence = 0.7,
                    isGood = true
                ))
            }
            
            // Repository Pattern
            if (line.contains("Repository") || (line.contains("find") && line.contains("save"))) {
                patterns.add(DetectedPattern(
                    type = PatternType.REPOSITORY,
                    location = index,
                    description = "Repository pattern detected",
                    confidence = 0.6,
                    isGood = true
                ))
            }
        }
        
        return patterns.distinctBy { it.type }
    }
    
    private fun detectAntiPatterns(content: List<String>, file: VirtualFile): List<DetectedAntiPattern> {
        val antiPatterns = mutableListOf<DetectedAntiPattern>()
        
        // God Object (very large class)
        if (content.size > 500) {
            antiPatterns.add(DetectedAntiPattern(
                type = AntiPatternType.GOD_OBJECT,
                location = 0,
                description = "God Object: File has ${content.size} lines - consider splitting",
                severity = Severity.HIGH,
                fix = "Break down into smaller, focused classes"
            ))
        }
        
        // Magic Numbers
        content.forEachIndexed { index, line ->
            val magicNumbers = Regex("\\b(0x[0-9a-fA-F]+|\\d{3,})\\b").findAll(line)
            if (magicNumbers.count() > 2) {
                antiPatterns.add(DetectedAntiPattern(
                    type = AntiPatternType.MAGIC_NUMBERS,
                    location = index,
                    description = "Magic numbers detected - use named constants",
                    severity = Severity.MEDIUM,
                    fix = "Extract numbers into named constants with meaningful names"
                ))
            }
        }
        
        // Long Parameter List
        content.forEachIndexed { index, line ->
            val paramCount = line.split(",").size
            if (line.contains("(") && paramCount > 5) {
                antiPatterns.add(DetectedAntiPattern(
                    type = AntiPatternType.LONG_PARAMETER_LIST,
                    location = index,
                    description = "Long parameter list (${paramCount} parameters)",
                    severity = Severity.MEDIUM,
                    fix = "Consider using a parameter object or builder pattern"
                ))
            }
        }
        
        // Copy-Paste (detected via similarity radar)
        val similarityRadar = project.getService(VestigeSimilarityRadar::class.java)
        val similar = similarityRadar.findSimilarPatterns(file, 0.9)
        if (similar.size > 3) {
            antiPatterns.add(DetectedAntiPattern(
                type = AntiPatternType.COPY_PASTE,
                location = 0,
                description = "Copy-paste code detected: ${similar.size} similar patterns",
                severity = Severity.HIGH,
                fix = "Extract common code into shared functions"
            ))
        }
        
        // Feature Envy (accessing other objects' data excessively)
        content.forEachIndexed { index, line ->
            val externalAccesses = line.split(".").size - 1
            if (externalAccesses > 5 && line.contains("get") || line.contains("set")) {
                antiPatterns.add(DetectedAntiPattern(
                    type = AntiPatternType.FEATURE_ENVY,
                    location = index,
                    description = "Feature Envy: Excessive access to other objects",
                    severity = Severity.MEDIUM,
                    fix = "Consider moving this logic closer to the data it uses"
                ))
            }
        }
        
        return antiPatterns
    }
    
    /**
     * Find successful patterns in codebase to suggest
     */
    fun findSuccessfulPatterns(): List<PatternSuggestion> {
        val suggestions = mutableListOf<PatternSuggestion>()
        val allFiles = getAllCodeFiles()
        val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
        
        // Find files with good patterns that are stable
        allFiles.take(100).forEach { file ->
            val stats = gitAnalyzer.getFileStats(file) ?: return@forEach
            val detection = detectPatterns(file)
            
            // If file has good patterns and is stable, suggest it
            if (detection.patterns.isNotEmpty() && stats.commits < 10 && stats.ageDays > 90) {
                detection.patterns.forEach { pattern ->
                    if (pattern.isGood) {
                        suggestions.add(PatternSuggestion(
                            pattern = pattern.type.name,
                            file = file,
                            reason = "This pattern worked well in ${file.name}",
                            benefit = "Stable implementation (${stats.ageDays} days, ${stats.commits} commits)"
                        ))
                    }
                }
            }
        }
        
        return suggestions.distinctBy { it.pattern }.take(10)
    }
    
    private fun generateSuggestions(
        patterns: List<DetectedPattern>,
        antiPatterns: List<DetectedAntiPattern>,
        file: VirtualFile
    ): List<PatternSuggestion> {
        val suggestions = mutableListOf<PatternSuggestion>()
        
        // Suggest fixes for anti-patterns
        antiPatterns.forEach { antiPattern ->
            suggestions.add(PatternSuggestion(
                pattern = antiPattern.type.name,
                file = file,
                reason = antiPattern.description,
                benefit = antiPattern.fix
            ))
        }
        
        // Suggest applying successful patterns
        val successful = findSuccessfulPatterns()
        suggestions.addAll(successful.take(3))
        
        return suggestions
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

