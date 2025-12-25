package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import git4idea.commands.Git
import git4idea.commands.GitCommand
import git4idea.commands.GitLineHandler
import git4idea.repo.GitRepositoryManager
import java.io.File
import java.util.*
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min

@Service(Service.Level.PROJECT)
class VestigeGitAnalyzer(private val project: Project) {

    data class FileStats(
        val commits: Int,
        val ageDays: Int,
        val topAuthor: String,
        val ownershipPercent: Int,
        val stability: Int = 100
    )

    private val analysisCache = mutableMapOf<String, FileStats>()

    fun analyzeFile(file: VirtualFile, force: Boolean = false): FileStats? {
        val repository = GitRepositoryManager.getInstance(project).getRepositoryForFile(file) ?: return null
        val root = repository.root
        
        // Get HEAD hash for cache key
        val headHandler = GitLineHandler(project, root, GitCommand.REV_PARSE)
        headHandler.addParameters("HEAD")
        val headResult = Git.getInstance().runCommand(headHandler)
        val headHash = if (headResult.success()) headResult.outputAsJoinedString else "unknown"
        val cacheKey = "${file.path}|$headHash"

        if (!force && analysisCache.containsKey(cacheKey)) {
            println("Vestige: High-speed incremental hit for ${file.name}")
            return analysisCache[cacheKey]
        }

        val stats = getFileStats(file) ?: return null
        val finalStats = stats.copy(stability = calculateStabilityScore(stats))
        
        analysisCache[cacheKey] = finalStats
        return finalStats
    }

    private fun calculateStabilityScore(stats: FileStats): Int {
        val ageFactor = min(1.0, stats.ageDays / 365.0)
        val churnFactor = max(0.0, 1.0 - (stats.commits / 100.0))
        return ( (ageFactor * 0.5 + churnFactor * 0.5) * 100 ).toInt()
    }

    data class BlameLine(
        val hash: String,
        val author: String,
        val date: Date,
        val content: String,
        val lineNo: Int
    )

    data class CouplingInfo(
        val file: String,
        val count: Int,
        val frequency: Int
    )

    data class BusFactorInfo(
        val busFactor: Int,
        val contributors: List<Contributor>,
        val risk: String
    )

    data class Contributor(
        val name: String,
        val linesOwned: Int,
        val percent: Int
    )

    data class EpochInfo(
        val name: String,
        val period: String,
        val commits: Int,
        val keywords: List<String>
    )

    fun getFileStats(file: VirtualFile): FileStats? {
        val repository = GitRepositoryManager.getInstance(project).getRepositoryForFile(file) ?: return null
        val root = repository.root
        val relativePath = file.path.removePrefix(root.path).removePrefix("/")

        val logHandler = GitLineHandler(project, root, GitCommand.LOG)
        logHandler.addParameters("--pretty=format:%H|%an|%ad", "--date=short", "--", relativePath)
        val result = Git.getInstance().runCommand(logHandler)
        
        if (!result.success() || result.output.isEmpty()) return null
        
        val lines = result.output
        val totalCommits = lines.size
        val latestParts = lines[0].split("|")
        val latestDateString = latestParts[2]
        
        val lastDate = java.sql.Date.valueOf(latestDateString)
        val ageDays = ((System.currentTimeMillis() - lastDate.time) / (1000 * 60 * 60 * 24)).toInt()

        val authors = lines.map { it.split("|")[1] }
        val authorCounts = authors.groupingBy { it }.eachCount()
        val topAuthorEntry = authorCounts.maxByOrNull { it.value }
        
        return FileStats(
            commits = totalCommits,
            ageDays = ageDays,
            topAuthor = topAuthorEntry?.key ?: "Unknown",
            ownershipPercent = if (totalCommits > 0) (topAuthorEntry!!.value * 100 / totalCommits) else 0
        )
    }

    fun calculateTechnicalDebt(file: VirtualFile): Double {
        val stats = getFileStats(file) ?: return 0.0
        val lineCount = try { String(file.contentsToByteArray()).lines().size } catch (e: Exception) { 100 }
        
        val complexityFactor = lineCount / 100.0
        val churnFactor = max(1.0, stats.commits / 5.0)
        val ageFactor = max(1.0, stats.ageDays / 30.0)
        
        return complexityFactor * churnFactor * ln(ageFactor + 1.0)
    }

