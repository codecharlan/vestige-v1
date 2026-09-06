package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * Code Similarity Radar — detects duplicated code across the codebase.
 *
 * Implementation notes (this class was previously the plugin's dominant freeze
 * source and was rewritten):
 *
 * The original approach compared every extracted pattern of every file against
 * every line window of every other file, re-running four regex substitutions
 * at each step. That is O(files × patterns × lines × regex) — on the order of
 * 10^11 regex operations for a single call on a 2k-file project, with no
 * cancellation checks, executed inside a read action. Keystrokes (which need
 * the write lock) blocked behind it, which is what users experienced as the
 * IDE freezing.
 *
 * This version builds a single inverted index of hashed, normalized line
 * windows (classic type-2 clone detection). Indexing is O(total lines) and
 * happens once; a lookup is O(lines in the query file). Normalization is
 * cached per distinct line and its regexes are compiled once.
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

    data class ExtractionOpportunity(
        val file1: VirtualFile,
        val file2: VirtualFile,
        val pattern: String,
        val similarity: Double,
        val suggestedName: String
    )

    private data class Location(val path: String, val startLine: Int)

    companion object {
        /** Lines per compared window. Fixed size keeps indexing linear. */
        private const val WINDOW = 6

        /** Files longer than this are skipped — generated code dominates otherwise. */
        private const val MAX_FILE_LINES = 5_000

        /** Hard cap on bytes read per file. */
        private const val MAX_FILE_BYTES = 1L * 1024 * 1024

        /** Hard cap on indexed files, so huge monorepos stay responsive. */
        private const val MAX_INDEXED_FILES = 3_000

        /** Rebuild the index at most this often. */
        private const val INDEX_TTL_MS = 5 * 60 * 1000L

        private const val MIN_SHARED_WINDOWS = 2

        /** Cap per hash so one boilerplate line pattern can't dominate memory. */
        private const val MAX_LOCATIONS_PER_WINDOW = 24

        // Compiled once. The original compiled these on every call, for every
        // line of every window.
        private val RE_LOWER_IDENT = Regex("\\b[a-z][a-zA-Z0-9_]*\\b")
        private val RE_UPPER_IDENT = Regex("\\b[A-Z][a-zA-Z0-9_]*\\b")
        private val RE_NUMBER = Regex("\\d+")
        private val RE_STRING = Regex("\"[^\"]*\"")

        private val CODE_EXTENSIONS = setOf(
            "kt", "java", "js", "ts", "tsx", "jsx", "py", "go", "rs", "cpp", "c", "h", "hpp"
        )

        private val SKIP_DIRS = setOf(
            "node_modules", "build", "out", "dist", "target", "vendor", "__pycache__", ".gradle"
        )
    }

    private val log = Logger.getInstance(VestigeSimilarityRadar::class.java)

    /**
     * hash of a normalized window -> where that window occurs.
     *
     * Published by reference on completion. A build never mutates the live map:
     * cancellation (which happens on every write action) would otherwise leave
     * callers querying a half-cleared index and discard all completed work.
     */
    @Volatile
    private var windowIndex: Map<Long, List<Location>> = emptyMap()

    /** Normalization is per-line and highly repetitive, so cache it. */
    private val normalizedLineCache = ConcurrentHashMap<String, String>()

    private val similarityCache = ConcurrentHashMap<String, List<SimilarityMatch>>()
    private val indexedFileCount = AtomicLong(0)
    private val buildLock = Any()

    /** Distinct windows seen during the build, including unique ones. */
    private val totalWindowCount = AtomicLong(0)

    @Volatile
    private var indexBuiltAt: Long = 0

    @Volatile
    private var indexing = false

    /**
     * Find files sharing duplicated code with [file].
     *
     * `similarity` is the fraction of [file]'s lines that also appear (modulo
     * identifier/literal renaming) in the other file, so [threshold] filters on
     * a real duplication ratio.
     */
    fun findSimilarPatterns(file: VirtualFile, threshold: Double = 0.7): List<SimilarityMatch> {
        if (!isCodeFile(file)) return emptyList()

        val cacheKey = "${file.path}|$threshold|${file.modificationStamp}"
        similarityCache[cacheKey]?.let { return it }

        val lines = readNormalizedLines(file) ?: return emptyList()
        if (lines.size < WINDOW) return emptyList()

        ensureIndex()

        // For each window of the query file, find where else it occurs.
        // Track which query lines are covered, per other file.
        val coveredLinesByFile = HashMap<String, MutableSet<Int>>()
        val matchStartsByFile = HashMap<String, MutableList<Int>>()
        val sharedWindowsByFile = HashMap<String, Int>()

        for (start in 0..(lines.size - WINDOW)) {
            ProgressManager.checkCanceled()
            val hash = hashWindow(lines, start)
            val locations = windowIndex[hash] ?: continue

            for (loc in locations) {
                if (loc.path == file.path) continue
                sharedWindowsByFile[loc.path] = (sharedWindowsByFile[loc.path] ?: 0) + 1
                coveredLinesByFile.getOrPut(loc.path) { HashSet() }
                    .addAll(start until (start + WINDOW))
                matchStartsByFile.getOrPut(loc.path) { mutableListOf() }.add(loc.startLine)
            }
        }

        if (sharedWindowsByFile.isEmpty()) return emptyList()

        val fileSystem = file.fileSystem
        val matches = sharedWindowsByFile.entries.mapNotNull { (path, sharedWindows) ->
            if (sharedWindows < MIN_SHARED_WINDOWS) return@mapNotNull null

            val covered = coveredLinesByFile[path]?.size ?: 0
            val similarity = (covered.toDouble() / lines.size).coerceIn(0.0, 1.0)
            if (similarity < threshold) return@mapNotNull null

            val otherFile = fileSystem.findFileByPath(path) ?: return@mapNotNull null

            // Show the first duplicated window as the representative pattern.
            val firstCoveredStart = coveredLinesByFile[path]?.minOrNull() ?: 0
            val patternText = lines
                .subList(firstCoveredStart, minOf(firstCoveredStart + WINDOW, lines.size))
                .joinToString("\n")
                .take(200)

            SimilarityMatch(
                file = otherFile,
                similarity = similarity,
                matchingLines = matchStartsByFile[path]?.distinct()?.sorted() ?: emptyList(),
                pattern = patternText,
                suggestion = generateSuggestion(similarity)
            )
        }.sortedByDescending { it.similarity }.take(10)

        similarityCache[cacheKey] = matches
        if (similarityCache.size > 500) similarityCache.clear()
        return matches
    }

    /**
     * Duplicated windows that occur in more than one file, derived straight
     * from the index. The original walked every file pair (F²) and called the
     * expensive per-file scan inside both loops.
     */
    fun getExtractionOpportunities(): List<ExtractionOpportunity> {
        ensureIndex()
        val fs = com.intellij.openapi.vfs.LocalFileSystem.getInstance()
        val opportunities = mutableListOf<ExtractionOpportunity>()

        for ((_, locations) in windowIndex) {
            ProgressManager.checkCanceled()
            if (locations.size < 2) continue

            val distinctPaths = locations.map { it.path }.distinct()
            if (distinctPaths.size < 2) continue

            val first = fs.findFileByPath(distinctPaths[0]) ?: continue
            val second = fs.findFileByPath(distinctPaths[1]) ?: continue

            opportunities.add(
                ExtractionOpportunity(
                    file1 = first,
                    file2 = second,
                    pattern = "$WINDOW duplicated lines in ${distinctPaths.size} files",
                    similarity = minOf(1.0, locations.size / 10.0),
                    suggestedName = "extract${first.nameWithoutExtension.replaceFirstChar { it.uppercase() }}Common"
                )
            )
            if (opportunities.size >= 200) break
        }

        return opportunities.sortedByDescending { it.similarity }.take(20)
    }

    /**
     * Project-wide duplication signal: the fraction of indexed line windows
     * that occur more than once. O(index size), no per-file scanning — cheap
     * enough for dashboards.
     */
    fun duplicateWindowRatio(): Double {
        ensureIndex()
        val total = totalWindowCount.get()
        if (total <= 0) return 0.0
        // windowIndex holds only windows seen more than once.
        return (windowIndex.size.toDouble() / total).coerceIn(0.0, 1.0)
    }

    /** Drop the index — call when the project's files have changed materially. */
    fun invalidate() {
        windowIndex = emptyMap()
        similarityCache.clear()
        indexBuiltAt = 0
        indexedFileCount.set(0)
        totalWindowCount.set(0)
    }

    fun isIndexReady(): Boolean = indexBuiltAt > 0

    fun indexedFiles(): Long = indexedFileCount.get()

    // ── indexing ────────────────────────────────────────────────────────────

    private fun ensureIndex() {
        val age = System.currentTimeMillis() - indexBuiltAt
        if (indexBuiltAt > 0 && age < INDEX_TTL_MS) return

        // One builder at a time. Others proceed against whatever index is
        // currently published (possibly empty) rather than blocking the caller
        // or reading a partially built map.
        synchronized(buildLock) {
            val recheck = System.currentTimeMillis() - indexBuiltAt
            if (indexBuiltAt > 0 && recheck < INDEX_TTL_MS) return
            if (indexing) return
            indexing = true
        }

        try {
            buildIndex()
        } catch (e: com.intellij.openapi.progress.ProcessCanceledException) {
            // Cancelled by a write action; the previously published index stays
            // valid and we simply retry on the next call.
            throw e
        } catch (e: Exception) {
            log.warn("Similarity index build failed", e)
        } finally {
            indexing = false
        }
    }

    private fun buildIndex() {
        // Build into a private map, then publish atomically.
        val staging = HashMap<Long, MutableList<Location>>()
        var count = 0L

        for (file in collectCodeFiles()) {
            ProgressManager.checkCanceled()
            if (count >= MAX_INDEXED_FILES) break

            val lines = readNormalizedLines(file) ?: continue
            if (lines.size < WINDOW) continue

            for (start in 0..(lines.size - WINDOW)) {
                val hash = hashWindow(lines, start)
                val locs = staging.getOrPut(hash) { mutableListOf() }
                if (locs.size < MAX_LOCATIONS_PER_WINDOW) locs.add(Location(file.path, start))
            }
            count++
        }

        // Drop single-occurrence windows before publishing: they can never be a
        // duplicate, and they are the overwhelming majority of entries. This is
        // what keeps the resident index small.
        val published = HashMap<Long, List<Location>>()
        for ((hash, locs) in staging) {
            if (locs.size > 1) published[hash] = java.util.List.copyOf(locs)
        }

        windowIndex = published
        similarityCache.clear()
        indexedFileCount.set(count)
        totalWindowCount.set(staging.size.toLong())
        indexBuiltAt = System.currentTimeMillis()
    }

    /**
     * Read a file's significant lines, normalized.
     *
     * Deliberately avoids `FileDocumentManager.getDocument()` for files that
     * aren't already open: that loads a Document per file and, across a whole
     * project, produced the memory pressure that turned into GC pauses.
     */
    private fun readNormalizedLines(file: VirtualFile): List<String>? {
        if (file.length > MAX_FILE_BYTES) return null

        val text = try {
            val cached = com.intellij.openapi.application.ReadAction.compute<com.intellij.openapi.editor.Document?, RuntimeException> {
                FileDocumentManager.getInstance().getCachedDocument(file)
            }
            if (cached != null) {
                com.intellij.openapi.application.ReadAction.compute<String, RuntimeException> { cached.text }
            } else {
                VfsUtilCore.loadText(file)
            }
        } catch (e: com.intellij.openapi.progress.ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            return null
        }

        val raw = text.lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() && !it.startsWith("//") && !it.startsWith("*") && !it.startsWith("#") }
            .take(MAX_FILE_LINES)
            .toList()

        if (raw.isEmpty()) return null
        return raw.map { normalizeLine(it) }
    }

    /** Per-line normalization, memoized — the same lines recur constantly. */
    private fun normalizeLine(line: String): String {
        normalizedLineCache[line]?.let { return it }

        val normalized = line
            .replace(RE_STRING, "\"STR\"")
            .replace(RE_UPPER_IDENT, "CLS")
            .replace(RE_LOWER_IDENT, "VAR")
            .replace(RE_NUMBER, "NUM")

        if (normalizedLineCache.size > 50_000) normalizedLineCache.clear()
        normalizedLineCache[line] = normalized
        return normalized
    }

    /** 64-bit FNV-1a over a window of already-normalized lines. */
    private fun hashWindow(lines: List<String>, start: Int): Long {
        var hash = -0x340d631b7bdddcdbL // FNV offset basis
        for (i in start until start + WINDOW) {
            val line = lines[i]
            for (ch in line) {
                hash = hash xor ch.code.toLong()
                hash *= 0x100000001b3L
            }
            hash = hash xor '\n'.code.toLong()
            hash *= 0x100000001b3L
        }
        return hash
    }

    private fun collectCodeFiles(): List<VirtualFile> {
        val basePath = project.basePath ?: return emptyList()
        val baseDir = VfsUtilCore.findRelativeFile(basePath, null) ?: return emptyList()

        val files = mutableListOf<VirtualFile>()
        val stack = ArrayDeque<VirtualFile>()
        stack.addLast(baseDir)

        // Iterative walk with an explicit bound — the recursive version could
        // traverse an entire monorepo on every single call.
        while (stack.isNotEmpty() && files.size < MAX_INDEXED_FILES) {
            ProgressManager.checkCanceled()
            val dir = stack.removeLast()
            val children = try { dir.children } catch (e: Exception) { continue } ?: continue

            for (child in children) {
                if (child.isDirectory) {
                    if (!child.name.startsWith(".") && child.name !in SKIP_DIRS) {
                        stack.addLast(child)
                    }
                } else if (isCodeFile(child)) {
                    files.add(child)
                    if (files.size >= MAX_INDEXED_FILES) break
                }
            }
        }
        return files
    }

    private fun isCodeFile(file: VirtualFile): Boolean =
        !file.isDirectory && (file.extension?.lowercase() in CODE_EXTENSIONS)

    private fun generateSuggestion(similarity: Double): String = when {
        similarity > 0.9 -> "Near-identical file — consider extracting the shared implementation"
        similarity > 0.6 -> "Substantial duplication — a shared helper would remove it"
        else -> "Some duplicated blocks — review for a common abstraction"
    }
}
