package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import org.eclipse.jgit.api.Git
import org.eclipse.jgit.api.errors.GitAPIException
import org.eclipse.jgit.diff.DiffEntry
import org.eclipse.jgit.lib.ObjectId
import org.eclipse.jgit.lib.Repository
import org.eclipse.jgit.revwalk.RevCommit
import org.eclipse.jgit.revwalk.RevWalk
import org.eclipse.jgit.treewalk.AbstractTreeIterator
import org.eclipse.jgit.treewalk.CanonicalTreeParser
import org.eclipse.jgit.treewalk.filter.PathFilter
import org.eclipse.jgit.storage.file.FileRepositoryBuilder

import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.*
import com.intellij.openapi.vfs.VirtualFileManager
import java.io.File
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

// Extension function to convert File to VirtualFile
private fun File.toVirtualFile(project: Project) =
    VirtualFileManager.getInstance().findFileByNioPath(this.toPath()) ?: 
    VirtualFileManager.getInstance().findFileByUrl("file://${this.absolutePath}")

@Service(Service.Level.PROJECT)
class VestigeGitAnalyzer(private val project: Project) {

    data class FileStats(
        val commits: Int,
        val ageDays: Int,
        val topAuthor: String,
        val ownershipPercent: Int,
        val lastModifiedDate: Date,
        val stability: Int = 100
    )

    private val analysisCache = mutableMapOf<String, FileStats>()
    private val gitCache = mutableMapOf<String, Git?>()

    private fun getGitRepo(file: VirtualFile): Git? {
        val projectBase = project.basePath ?: return null
        
        // Search up from the file's location to find the nearest .git directory
        var current: File? = File(file.path).parentFile
        while (current != null && current.path.startsWith(projectBase)) {
            val gitDir = File(current, ".git")
            if (gitDir.exists() && gitDir.isDirectory) {
                val repoRoot = current.absolutePath
                return gitCache.getOrPut(repoRoot) {
                    try {
                        val repository = FileRepositoryBuilder()
                            .setGitDir(gitDir)
                            .readEnvironment()
                            .build()
                        Git(repository)
                    } catch (e: Exception) {
                        null
                    }
                }
            }
            current = current.parentFile
        }
        
        // Fallback: check project root
        return gitCache.getOrPut(projectBase) {
            try {
                val repository = FileRepositoryBuilder()
                    .setGitDir(File(projectBase, ".git"))
                    .readEnvironment()
                    .findGitDir()
                    .build()
                Git(repository)
            } catch (e: Exception) {
                null
            }
        }
    }