    fun calculateBusFactor(file: VirtualFile): BusFactorInfo {
        val repository = GitRepositoryManager.getInstance(project).getRepositoryForFile(file) ?: return BusFactorInfo(0, emptyList(), "unknown")
        val root = repository.root
        val relativePath = file.path.removePrefix(root.path).removePrefix("/")

        val handler = GitLineHandler(project, root, GitCommand.BLAME)
        handler.addParameters("--line-porcelain", relativePath)
        val result = Git.getInstance().runCommand(handler)
        
        if (!result.success()) return BusFactorInfo(0, emptyList(), "unknown")

        val authorLines = mutableMapOf<String, Int>()
        var totalLines = 0
        
        result.output.forEach { line ->
            if (line.startsWith("author ")) {
                val author = line.substring(7)
                authorLines[author] = (authorLines[author] ?: 0) + 1
                totalLines++
            }
        }

        if (totalLines == 0) return BusFactorInfo(0, emptyList(), "unknown")

        val contributors = authorLines.entries
            .map { (name, lines) -> Contributor(name, lines, (lines * 100 / totalLines)) }
            .sortedByDescending { it.linesOwned }

        var cumulativePercent = 0
        var busFactor = 0
        for (contrib in contributors) {
            busFactor++
            cumulativePercent += contrib.percent
            if (cumulativePercent >= 50) break
        }

        val risk = when {
            busFactor == 1 -> "high"
            busFactor <= 2 -> "medium"
            else -> "low"
        }

        return BusFactorInfo(busFactor, contributors, risk)
    }

    fun getCoupledFiles(file: VirtualFile): List<CouplingInfo> {
        val repository = GitRepositoryManager.getInstance(project).getRepositoryForFile(file) ?: return emptyList()
        val root = repository.root
        val relativePath = file.path.removePrefix(root.path).removePrefix("/")

        val logHandler = GitLineHandler(project, root, GitCommand.LOG)
        logHandler.addParameters("--pretty=format:%H", "-n", "20", "--", relativePath)
        val result = Git.getInstance().runCommand(logHandler)
        
        if (!result.success()) return emptyList()

        val commitHashes = result.output
        val fileCounts = mutableMapOf<String, Int>()

        for (hash in commitHashes) {
            val showHandler = GitLineHandler(project, root, GitCommand.SHOW)
            showHandler.addParameters(hash, "--name-only", "--format=")
            val showResult = Git.getInstance().runCommand(showHandler)
            if (showResult.success()) {
                showResult.output.forEach { f ->
                    if (f.isNotEmpty() && f != relativePath) {
                        fileCounts[f] = (fileCounts[f] ?: 0) + 1
                    }
                }
            }
        }

        return fileCounts.entries
            .sortedByDescending { it.value }
            .take(3)
            .map { (f, count) -> CouplingInfo(f, count, (count * 100 / commitHashes.size)) }
    }

    fun detectEpochs(): List<EpochInfo> {
        val repositories = GitRepositoryManager.getInstance(project).repositories
        if (repositories.isEmpty()) return emptyList()
        val root = repositories[0].root

        val logHandler = GitLineHandler(project, root, GitCommand.LOG)
        logHandler.addParameters("--pretty=format:%ad|%s", "--date=short", "-n", "500")
        val result = Git.getInstance().runCommand(logHandler)
        
        if (!result.success()) return emptyList()

        val monthlyGroups = mutableMapOf<String, MutableList<String>>()
        result.output.forEach { line ->
            val parts = line.split("|")
            if (parts.size >= 2) {
                val date = parts[0]
                val monthKey = date.substring(0, 7) // YYYY-MM
                monthlyGroups.getOrPut(monthKey) { mutableListOf() }.add(parts[1])
            }
        }

        val epochs = mutableListOf<EpochInfo>()
        val avgCommits = result.output.size.toDouble() / max(1, monthlyGroups.size)
        
        monthlyGroups.forEach { (month, messages) ->
            if (messages.size > avgCommits * 2) {
                epochs.add(EpochInfo("High Activity", month, messages.size, emptyList()))
            }
        }

        return epochs
    }
    
