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

    // Onboarding Assistant Data Classes
    enum class MilestoneType {
        BIRTH, REFACTOR, BUGFIX_CLUSTER, OWNERSHIP_TRANSITION,
        ARCHITECTURE, EPOCH, DEPENDENCY, SECURITY
    }

    data class OnboardingMilestone(
        val type: MilestoneType,
        val icon: String,
        val content: String,
        val date: Date?,
        val author: String?,
        val hash: String?,
        val importance: Int
    )

    data class ExpertContact(
        val name: String,
        val ownership: Int,
        val linesOwned: Int,
        val role: String
    )

    data class RelatedFile(
        val file: String,
        val coupling: Int,
        val reason: String
    )

    data class QuickFacts(
        val age: Int,
        val totalCommits: Int,
        val contributors: Int,
        val complexity: Int
    )

    data class OnboardingRecommendations(
        val experts: List<ExpertContact>,
        val relatedFiles: List<RelatedFile>,
        val facts: QuickFacts
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

    /**
     * Elite: Generate Onboarding Tour
     * Identifies key historical turning points for new developers
     */
    fun generateOnboardingTour(file: VirtualFile): List<OnboardingMilestone> {
        val repository = GitRepositoryManager.getInstance(project).getRepositoryForFile(file) ?: return emptyList()
        val root = repository.root
        val relativePath = file.path.removePrefix(root.path).removePrefix("/")
        val milestones = mutableListOf<OnboardingMilestone>()
        val now = Date()

        // Get commit history
        val logHandler = GitLineHandler(project, root, GitCommand.LOG)
        logHandler.addParameters("--pretty=format:%H|%an|%ad|%s", "--date=iso", "--", relativePath)
        val result = Git.getInstance().runCommand(logHandler)
        
        if (!result.success() || result.output.isEmpty()) return emptyList()

        val commits = result.output.map { line ->
            val parts = line.split("|")
            mapOf(
                "hash" to parts.getOrNull(0).orEmpty(),
                "author" to parts.getOrNull(1).orEmpty(),
                "date" to parts.getOrNull(2).orEmpty(),
                "message" to parts.getOrNull(3).orEmpty()
            )
        }

        // 1. Birth - First commit
        if (commits.isNotEmpty()) {
            val firstCommit = commits.last()
            milestones.add(OnboardingMilestone(
                type = MilestoneType.BIRTH,
                icon = "🌱",
                content = "File created by ${firstCommit["author"]}",
                date = parseGitDate(firstCommit["date"] ?: ""),
                author = firstCommit["author"],
                hash = firstCommit["hash"],
                importance = 10
            ))
        }

        // 2. Major Refactors
        val refactors = commits.filter { commit ->
            val msg = commit["message"]?.lowercase() ?: ""
            msg.contains("refactor") || msg.contains("rewrite") || msg.contains("restructure")
        }.take(3)

        refactors.forEach { commit ->
            milestones.add(OnboardingMilestone(
                type = MilestoneType.REFACTOR,
                icon = "🔄",
                content = "Major refactor: ${commit["message"]?.take(100)}",
                date = parseGitDate(commit["date"] ?: ""),
                author = commit["author"],
                hash = commit["hash"],
                importance = 8
            ))
        }

        // 3. Bug Fix Clusters
        val bugFixes = commits.filter { commit ->
            val msg = commit["message"]?.lowercase() ?: ""
            msg.contains("fix") || msg.contains("bug") || msg.contains("issue") || 
            msg.contains("patch") || msg.contains("hotfix")
        }

        if (bugFixes.size > 5) {
            milestones.add(OnboardingMilestone(
                type = MilestoneType.BUGFIX_CLUSTER,
                icon = "🐛",
                content = "High bug activity period: ${bugFixes.size} fixes recorded",
                date = parseGitDate(bugFixes.firstOrNull()?.get("date") ?: ""),
                author = null,
                hash = null,
                importance = 6
            ))
        }

        // 4. Ownership Transitions
        val oneYearAgo = Date(System.currentTimeMillis() - 365L * 24 * 60 * 60 * 1000)
        val recentCommits = commits.filter { 
            val date = parseGitDate(it["date"] ?: "")
            date?.after(oneYearAgo) == true
        }
        val legacyCommits = commits.filter {
            val date = parseGitDate(it["date"] ?: "")
            date?.before(oneYearAgo) == true
        }

        val recentAuthors = recentCommits.groupingBy { it["author"] }.eachCount()
        val legacyAuthors = legacyCommits.groupingBy { it["author"] }.eachCount()
        
        val recentOwner = recentAuthors.maxByOrNull { it.value }?.key
        val legacyOwner = legacyAuthors.maxByOrNull { it.value }?.key

        if (recentOwner != null && legacyOwner != null && recentOwner != legacyOwner) {
            milestones.add(OnboardingMilestone(
                type = MilestoneType.OWNERSHIP_TRANSITION,
                icon = "👥",
                content = "Ownership transitioned from $legacyOwner to $recentOwner",
                date = oneYearAgo,
                author = null,
                hash = null,
                importance = 7
            ))
        }

        // 5. Dependency Changes
        val dependencyChanges = commits.filter { commit ->
            val msg = commit["message"]?.lowercase() ?: ""
            (msg.contains("upgrade") || msg.contains("update") || msg.contains("migrate") ||
             msg.contains("dependency") || msg.contains("package")) &&
            (msg.contains("version") || Regex("v\\d").containsMatchIn(msg) || Regex("@\\d").containsMatchIn(msg))
        }.take(2)

        dependencyChanges.forEach { commit ->
            milestones.add(OnboardingMilestone(
                type = MilestoneType.DEPENDENCY,
                icon = "📦",
                content = "Dependency update: ${commit["message"]?.take(100)}",
                date = parseGitDate(commit["date"] ?: ""),
                author = commit["author"],
                hash = commit["hash"],
                importance = 5
            ))
        }

        // 6. Security Fixes
        val securityFixes = commits.filter { commit ->
            val msg = commit["message"]?.lowercase() ?: ""
            msg.contains("security") || msg.contains("cve") || msg.contains("vulnerability") ||
            msg.contains("exploit") || msg.contains("xss") || msg.contains("injection")
        }

        securityFixes.forEach { commit ->
            milestones.add(OnboardingMilestone(
                type = MilestoneType.SECURITY,
                icon = "🔒",
                content = "Security fix: ${commit["message"]?.take(100)}",
                date = parseGitDate(commit["date"] ?: ""),
                author = commit["author"],
                hash = commit["hash"],
                importance = 10
            ))
        }

        // Sort by date (oldest first) and then by importance
        return milestones
            .sortedWith(compareBy({ it.date ?: Date(0) }, { -it.importance }))
            .take(15)
    }

    /**
     * Elite: Generate Onboarding Recommendations
     * Provides expert contacts and related files for new developers
     */
    fun generateOnboardingRecommendations(file: VirtualFile): OnboardingRecommendations {
        val busFactor = calculateBusFactor(file)
        val coupledFiles = getCoupledFiles(file)
        val stats = getFileStats(file)

        // Expert recommendations
        val experts = busFactor.contributors.take(3).map { contributor ->
            ExpertContact(
                name = contributor.name,
                ownership = contributor.percent,
                linesOwned = contributor.linesOwned,
                role = when {
                    contributor.percent > 50 -> "Primary Maintainer"
                    contributor.percent > 25 -> "Core Contributor"
                    else -> "Contributor"
                }
            )
        }

        // Related files
        val relatedFiles = coupledFiles.map { coupling ->
            RelatedFile(
                file = coupling.file,
                coupling = (coupling.frequency / 10).coerceIn(1, 10),
                reason = when {
                    coupling.frequency > 70 -> "Frequently changed together"
                    coupling.frequency > 40 -> "Often modified in same commits"
                    else -> "Related by commit history"
                }
            )
        }

        // Quick facts
        val lineCount = try {
            String(file.contentsToByteArray()).lines().size
        } catch (e: Exception) {
            0
        }

        val facts = QuickFacts(
            age = stats?.ageDays ?: 0,
            totalCommits = stats?.commits ?: 0,
            contributors = busFactor.contributors.size,
            complexity = lineCount
        )

        return OnboardingRecommendations(experts, relatedFiles, facts)
    }

    private fun parseGitDate(dateStr: String): Date? {
        return try {
            // Git ISO format: 2023-12-25 10:30:45 +0100
            val parts = dateStr.split(" ")
            if (parts.size >= 2) {
                java.sql.Timestamp.valueOf("${parts[0]} ${parts[1]}")
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }
}