    fun analyzeFile(file: VirtualFile, force: Boolean = false): FileStats? {
        val git = getGitRepo(file) ?: return null
        val repo = git.repository
        val filePath = file.path.substring(repo.directory.parent.length + 1)
        val cacheKey = "${file.path}|${repo.fullBranch}"

        if (!force && analysisCache.containsKey(cacheKey)) {
            return analysisCache[cacheKey]
        }

        return try {
            val log = git.log()
                .addPath(filePath)
                .call()
                .toList()

            if (log.isEmpty()) {
                return null
            }

            val now = System.currentTimeMillis()
            val firstCommit = log.last()
            val lastCommit = log.first()
            val ageDays = ChronoUnit.DAYS.between(
                Instant.ofEpochMilli(firstCommit.commitTime.toLong() * 1000).atZone(ZoneId.systemDefault()).toLocalDate(),
                LocalDate.now()
            ).toInt()

            val authors = log.groupBy { it.authorIdent.name }
            val topAuthor = authors.maxByOrNull { it.value.size }?.key ?: "Unknown"
            val authorCommits = authors[topAuthor]?.size ?: 0
            val ownershipPercent = (authorCommits.toDouble() / log.size * 100).toInt()

            val stats = FileStats(
                commits = log.size,
                ageDays = ageDays,
                topAuthor = topAuthor,
                ownershipPercent = ownershipPercent,
                lastModifiedDate = Date(lastCommit.commitTime.toLong() * 1000L)
            )

            analysisCache[cacheKey] = stats
            stats
        } catch (e: Exception) {
            null
        }
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

    private fun prepareTreeParser(repository: Repository, objectId: String): AbstractTreeIterator {
        val walk = RevWalk(repository)
        val commit = walk.parseCommit(repository.resolve(objectId))
        val tree = commit.tree ?: throw IllegalStateException("No tree found for commit $objectId")
        val reader = repository.newObjectReader()
        return CanonicalTreeParser().apply {
            this.reset(reader, tree)
        }
    }
    
    private fun calculateActualBusFactor(contributors: List<Contributor>): Int {
        var total = 0
        contributors.forEachIndexed { index, contributor ->
            total += contributor.percent
            if (total >= 50) {
                return index + 1
            }
        }
        return contributors.size
    }

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

    data class CommitInfo(
        val hash: String,
        val author: String,
        val date: Date,
        val message: String
    )

    fun getFileHistory(file: VirtualFile, count: Int = 20): List<CommitInfo> {
        val git = getGitRepo(file) ?: return emptyList()
        val repo = git.repository
        val filePath = file.path.substring(repo.directory.parent.length + 1)

        return try {
            git.log()
                .addPath(filePath)
                .setMaxCount(count)
                .call()
                .map { commit ->
                    CommitInfo(
                        hash = commit.name,
                        author = commit.authorIdent.name,
                        date = Date(commit.commitTime * 1000L),
                        message = commit.shortMessage
                    )
                }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun getFileStats(file: VirtualFile): FileStats? {
        val git = getGitRepo(file) ?: return null
        val repo = git.repository
        val filePath = file.path.substring(repo.directory.parent.length + 1)

        return try {
            val log = git.log()
                .addPath(filePath)
                .call()
                .toList()

            if (log.isEmpty()) {
                return null
            }

            val firstCommit = log.last()
            val lastCommit = log.first()
            
            // Calculate age in days
            val ageDays = ChronoUnit.DAYS.between(
                Instant.ofEpochMilli(firstCommit.commitTime.toLong() * 1000)
                    .atZone(ZoneId.systemDefault())
                    .toLocalDate(),
                LocalDate.now()
            ).toInt()

            // Calculate author statistics
            val authors = log.groupBy { it.authorIdent.name }
            val topAuthor = authors.maxByOrNull { it.value.size }?.key ?: "Unknown"
            val authorCommits = authors[topAuthor]?.size ?: 0
            val ownershipPercent = (authorCommits.toDouble() / log.size * 100).toInt()

            FileStats(
                commits = log.size,
                ageDays = ageDays,
                topAuthor = topAuthor,
                ownershipPercent = ownershipPercent,
                lastModifiedDate = Date(lastCommit.commitTime.toLong() * 1000L)
            )
        } catch (e: Exception) {
            null
        }

    }

    fun calculateTechnicalDebt(file: VirtualFile): Double {
        val stats = getFileStats(file) ?: return 0.0
        val lineCount = try { 
            String(file.contentsToByteArray()).lines().size 
        } catch (e: Exception) { 
            100 
        }
        
        val complexityFactor = lineCount / 100.0
        val churnFactor = max(1.0, stats.commits / 5.0)
        val ageFactor = max(1.0, stats.ageDays / 30.0)
        
        return complexityFactor * churnFactor * ln(ageFactor + 1.0)
    }

    fun calculateBusFactor(file: VirtualFile): BusFactorInfo {
        val git = getGitRepo(file) ?: return BusFactorInfo(0, emptyList(), "unknown")
        val repo = git.repository
        val filePath = file.path.substring(repo.directory.parent.length + 1)
        
        return try {
            // Get the commit history for the file
            val log = git.log()
                .addPath(filePath)
                .call()
                .toList()
                
            if (log.isEmpty()) {
                return BusFactorInfo(0, emptyList(), "no_commits")
            }
            
            // Group commits by author
            val authors = log.groupBy { it.authorIdent.name }
            val totalCommits = log.size
            
            // Calculate contributions per author
            val contributors = authors.map { (name, commits) ->
                val lines = commits.flatMap { commit -> 
                    try {
                        git.diff()
                            .setOldTree(prepareTreeParser(repo, "${commit.name}~1"))
                            .setNewTree(prepareTreeParser(repo, commit.name))
                            .setPathFilter(PathFilter.create(filePath))
                            .call()
                            .mapNotNull { diffEntry -> 
                                // Only count added lines
                                if (diffEntry.changeType == DiffEntry.ChangeType.ADD) {
                                    diffEntry.newId.name()
                                } else null
                            }
                    } catch (e: Exception) {
                        emptyList()
                    }
                }.size
                
                // Calculate percentage of commits by this author
                val commitPercentage = (commits.size * 100) / totalCommits
                Contributor(name, lines, commitPercentage)
            }.sortedByDescending { it.percent }
            
            // Calculate bus factor
            val busFactor = calculateActualBusFactor(contributors)
            
            // Determine risk level
            val risk = when {
                busFactor <= 1 -> "critical"
                busFactor <= 2 -> "high"
                busFactor <= 3 -> "medium"
                else -> "low"
            }
            
            // Return top 5 contributors
            BusFactorInfo(busFactor, contributors.take(5), risk)
        } catch (e: Exception) {
            // Log the error and return unknown status
            println("Error calculating bus factor: ${e.message}")
            BusFactorInfo(0, emptyList(), "error")
        }
    }


    fun getCoupledFiles(file: VirtualFile): List<CouplingInfo> {
        val git = getGitRepo(file) ?: return emptyList()
        val repo = git.repository
        val filePath = file.path.substring(repo.directory.parent.length + 1)
        
        return try {
            // Get the commit history for the file (last 20 commits)
            val commits = git.log()
                .addPath(filePath)
                .setMaxCount(20)
                .call()
                .toList()
                
            if (commits.isEmpty()) {
                return emptyList()
            }
            
            val fileCounts = mutableMapOf<String, Int>()
            
            // For each commit, get the list of changed files
            for (commit in commits) {
                val diff = git.diff()
                    .setOldTree(prepareTreeParser(repo, "${commit.name}~1"))
                    .setNewTree(prepareTreeParser(repo, commit.name))
                    .call()
                    
                diff.forEach { diffEntry ->
                    val changedFile = diffEntry.newPath
                    if (changedFile.isNotEmpty() && changedFile != filePath) {
                        fileCounts[changedFile] = (fileCounts[changedFile] ?: 0) + 1
                    }
                }
            }
            
            // Return top 3 most frequently changed files with this one
            fileCounts.entries
                .sortedByDescending { it.value }
                .take(3)
                .map { (file, count) -> 
                    CouplingInfo(file, count, (count * 100 / commits.size)) 
                }
        } catch (e: Exception) {
            println("Error finding coupled files: ${e.message}")
            emptyList()
        }
    }

    fun detectEpochs(): List<EpochInfo> {
        // Get the project's base directory
        val baseDir = File(project.basePath ?: return emptyList())
        val vFile = baseDir.toVirtualFile(project) ?: return emptyList()
        val git = getGitRepo(vFile) ?: return emptyList()
        
        return try {
            // Get the commit history (last 500 commits)
            val commits = git.log()
                .setMaxCount(500)
                .call()
                .toList()
                .map { commit ->
                    val date = Instant.ofEpochMilli(commit.commitTime.toLong() * 1000)
                        .atZone(ZoneId.systemDefault())
                        .toLocalDate()
                    val message = commit.fullMessage.trim()
                    date to message
                }
                .sortedBy { it.first } // Sort by date ascending

            if (commits.size < 2) return emptyList()

            // Calculate time differences between consecutive commits
            val timeDiffs = commits.zipWithNext { (date1, _), (date2, _) -> 
                ChronoUnit.DAYS.between(date1, date2).toDouble()
            }
            
            // Calculate statistics for epoch detection
            val mean = timeDiffs.average()
            val variance = timeDiffs.map { (it - mean) * (it - mean) }.average()
            val stdDev = sqrt(variance)
            val threshold = mean + 2 * stdDev

            // Detect epochs based on commit time gaps
            val epochs = mutableListOf<EpochInfo>()
            var currentEpochStart = commits.first().first
            var currentEpochCommits = 0
            val commitMessages = mutableListOf<String>()

            for (i in timeDiffs.indices) {
                currentEpochCommits++
                commitMessages.add(commits[i].second)
                
                if (timeDiffs[i] > threshold) {
                    val period = "${currentEpochStart} to ${commits[i].first}"
                    val keywords = extractKeywords(commitMessages)
                    epochs.add(EpochInfo(
                        "Epoch ${epochs.size + 1}", 
                        period, 
                        currentEpochCommits, 
                        keywords.take(5) // Limit to top 5 keywords
                    ))
                    currentEpochStart = commits[i + 1].first
                    currentEpochCommits = 0
                    commitMessages.clear()
                }
            }

            // Add the last epoch
            if (currentEpochCommits > 0) {
                val period = "${currentEpochStart} to ${commits.last().first}"
                val keywords = extractKeywords(commitMessages)
                epochs.add(EpochInfo(
                    "Epoch ${epochs.size + 1}", 
                    period, 
                    currentEpochCommits, 
                    keywords.take(5)
                ))
            }

            epochs
        } catch (e: Exception) {
            println("Error detecting epochs: ${e.message}")
            emptyList()
        }
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
        val git = getGitRepo(project.basePath?.let { File(it).toVirtualFile(project) } ?: return emptyList()) ?: return emptyList()
        
        return try {
            // Get the log of deleted files
            val logs = git.log()
                .setMaxCount(50)
                .call()
                .flatMap { commit ->
                    val diffs = git.diff()
                        .setOldTree(prepareTreeParser(git.repository, "${commit.name}~1"))
                        .setNewTree(prepareTreeParser(git.repository, commit.name))
                        .call()
                    
                    diffs.filter { it.changeType == DiffEntry.ChangeType.DELETE }.map { diff ->
                        mapOf(
                            "hash" to commit.name,
                            "author" to commit.authorIdent.name,
                            "date" to Instant.ofEpochMilli(commit.commitTime.toLong() * 1000)
                                .atZone(ZoneId.systemDefault())
                                .toLocalDate()
                                .toString(),
                            "file" to diff.oldPath
                        )
                    }
                }
            
            logs.distinctBy { it["file"] } // Remove duplicates
        } catch (e: Exception) {
            println("Error finding deleted files: ${e.message}")
            emptyList()
        }
    }

    fun findBugPatterns(file: VirtualFile): Map<String, Any>? {
        val git = getGitRepo(file) ?: return null
        val repo = git.repository
        val filePath = file.path.substring(repo.directory.parent.length + 1)
        
        return try {
            // Get commit messages for the file
            val logs = git.log()
                .addPath(filePath)
                .call()
                .map { it.fullMessage.trim() }
            
            if (logs.isEmpty()) return null
            
            val bugKeywords = listOf("fix", "bug", "issue", "error", "crash")
            val bugCommits = logs.filter { msg -> 
                bugKeywords.any { keyword -> 
                    msg.contains(keyword, ignoreCase = true) 
                } 
            }
            
            mapOf(
                "bugCount" to bugCommits.size,
                "totalCommits" to logs.size,
                "density" to if (logs.isNotEmpty()) bugCommits.size.toDouble() / logs.size else 0.0
            )
        } catch (e: Exception) {
            println("Error finding bug patterns: ${e.message}")
            null
        }
    }

    fun detectZombieCode(): List<Map<String, Any>> {
        val git = getGitRepo(project.basePath?.let { File(it).toVirtualFile(project) } ?: return emptyList()) ?: return emptyList()
        
        return try {
            // Get all files in the repository
            val fileTreeWalk = git.repository.let { repo ->
                val treeWalk = org.eclipse.jgit.treewalk.TreeWalk(repo)
                treeWalk.addTree(repo.resolve(org.eclipse.jgit.lib.Constants.HEAD))
                treeWalk.isRecursive = true
                treeWalk
            }
            
            val zombies = mutableListOf<Map<String, Any>>()
            val oneYearAgo = System.currentTimeMillis() - (365L * 24 * 60 * 60 * 1000)
            
            // Check each file's last modification time
            while (fileTreeWalk.next() && zombies.size < 50) {
                val path = fileTreeWalk.pathString
                if (!fileTreeWalk.isSubtree) {
                    val lastCommit = git.log()
                        .addPath(path)
                        .setMaxCount(1)
                        .call()
                        .firstOrNull()
                    
                    // If the file hasn't been modified in over a year, it's a zombie
                    lastCommit?.let { commit ->
                        val lastModified = commit.commitTime * 1000L
                        if (lastModified < oneYearAgo) {
                            val ageDays = (System.currentTimeMillis() - lastModified) / (1000 * 60 * 60 * 24)
                            zombies.add(mapOf(
                                "file" to path,
                                "ageDays" to ageDays,
                                "lastModified" to Date(lastModified).toString()
                            ))
                        }
                    }
                }
            }
            
            zombies.sortedByDescending { it["ageDays"] as Long }
        } catch (e: Exception) {
            println("Error detecting zombie code: ${e.message}")
            emptyList()
        }
    }

    fun detectHotPotato(): List<Map<String, Any>> {
        val git = getGitRepo(project.basePath?.let { File(it).toVirtualFile(project) } ?: return emptyList()) ?: return emptyList()
        
        return try {
            // Get all files in the repository
            val fileTreeWalk = git.repository.let { repo ->
                val treeWalk = org.eclipse.jgit.treewalk.TreeWalk(repo)
                treeWalk.addTree(repo.resolve(org.eclipse.jgit.lib.Constants.HEAD))
                treeWalk.isRecursive = true
                treeWalk
            }
            
            val hotPotatoes = mutableListOf<Map<String, Any>>()
            
            // Check each file's author count
            while (fileTreeWalk.next() && hotPotatoes.size < 30) {
                val path = fileTreeWalk.pathString
                if (!fileTreeWalk.isSubtree) {
                    // Get all commits for this file
                    val commits = git.log()
                        .addPath(path)
                        .call()
                        .toList()
                    
                    if (commits.isNotEmpty()) {
                        // Count unique authors
                        val authorCount = commits.map { it.authorIdent.name }.distinct().size
                        
                        // If more than 5 authors, it's a hot potato
                        if (authorCount > 5) {
                            hotPotatoes.add(mapOf(
                                "file" to path,
                                "authorCount" to authorCount,
                                "commitCount" to commits.size
                            ))
                        }
                    }
                }
            }
            
            // Sort by author count in descending order
            hotPotatoes.sortedByDescending { it["authorCount"] as Int }
        } catch (e: Exception) {
            println("Error detecting hot potato files: ${e.message}")
            emptyList()
        }
    }

    fun generateOnboardingTour(file: VirtualFile): List<OnboardingMilestone> {
        val git = getGitRepo(file) ?: return emptyList()
        val repo = git.repository
        val filePath = file.path.substring(repo.directory.parent.length + 1)
        
        val commits = try {
             git.log()
                .addPath(filePath)
                .call()
                .map { commit -> 
                    mapOf(
                        "hash" to commit.name,
                        "author" to commit.authorIdent.name,
                        "date" to Date(commit.commitTime * 1000L),
                        "message" to commit.fullMessage
                    )
                }
        } catch (e: Exception) {
            emptyList()
        }

        if (commits.isEmpty()) return emptyList()

        val milestones = mutableListOf<OnboardingMilestone>()
        
        // Add file creation as first milestone
        milestones.add(OnboardingMilestone(
            type = MilestoneType.BIRTH,
            icon = "",
            content = "File was created",
            date = commits.last()["date"] as Date,
            author = commits.last()["author"] as String,
            hash = commits.last()["hash"] as String,
            importance = 10
        ))
        
        // Look for major refactoring (large changes)
        val largeChanges = commits.windowed(2).filter { (prev, curr) ->
            val diff = git.diff()
                .setOldTree(prepareTreeParser(repo, "${curr["hash"]}^"))
                .setNewTree(prepareTreeParser(repo, curr["hash"] as String))
                .call()
            
            diff.any { diffEntry -> 
                diffEntry.changeType == DiffEntry.ChangeType.MODIFY && 
                diffEntry.oldPath == filePath
            }
        }.take(3) // Limit to top 3 largest changes
        
        largeChanges.forEachIndexed { index, (_, curr) ->
            milestones.add(OnboardingMilestone(
                type = MilestoneType.REFACTOR,
                icon = "",
                content = "Major refactoring occurred",
                date = curr["date"] as Date,
                author = curr["author"] as String,
                hash = curr["hash"] as String,
                importance = 8 - (index * 2) // Decrease importance for subsequent refactorings
            ))
        }
        
        // Look for bug fixes
        val bugFixes = commits.filter { commit ->
            val message = commit["message"] as String
            message.matches("(?i).* (fix|bug|issue|error|crash).*".toRegex())
        }.take(3) // Limit to 3 most recent bug fixes
            
        bugFixes.forEach { commit ->
            milestones.add(OnboardingMilestone(
                type = MilestoneType.BUGFIX_CLUSTER,
                icon = "",
                content = "Bug fix: ${(commit["message"] as String).take(50)}...",
                date = commit["date"] as Date,
                author = commit["author"] as String,
                hash = commit["hash"] as String,
                importance = 7
            ))
        }

        // 5. Dependency Changes
        val dependencyChanges = commits.filter { commit ->
            val msg = (commit["message"] as String).lowercase()
            (msg.contains("upgrade") || msg.contains("update") || msg.contains("migrate") ||
             msg.contains("dependency") || msg.contains("package")) &&
            (msg.contains("version") || Regex("v\\d").containsMatchIn(msg) || Regex("@\\d").containsMatchIn(msg))
        }.take(2)

        dependencyChanges.forEach { commit ->
            milestones.add(OnboardingMilestone(
                type = MilestoneType.DEPENDENCY,
                icon = "📦",
                content = "Dependency update: ${(commit["message"] as String).take(100)}",
                date = commit["date"] as Date,
                author = commit["author"] as String,
                hash = commit["hash"] as String,
                importance = 5
            ))
        }

        // 6. Security Fixes
        val securityFixes = commits.filter { commit ->
            val msg = (commit["message"] as String).lowercase()
            msg.contains("security") || msg.contains("cve") || msg.contains("vulnerability") ||
            msg.contains("exploit") || msg.contains("xss") || msg.contains("injection")
        }

        securityFixes.forEach { commit ->
            milestones.add(OnboardingMilestone(
                type = MilestoneType.SECURITY,
                icon = "🔒",
                content = "Security fix: ${(commit["message"] as String).take(100)}",
                date = commit["date"] as Date,
                author = commit["author"] as String,
                hash = commit["hash"] as String,
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
    private fun extractKeywords(messages: List<String>): List<String> {
        val stopWords = setOf("the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "up", "about", "into", "over", "after", "fix", "chore", "feat", "docs", "style", "refactor", "perf", "test", "merge", "branch")
        val wordCounts = mutableMapOf<String, Int>()
        
        messages.forEach { msg ->
            msg.lowercase()
                .split(Regex("[^a-z0-9]"))
                .filter { it.length > 3 && !stopWords.contains(it) }
                .forEach { word ->
                    wordCounts[word] = (wordCounts[word] ?: 0) + 1
                }
        }
        
        return wordCounts.entries
            .sortedByDescending { it.value }
            .map { it.key }
    }
}