    // Additional Ported Logic
    fun calculateOriginalityIndex(file: VirtualFile): Int {
        val stats = getFileStats(file) ?: return 100
        val twoYearsAgo = System.currentTimeMillis() - (2L * 365 * 24 * 60 * 60 * 1000)
        
        // This is a simplified proxy since getting full blame for every line is expensive
        // In the VS Code version, it checks if the latest commit date for a line is > 2 years
        return if (stats.ageDays > 730) 100 else 50 // Placeholder logic
    }

    // Elite: Advanced Specialized Methods
    fun findDeletedFiles(): List<Map<String, String>> {
        val root = project.basePath?.let { File(it) } ?: return emptyList()
        val handler = GitLineHandler(project, root, GitCommand.LOG)
        handler.addParameters("--diff-filter=D", "--summary", "--pretty=format:%H|%an|%ad", "--date=short")
        val result = Git.getInstance().runCommand(handler)
        
        val deleted = mutableListOf<Map<String, String>>()
        if (result.success()) {
            result.output.forEach { line ->
                if (line.contains("|")) {
                    val parts = line.split("|")
                    deleted.add(mapOf("hash" to parts[0], "author" to parts[1], "date" to parts[2]))
                }
            }
        }
        return deleted.take(50)
    }

    fun findBugPatterns(file: VirtualFile): Map<String, Any>? {
        val repository = GitRepositoryManager.getInstance(project).getRepositoryForFile(file) ?: return null
        val root = repository.root
        val relativePath = file.path.removePrefix(root.path).removePrefix("/")

        val handler = GitLineHandler(project, root, GitCommand.LOG)
        handler.addParameters("--pretty=format:%s", relativePath)
        val result = Git.getInstance().runCommand(handler)
        
        if (!result.success()) return null
        
        val bugKeywords = listOf("fix", "bug", "issue", "error", "crash")
        val bugCommits = result.output.filter { msg -> bugKeywords.any { msg.contains(it, ignoreCase = true) } }
        
        return mapOf(
            "bugCount" to bugCommits.size,
            "totalCommits" to result.output.size,
            "density" to if (result.output.isNotEmpty()) bugCommits.size.toDouble() / result.output.size else 0.0
        )
    }

    fun detectZombieCode(): List<Map<String, Any>> {
        // Simplified zombie detection: find files not modified in 1 year
        val rootPath = project.basePath ?: return emptyList()
        val root = File(rootPath)
        val handler = GitLineHandler(project, root, GitCommand.LS_FILES)
        val result = Git.getInstance().runCommand(handler)
        
        val zombies = mutableListOf<Map<String, Any>>()
        if (result.success()) {
            val now = System.currentTimeMillis()
            result.output.take(50).forEach { filePath ->
                val virtualFile = rootPath.let { path -> com.intellij.openapi.vfs.LocalFileSystem.getInstance().findFileByPath("$path/$filePath") }
                if (virtualFile != null) {
                    val stats = getFileStats(virtualFile)
                    if (stats != null && stats.ageDays > 365) {
                        zombies.add(mapOf("file" to filePath, "ageDays" to stats.ageDays))
                    }
                }
            }
        }
        return zombies
    }

    fun detectHotPotato(): List<Map<String, Any>> {
        // Files with high author turnover
        val rootPath = project.basePath ?: return emptyList()
        val root = File(rootPath)
        val handler = GitLineHandler(project, root, GitCommand.LS_FILES)
        val result = Git.getInstance().runCommand(handler)
        
        val hotPotatoes = mutableListOf<Map<String, Any>>()
        if (result.success()) {
            result.output.take(30).forEach { filePath ->
                val virtualFile = rootPath.let { path -> com.intellij.openapi.vfs.LocalFileSystem.getInstance().findFileByPath("$path/$filePath") }
                if (virtualFile != null) {
                    val handler2 = GitLineHandler(project, root, GitCommand.LOG)
                    handler2.addParameters("--pretty=format:%an", "--", filePath)
                    val result2 = Git.getInstance().runCommand(handler2)
                    if (result2.success()) {
                        val authors = result2.output.toSet()
                        if (authors.size > 5) {
                            hotPotatoes.add(mapOf("file" to filePath, "authorCount" to authors.size))
                        }
                    }
                }
            }
        }
        return hotPotatoes
    }
}
