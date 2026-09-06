package com.codecharlan.vestige.logic

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import org.eclipse.jgit.api.Git
import org.eclipse.jgit.api.errors.GitAPIException
import org.eclipse.jgit.diff.DiffEntry
import org.eclipse.jgit.lib.ObjectId
import org.eclipse.jgit.lib.ObjectReader
import org.eclipse.jgit.lib.Repository
import org.eclipse.jgit.revwalk.RevCommit
import org.eclipse.jgit.revwalk.RevWalk
import org.eclipse.jgit.treewalk.AbstractTreeIterator
import org.eclipse.jgit.treewalk.CanonicalTreeParser
import org.eclipse.jgit.treewalk.TreeWalk
import org.eclipse.jgit.treewalk.filter.PathFilter
import com.intellij.openapi.vfs.VirtualFileManager
import org.eclipse.jgit.storage.file.FileRepositoryBuilder
import java.util.concurrent.ConcurrentHashMap
import java.io.File
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.*
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

// Extension function to convert File to VirtualFile
private fun File.toVirtualFile(project: Project) =
    VirtualFileManager.getInstance().findFileByNioPath(this.toPath()) ?: 
    VirtualFileManager.getInstance().findFileByUrl("file://${this.absolutePath}")

@Service(Service.Level.PROJECT)
class VestigeGitAnalyzer(private val project: Project) : Disposable {

    private val log = Logger.getInstance(VestigeGitAnalyzer::class.java)

    companion object {
        /**
         * Hard cap on commits walked for a single file's history.
         *
         * Every one of these walks is reached from `VestigeService.computeAnalysisSync`,
         * i.e. on every editor tab switch and every save, so an unbounded
         * O(all commits) walk here is felt directly as IDE sluggishness. For a
         * file with more than this many commits the reported `commits` count and
         * `ageDays` describe the most recent [MAX_FILE_HISTORY_COMMITS] commits
         * rather than the whole history — a bounded approximation is preferred
         * over an unbounded walk.
         */
        private const val MAX_FILE_HISTORY_COMMITS = 500

        /** Cap on commits walked for project-wide (not per-file) history scans. */
        private const val MAX_PROJECT_COMMITS = 500

        /** Commits inspected when computing change-coupling for one file. */
        private const val MAX_COUPLING_COMMITS = 20

        /** Cap on diff entries read out of a single commit. */
        private const val MAX_DIFF_ENTRIES_PER_COMMIT = 500

        /** Commits scanned when looking for deleted files. */
        private const val MAX_DELETED_SCAN_COMMITS = 50

        /** Cap on reported deleted files. */
        private const val MAX_DELETED_RESULTS = 100

        /**
         * Cap on files examined by the project-wide per-file scans
         * ([detectZombieCode] / [detectHotPotato]). Each examined file costs its
         * own history walk, so this bounds an O(files x commits) product.
         */
        private const val MAX_SCANNED_TREE_FILES = 300

        /** Wall-clock budget for the project-wide per-file scans. */
        private const val SCAN_BUDGET_MS = 5_000L

        /** Files larger than this are not read into memory for line counting. */
        private const val MAX_TEXT_BYTES = 1L * 1024 * 1024

        /** Directories never descended into by tree scans. */
        private val SKIP_DIRS = setOf(
            "node_modules", "build", "out", "dist", "target",
            "vendor", "__pycache__", ".gradle"
        )

        // Compiled once. Each of these was previously constructed inside a
        // per-commit or per-message loop body.
        // Matched with containsMatchIn, not matches(): commit messages are
        // multiline and "." does not cross newlines.
        private val RE_BUGFIX_MESSAGE = Regex("(?i)\\b(fix|bug|issue|error|crash)\\b")
        private val RE_REFACTOR_MESSAGE =
            Regex("(?i)\\b(refactor|restructure|rewrite|extract|cleanup|clean-up|simplify)\\b")
        private val RE_VERSION_TAG = Regex("v\\d")
        private val RE_AT_VERSION = Regex("@\\d")
        private val RE_NON_WORD = Regex("[^a-z0-9]")

        private val KEYWORD_STOP_WORDS = setOf(
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of",
            "with", "by", "from", "up", "about", "into", "over", "after", "fix", "chore",
            "feat", "docs", "style", "refactor", "perf", "test", "merge", "branch"
        )
    }

    /** True when [path] lies inside a directory that tree scans skip. */
    private fun isSkippedPath(path: String): Boolean =
        path.splitToSequence('/').any { it in SKIP_DIRS || (it.startsWith(".") && it != "." && it != "..") }

    /**
     * Returns the repo-relative path of [file] (with '/' separators), or null when the
     * file is not located under the repository's working tree.
     */
    private fun relativizePath(repo: Repository, file: VirtualFile): String? {
        val workTree = repo.directory.parentFile ?: return null
        return try {
            val repoPath = workTree.toPath().toAbsolutePath().normalize()
            val filePath = java.nio.file.Paths.get(file.path).toAbsolutePath().normalize()
            if (!filePath.startsWith(repoPath)) return null
            val relative = repoPath.relativize(filePath).toString().replace(File.separatorChar, '/')
            relative.ifEmpty { null }
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    data class FileStats(
        val commits: Int,
        val ageDays: Int,
        val topAuthor: String,
        val ownershipPercent: Int,
        val lastModifiedDate: Date,
        val stability: Int = 100
    )

    private val gitCache = ConcurrentHashMap<String, Git>()

    /**
     * Directory path -> resolved repository root.
     *
     * Without this, every call re-probed the filesystem (`File.exists` +
     * `isDirectory` per parent level) before it ever consulted [gitCache].
     * Some call paths reach this from the EDT, so the probe is on a latency path.
     */
    private val repoRootCache = ConcurrentHashMap<String, String>()

    override fun dispose() {
        gitCache.values.forEach { git ->
            try {
                git.repository.close()
                git.close()
            } catch (e: Exception) {
                // Ignore close errors. Deliberately NOT rethrowing
                // ProcessCanceledException here: nothing inside is cancellable,
                // and letting anything escape would abandon the remaining
                // repositories unclosed.
            }
        }
        gitCache.clear()
        repoRootCache.clear()
    }

    private fun getGitRepo(file: VirtualFile): Git? {
        val projectBase = project.basePath ?: return null
        val startDir = File(file.path).parentFile

        // Fast path: cache lookup BEFORE any filesystem probing. The repo root
        // for this directory is already known and its Git instance is live.
        if (startDir != null) {
            repoRootCache[startDir.path]?.let { root -> gitCache[root]?.let { return it } }
        }

        // Search up from the file's location to find the nearest .git directory
        var cursor: File? = startDir
        while (cursor != null && cursor.path.startsWith(projectBase)) {
            ProgressManager.checkCanceled()
            val current: File = cursor

            // Consult the cache at each level before touching the filesystem.
            val cachedAtLevel = gitCache[current.absolutePath]
            if (cachedAtLevel != null) {
                startDir?.let { repoRootCache[it.path] = current.absolutePath }
                return cachedAtLevel
            }

            val gitDir = File(current, ".git")
            if (gitDir.exists() && gitDir.isDirectory) {
                val repoRoot = current.absolutePath
                startDir?.let { repoRootCache[it.path] = repoRoot }

                // Try to create new instance
                val newGit = try {
                    val repository = FileRepositoryBuilder()
                        .setGitDir(gitDir)
                        .readEnvironment()
                        .build()
                    Git(repository)
                } catch (e: ProcessCanceledException) {
                    throw e
                } catch (e: Exception) {
                    null
                }
                
                if (newGit != null) {
                    val existing = gitCache.putIfAbsent(repoRoot, newGit)
                    if (existing != null) {
                        try { newGit.close() } catch (ignored: Exception) {}
                        return existing
                    }
                    return newGit
                }
            }
            cursor = current.parentFile
        }

        // Fallback: check project root
        val cached = gitCache[projectBase]
        if (cached != null) return cached

        val newGit = try {
            val repository = FileRepositoryBuilder()
                .setGitDir(File(projectBase, ".git"))
                .readEnvironment()
                .findGitDir()
                .build()
            Git(repository)
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            null
        }
        
        if (newGit != null) {
            val existing = gitCache.putIfAbsent(projectBase, newGit)
            if (existing != null) {
                try { newGit.close() } catch (ignored: Exception) {}
                return existing
            }
            return newGit
        }
        
        return null
    }

    /**
     * The commits touching [filePath], newest first, bounded to [max].
     *
     * Every history read in this class funnels through here so that no walk can
     * be unbounded. `setMaxCount` installs JGit's `MaxCountRevFilter`, which
     * aborts the walk (via `StopWalkException`) once the limit is reached rather
     * than merely truncating the result.
     */
    private fun fileHistory(
        git: Git,
        filePath: String,
        max: Int = MAX_FILE_HISTORY_COMMITS
    ): List<RevCommit> {
        ProgressManager.checkCanceled()
        val commits = ArrayList<RevCommit>(minOf(max, 64))
        for (commit in git.log().addPath(filePath).setMaxCount(max).call()) {
            ProgressManager.checkCanceled()
            commits.add(commit)
            if (commits.size >= max) break
        }
        return commits
    }

    /** Derives [FileStats] from an already-bounded, newest-first commit list. */
    private fun statsFrom(commits: List<RevCommit>): FileStats? {
        if (commits.isEmpty()) return null

        val firstCommit = commits.last()
        val lastCommit = commits.first()
        val ageDays = ChronoUnit.DAYS.between(
            Instant.ofEpochMilli(firstCommit.commitTime.toLong() * 1000)
                .atZone(ZoneId.systemDefault())
                .toLocalDate(),
            LocalDate.now()
        ).toInt()

        val authors = HashMap<String, Int>()
        for (commit in commits) {
            ProgressManager.checkCanceled()
            val name = commit.authorIdent.name
            authors[name] = (authors[name] ?: 0) + 1
        }
        val top = authors.maxByOrNull { it.value }
        val topAuthor = top?.key ?: "Unknown"
        val ownershipPercent = ((top?.value ?: 0).toDouble() / commits.size * 100).toInt()

        return FileStats(
            commits = commits.size,
            ageDays = ageDays,
            topAuthor = topAuthor,
            ownershipPercent = ownershipPercent,
            lastModifiedDate = Date(lastCommit.commitTime.toLong() * 1000L)
        )
    }

    fun analyzeFile(file: VirtualFile, force: Boolean = false): FileStats? {
        val git = getGitRepo(file) ?: return null
        val repo = git.repository
        val filePath = relativizePath(repo, file) ?: return null

        // Removed internal cache check to prevent memory leak and redundancy

        return try {
            statsFrom(fileHistory(git, filePath))
        } catch (e: ProcessCanceledException) {
            throw e
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

    /**
     * A repository read session: one [RevWalk] and one [ObjectReader] shared by
     * every commit an operation touches.
     *
     * This replaces the previous `prepareTreeParser`, which had two defects.
     * First, it returned a [CanonicalTreeParser] created *inside*
     * `newObjectReader().use { }`, so the reader was closed before the diff ever
     * consumed the parser — a use-after-close that only appeared to work because
     * `reset()` preloads the top-level tree, and that broke as soon as a
     * recursive diff called `createSubtreeIterator`. Second, it allocated a
     * fresh RevWalk *and* ObjectReader on every call, twice per commit.
     */
    private class RepoSession(repo: Repository) : AutoCloseable {
        val reader: ObjectReader = repo.newObjectReader()
        val walk: RevWalk = RevWalk(reader)

        /** Tree iterator for [id]'s commit tree, valid for this session's lifetime. */
        fun treeParser(repo: Repository, id: ObjectId): AbstractTreeIterator {
            val commit = walk.parseCommit(id)
            return CanonicalTreeParser().apply { reset(reader, commit.tree) }
        }

        override fun close() {
            // RevWalk(ObjectReader) does not own the reader, so close both.
            walk.close()
            reader.close()
        }
    }

    /**
     * Paths changed by [commit] relative to its first parent, capped at
     * [MAX_DIFF_ENTRIES_PER_COMMIT]. Uses the session's shared reader and the
     * commit's already-known parent instead of re-resolving `"<hash>~1"`.
     */
    private fun changedPaths(repo: Repository, session: RepoSession, commit: RevCommit): List<String> {
        ProgressManager.checkCanceled()
        val parsed = session.walk.parseCommit(commit.id)
        if (parsed.parentCount == 0) return emptyList() // root commit: no parent to diff

        val parentTree = session.treeParser(repo, parsed.getParent(0).id)
        val commitTree = session.treeParser(repo, parsed.id)

        val paths = ArrayList<String>()
        TreeWalk(session.reader).use { tw ->
            tw.addTree(parentTree)
            tw.addTree(commitTree)
            tw.isRecursive = true
            tw.filter = org.eclipse.jgit.treewalk.filter.TreeFilter.ANY_DIFF
            while (tw.next()) {
                ProgressManager.checkCanceled()
                paths.add(tw.pathString)
                if (paths.size >= MAX_DIFF_ENTRIES_PER_COMMIT) break
            }
        }
        return paths
    }

    /**
     * Like [changedPaths] but retains change types, for callers that need to
     * distinguish a delete from a modify. Also capped at
     * [MAX_DIFF_ENTRIES_PER_COMMIT] and uses the session's shared reader.
     */
    private fun diffEntries(repo: Repository, session: RepoSession, commit: RevCommit): List<DiffEntry> {
        ProgressManager.checkCanceled()
        val parsed = session.walk.parseCommit(commit.id)
        if (parsed.parentCount == 0) return emptyList()

        val parentTree = session.treeParser(repo, parsed.getParent(0).id)
        val commitTree = session.treeParser(repo, parsed.id)

        TreeWalk(session.reader).use { tw ->
            tw.addTree(parentTree)
            tw.addTree(commitTree)
            tw.isRecursive = true
            tw.filter = org.eclipse.jgit.treewalk.filter.TreeFilter.ANY_DIFF
            return DiffEntry.scan(tw).take(MAX_DIFF_ENTRIES_PER_COMMIT)
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
        val filePath = relativizePath(repo, file) ?: return emptyList()

        return try {
            fileHistory(git, filePath, minOf(count, MAX_FILE_HISTORY_COMMITS)).map { commit ->
                CommitInfo(
                    hash = commit.name,
                    author = commit.authorIdent.name,
                    date = Date(commit.commitTime * 1000L),
                    message = commit.shortMessage
                )
            }
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun getFileStats(file: VirtualFile): FileStats? {
        val git = getGitRepo(file) ?: return null
        val repo = git.repository
        val filePath = relativizePath(repo, file) ?: return null

        return try {
            statsFrom(fileHistory(git, filePath))
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    fun calculateTechnicalDebt(file: VirtualFile): Double {
        val stats = getFileStats(file) ?: return 0.0
        // Skip reading very large files entirely: the old version materialized the
        // whole file as a String plus a List of every line just to count them.
        val lineCount = if (file.length > MAX_TEXT_BYTES) {
            (file.length / 40).toInt().coerceAtLeast(1) // ~40 bytes/line estimate
        } else {
            try {
                var lines = 1
                for (b in file.contentsToByteArray()) if (b == '\n'.code.toByte()) lines++
                lines
            } catch (e: ProcessCanceledException) {
                throw e
            } catch (e: Exception) {
                100
            }
        }

        val complexityFactor = lineCount / 100.0
        val churnFactor = max(1.0, stats.commits / 5.0)
        val ageFactor = max(1.0, stats.ageDays / 30.0)
        
        return complexityFactor * churnFactor * ln(ageFactor + 1.0)
    }

    fun calculateBusFactor(file: VirtualFile): BusFactorInfo {
        val git = getGitRepo(file) ?: return BusFactorInfo(0, emptyList(), "unknown")
        val repo = git.repository
        val filePath = relativizePath(repo, file) ?: return BusFactorInfo(0, emptyList(), "unknown")
        
        return try {
            // Bounded history: this is called from computeAnalysisSync on every
            // tab switch, so it must never walk an entire repository.
            val history = fileHistory(git, filePath)

            if (history.isEmpty()) {
                return BusFactorInfo(0, emptyList(), "no_commits")
            }

            // Group commits by author
            val authors = history.groupBy { it.authorIdent.name }
            val totalCommits = history.size

            // Ownership is approximated by commit count per author for this file.
            // (Previously this ran a tree-diff per commit, which was O(commits) diffs.)
            val contributors = authors.map { (name, commits) ->
                val commitPercentage = (commits.size * 100) / totalCommits
                Contributor(name, commits.size, commitPercentage)
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
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            // Log the error and return unknown status
            log.warn("Error calculating bus factor: ${e.message}", e)
            BusFactorInfo(0, emptyList(), "error")
        }
    }


    fun getCoupledFiles(file: VirtualFile): List<CouplingInfo> {
        val git = getGitRepo(file) ?: return emptyList()
        val repo = git.repository
        val filePath = relativizePath(repo, file) ?: return emptyList()

        return try {
            val commits = fileHistory(git, filePath, MAX_COUPLING_COMMITS)
            if (commits.isEmpty()) return emptyList()

            val fileCounts = mutableMapOf<String, Int>()

            // ONE RevWalk + ONE ObjectReader for all commits. The old version
            // allocated both twice per commit (via prepareTreeParser) and
            // re-resolved "<hash>~1" each time.
            RepoSession(repo).use { session ->
                for (commit in commits) {
                    ProgressManager.checkCanceled()
                    val changed = try {
                        changedPaths(repo, session, commit)
                    } catch (e: ProcessCanceledException) {
                        throw e
                    } catch (e: Exception) {
                        continue // unreadable commit; skip it
                    }

                    for (changedFile in changed) {
                        if (changedFile.isNotEmpty() && changedFile != filePath) {
                            fileCounts[changedFile] = (fileCounts[changedFile] ?: 0) + 1
                        }
                    }
                }
            }

            // Return top 3 most frequently changed files with this one
            fileCounts.entries
                .sortedByDescending { it.value }
                .take(3)
                .map { (path, count) ->
                    CouplingInfo(path, count, (count * 100 / commits.size))
                }
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            log.warn("Error finding coupled files: ${e.message}", e)
            emptyList()
        }
    }

    fun detectEpochs(): List<EpochInfo> {
        // Get the project's base directory
        val baseDir = File(project.basePath ?: return emptyList())
        val vFile = baseDir.toVirtualFile(project) ?: return emptyList()
        val git = getGitRepo(vFile) ?: return emptyList()
        
        return try {
            // Bounded to MAX_PROJECT_COMMITS commits
            val commits = ArrayList<Pair<LocalDate, String>>()
            for (commit in git.log().setMaxCount(MAX_PROJECT_COMMITS).call()) {
                ProgressManager.checkCanceled()
                val date = Instant.ofEpochMilli(commit.commitTime.toLong() * 1000)
                    .atZone(ZoneId.systemDefault())
                    .toLocalDate()
                commits.add(date to commit.fullMessage.trim())
                if (commits.size >= MAX_PROJECT_COMMITS) break
            }
            commits.sortBy { it.first } // Sort by date ascending

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
                ProgressManager.checkCanceled()
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
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            log.warn("Error detecting epochs: ${e.message}", e)
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
        val repo = git.repository

        return try {
            val results = mutableListOf<Map<String, String>>()
            val seen = HashSet<String>()

            // Caps: MAX_DELETED_SCAN_COMMITS commits, MAX_DELETED_RESULTS files,
            // MAX_DIFF_ENTRIES_PER_COMMIT entries per commit, one shared reader.
            RepoSession(repo).use { session ->
                var scanned = 0
                for (commit in git.log().setMaxCount(MAX_DELETED_SCAN_COMMITS).call()) {
                    ProgressManager.checkCanceled()
                    if (scanned++ >= MAX_DELETED_SCAN_COMMITS || results.size >= MAX_DELETED_RESULTS) break

                    val entries = try {
                        diffEntries(repo, session, commit)
                    } catch (e: ProcessCanceledException) {
                        throw e
                    } catch (e: Exception) {
                        continue // root or unreadable commit
                    }

                    val date = Instant.ofEpochMilli(commit.commitTime.toLong() * 1000)
                        .atZone(ZoneId.systemDefault())
                        .toLocalDate()
                        .toString()

                    for (diff in entries) {
                        if (diff.changeType != DiffEntry.ChangeType.DELETE) continue
                        if (isSkippedPath(diff.oldPath)) continue
                        if (!seen.add(diff.oldPath)) continue
                        results.add(
                            mapOf(
                                "hash" to commit.name,
                                "author" to commit.authorIdent.name,
                                "date" to date,
                                "file" to diff.oldPath
                            )
                        )
                        if (results.size >= MAX_DELETED_RESULTS) break
                    }
                }
            }

            results
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            log.warn("Error finding deleted files: ${e.message}", e)
            emptyList()
        }
    }

    fun findBugPatterns(file: VirtualFile): Map<String, Any>? {
        val git = getGitRepo(file) ?: return null
        val repo = git.repository
        val filePath = relativizePath(repo, file) ?: return null

        return try {
            val history = fileHistory(git, filePath)
            if (history.isEmpty()) return null

            var bugCount = 0
            for (commit in history) {
                ProgressManager.checkCanceled()
                if (RE_BUGFIX_MESSAGE.containsMatchIn(commit.fullMessage)) bugCount++
            }

            mapOf(
                "bugCount" to bugCount,
                "totalCommits" to history.size,
                "density" to bugCount.toDouble() / history.size
            )
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            log.warn("Error finding bug patterns: ${e.message}", e)
            null
        }
    }

    fun detectZombieCode(): List<Map<String, Any>> {
        val git = getGitRepo(project.basePath?.let { File(it).toVirtualFile(project) } ?: return emptyList()) ?: return emptyList()
        
        return try {
            val zombies = mutableListOf<Map<String, Any>>()
            val oneYearAgo = System.currentTimeMillis() - (365L * 24 * 60 * 60 * 1000)
            val deadline = System.currentTimeMillis() + SCAN_BUDGET_MS
            var examined = 0

            // Walk files at HEAD. Each examined file costs its own history walk,
            // so the file count is capped (MAX_SCANNED_TREE_FILES) in addition
            // to the result count, and the whole scan has a wall-clock budget.
            // The old `zombies.size < 50` bound did not limit the loop at all:
            // a repo with no zombies scanned every file.
            TreeWalk(git.repository).use { fileTreeWalk ->
                fileTreeWalk.addTree(git.repository.resolve(org.eclipse.jgit.lib.Constants.HEAD))
                fileTreeWalk.isRecursive = true

                while (fileTreeWalk.next()) {
                    ProgressManager.checkCanceled()
                    if (zombies.size >= 50) break
                    if (examined >= MAX_SCANNED_TREE_FILES) break
                    if (System.currentTimeMillis() > deadline) break

                    if (fileTreeWalk.isSubtree) continue
                    val path = fileTreeWalk.pathString
                    if (isSkippedPath(path)) continue
                    examined++

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
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            log.warn("Error detecting zombie code: ${e.message}", e)
            emptyList()
        }
    }

    fun detectHotPotato(): List<Map<String, Any>> {
        val git = getGitRepo(project.basePath?.let { File(it).toVirtualFile(project) } ?: return emptyList()) ?: return emptyList()

        return try {
            val hotPotatoes = mutableListOf<Map<String, Any>>()
            val deadline = System.currentTimeMillis() + SCAN_BUDGET_MS
            var examined = 0

            // Same bounding as detectZombieCode. The per-file log here had NO
            // max count at all, making this O(files x all commits).
            TreeWalk(git.repository).use { fileTreeWalk ->
                fileTreeWalk.addTree(git.repository.resolve(org.eclipse.jgit.lib.Constants.HEAD))
                fileTreeWalk.isRecursive = true

                while (fileTreeWalk.next()) {
                    ProgressManager.checkCanceled()
                    if (hotPotatoes.size >= 30) break
                    if (examined >= MAX_SCANNED_TREE_FILES) break
                    if (System.currentTimeMillis() > deadline) break

                    if (fileTreeWalk.isSubtree) continue
                    val path = fileTreeWalk.pathString
                    if (isSkippedPath(path)) continue
                    examined++

                    val commits = fileHistory(git, path)
                    if (commits.isEmpty()) continue

                    val authors = HashSet<String>()
                    for (commit in commits) {
                        ProgressManager.checkCanceled()
                        authors.add(commit.authorIdent.name)
                    }

                    // If more than 5 authors, it's a hot potato
                    if (authors.size > 5) {
                        hotPotatoes.add(mapOf(
                            "file" to path,
                            "authorCount" to authors.size,
                            "commitCount" to commits.size
                        ))
                    }
                }
            }

            // Sort by author count in descending order
            hotPotatoes.sortedByDescending { it["authorCount"] as Int }
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            log.warn("Error detecting hot potato files: ${e.message}", e)
            emptyList()
        }
    }

    private data class TourCommit(
        val hash: String,
        val author: String,
        val date: Date,
        val message: String
    )

    /**
     * Milestones in [file]'s history.
     *
     * This ran a full tree diff for EVERY commit pair in the file's history.
     * Kotlin's `filter` is eager, so the trailing `.take(3)` did not stop the
     * work — a 200-commit file cost ~398 RevWalks and hundreds of thousands of
     * tree entries (seconds of blocking), and it is reached from
     * `VestigeService.computeAnalysisSync` on every tab switch and every save.
     *
     * The diffs are gone. Their predicate asked whether the commit modified
     * [filePath], which the path-filtered log already guarantees for every
     * commit it returns — so the predicate was vacuously true and the whole
     * diff was pure cost. "Refactor" milestones now come from a commit-message
     * heuristic, which is cheap and actually discriminates.
     */
    fun generateOnboardingTour(file: VirtualFile): List<OnboardingMilestone> {
        val git = getGitRepo(file) ?: return emptyList()
        val repo = git.repository
        val filePath = relativizePath(repo, file) ?: return emptyList()

        val commits = try {
            fileHistory(git, filePath).map { commit ->
                TourCommit(
                    hash = commit.name,
                    author = commit.authorIdent.name,
                    date = Date(commit.commitTime * 1000L),
                    message = commit.fullMessage
                )
            }
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            emptyList()
        }

        if (commits.isEmpty()) return emptyList()

        val milestones = mutableListOf<OnboardingMilestone>()

        // Add file creation as first milestone
        val birth = commits.last()
        milestones.add(OnboardingMilestone(
            type = MilestoneType.BIRTH,
            icon = "",
            content = "File was created",
            date = birth.date,
            author = birth.author,
            hash = birth.hash,
            importance = 10
        ))

        // Refactor milestones: message heuristic, lazily evaluated so `take(3)`
        // actually bounds the work.
        commits.asSequence()
            .filter { RE_REFACTOR_MESSAGE.containsMatchIn(it.message) }
            .take(3)
            .forEachIndexed { index, commit ->
                milestones.add(OnboardingMilestone(
                    type = MilestoneType.REFACTOR,
                    icon = "",
                    content = "Refactoring: ${commit.message.lineSequence().first().take(80)}",
                    date = commit.date,
                    author = commit.author,
                    hash = commit.hash,
                    importance = 8 - (index * 2)
                ))
            }

        // Bug fixes — 3 most recent
        commits.asSequence()
            .filter { RE_BUGFIX_MESSAGE.containsMatchIn(it.message) }
            .take(3)
            .forEach { commit ->
                milestones.add(OnboardingMilestone(
                    type = MilestoneType.BUGFIX_CLUSTER,
                    icon = "",
                    content = "Bug fix: ${commit.message.take(50)}...",
                    date = commit.date,
                    author = commit.author,
                    hash = commit.hash,
                    importance = 7
                ))
            }

        // Dependency changes
        commits.asSequence()
            .filter { commit ->
                val msg = commit.message.lowercase()
                (msg.contains("upgrade") || msg.contains("update") || msg.contains("migrate") ||
                    msg.contains("dependency") || msg.contains("package")) &&
                    (msg.contains("version") ||
                        RE_VERSION_TAG.containsMatchIn(msg) ||
                        RE_AT_VERSION.containsMatchIn(msg))
            }
            .take(2)
            .forEach { commit ->
                milestones.add(OnboardingMilestone(
                    type = MilestoneType.DEPENDENCY,
                    icon = "📦",
                    content = "Dependency update: ${commit.message.take(100)}",
                    date = commit.date,
                    author = commit.author,
                    hash = commit.hash,
                    importance = 5
                ))
            }

        // Security fixes — previously unbounded, now capped at 3
        commits.asSequence()
            .filter { commit ->
                val msg = commit.message.lowercase()
                msg.contains("security") || msg.contains("cve") || msg.contains("vulnerability") ||
                    msg.contains("exploit") || msg.contains("xss") || msg.contains("injection")
            }
            .take(3)
            .forEach { commit ->
                milestones.add(OnboardingMilestone(
                    type = MilestoneType.SECURITY,
                    icon = "🔒",
                    content = "Security fix: ${commit.message.take(100)}",
                    date = commit.date,
                    author = commit.author,
                    hash = commit.hash,
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

        // Quick facts. Very large files are estimated rather than fully read:
        // the old version built a String plus a List of every line to count them.
        val lineCount = if (file.length > MAX_TEXT_BYTES) {
            (file.length / 40).toInt().coerceAtLeast(1)
        } else {
            try {
                var lines = 1
                for (b in file.contentsToByteArray()) if (b == '\n'.code.toByte()) lines++
                lines
            } catch (e: ProcessCanceledException) {
                throw e
            } catch (e: Exception) {
                0
            }
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
        val wordCounts = mutableMapOf<String, Int>()

        // RE_NON_WORD and the stop-word set are compiled/allocated once in the
        // companion; both were rebuilt on every call, per message.
        messages.forEach { msg ->
            ProgressManager.checkCanceled()
            msg.lowercase()
                .split(RE_NON_WORD)
                .filter { it.length > 3 && !KEYWORD_STOP_WORDS.contains(it) }
                .forEach { word ->
                    wordCounts[word] = (wordCounts[word] ?: 0) + 1
                }
        }

        return wordCounts.entries
            .sortedByDescending { it.value }
            .map { it.key }
    }
}
