package com.codecharlan.vestige.logic

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.concurrency.AppExecutorUtil
import java.io.File
import java.time.Instant
import java.util.Collections
import java.util.LinkedHashMap
import java.util.concurrent.atomic.AtomicLong

@Service(Service.Level.PROJECT)
class ShadowHistoryEngine(private val project: Project) : Disposable {

    data class Snapshot(
        val content: String,
        val timestamp: Instant,
        val hash: String
    )

    companion object {
        /** Max distinct files tracked in memory. */
        private const val MAX_TRACKED_FILES = 500

        /** Max snapshots retained per file. */
        private const val MAX_SNAPSHOTS_PER_FILE = 20

        /** Single file size limit for snapshotting (512 KB). */
        private const val MAX_SNAPSHOT_BYTES = 512L * 1024

        /**
         * Ceiling on the total snapshot text held in memory (32 MB).
         *
         * Entry counts alone did not bound memory: 500 files x 20 snapshots x
         * 512 KB of full file text is 100-500 MB in the realistic case. Every
         * snapshot's size is now accounted for and the oldest are evicted until
         * the store fits under this budget.
         */
        private const val MAX_TOTAL_BYTES = 32L * 1024 * 1024

        /** Ceiling on the on-disk history directory (128 MB). */
        private const val MAX_DISK_BYTES = 128L * 1024 * 1024

        /** On-disk snapshots older than this are pruned. */
        private const val MAX_DISK_AGE_MS = 7L * 24 * 60 * 60 * 1000
    }

    /** Running total of snapshot content held in [shadowStore]. */
    private val totalBytes = AtomicLong(0)

    /**
     * LRU store of per-file snapshots.
     *
     * The eldest-entry eviction must also discharge that entry's bytes from
     * [totalBytes], otherwise the accounting drifts upward forever and
     * [trimToByteBudget] starts evicting live snapshots to chase a phantom
     * total.
     */
    private val shadowStore: MutableMap<String, MutableList<Snapshot>> =
        Collections.synchronizedMap(
            object : LinkedHashMap<String, MutableList<Snapshot>>(MAX_TRACKED_FILES, 0.75f, true) {
                override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, MutableList<Snapshot>>?): Boolean {
                    if (size <= MAX_TRACKED_FILES) return false
                    eldest?.value?.let { list ->
                        val freed = synchronized(list) { list.sumOf { it.content.length.toLong() } }
                        totalBytes.addAndGet(-freed)
                    }
                    return true
                }
            }
        )

    private val ioExecutor = AppExecutorUtil.createBoundedApplicationPoolExecutor("VestigeHistoryIO", 1)

    @Volatile
    private var diskPruned = false

    override fun dispose() {
        // Bounded executors from AppExecutorUtil must be shut down when their owner is disposed.
        ioExecutor.shutdown()
        synchronized(shadowStore) { shadowStore.clear() }
        totalBytes.set(0)
    }

    /**
     * Records a snapshot of [file].
     *
     * All disk work is handed to [ioExecutor]; nothing here writes from the
     * calling thread. The read of the file's bytes is bounded by
     * [MAX_SNAPSHOT_BYTES], and the in-memory store is bounded by file count,
     * per-file count AND total bytes.
     */
    fun captureSnapshot(file: VirtualFile) {
        val path = file.path
        if (file.isDirectory) return
        if (file.length > MAX_SNAPSHOT_BYTES) return

        val content = try {
            String(file.contentsToByteArray())
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            return
        }
        val hash = content.hashCode().toString()

        // getOrPut on a synchronized map is not atomic by itself
        val snapshots = synchronized(shadowStore) {
            shadowStore.getOrPut(path) { Collections.synchronizedList(mutableListOf()) }
        }

        // The per-file list is mutated from concurrent threads - guard compound operations
        val evicted = ArrayList<Snapshot>(1)
        synchronized(snapshots) {
            if (snapshots.isNotEmpty() && snapshots.last().hash == hash) return

            snapshots.add(Snapshot(content, Instant.now(), hash))
            totalBytes.addAndGet(content.length.toLong())

            while (snapshots.size > MAX_SNAPSHOTS_PER_FILE) {
                val old = snapshots.removeAt(0)
                totalBytes.addAndGet(-old.content.length.toLong())
                evicted.add(old)
            }
        }

        // Byte-budget eviction across all tracked files, oldest snapshot first.
        trimToByteBudget()

        if (evicted.isNotEmpty()) {
            ioExecutor.execute {
                pruneHistoryDirOnce()
                evicted.forEach { offloadToDisk(path, it) }
            }
        }
    }

    /**
     * Drops the oldest snapshot of the largest tracked files until the store
     * fits within [MAX_TOTAL_BYTES]. Evicted content is discarded rather than
     * written out — a byte-budget overflow means we are already retaining more
     * than we should.
     */
    private fun trimToByteBudget() {
        var guard = 0
        while (totalBytes.get() > MAX_TOTAL_BYTES && guard++ < MAX_TRACKED_FILES * MAX_SNAPSHOTS_PER_FILE) {
            val victim = synchronized(shadowStore) {
                shadowStore.entries
                    .maxByOrNull { entry -> synchronized(entry.value) { entry.value.sumOf { it.content.length } } }
                    ?.let { it.key to it.value }
            } ?: return

            val (path, list) = victim
            val removed = synchronized(list) {
                if (list.isEmpty()) null else list.removeAt(0)
            }
            if (removed == null) {
                synchronized(shadowStore) { shadowStore.remove(path) }
            } else {
                totalBytes.addAndGet(-removed.content.length.toLong())
            }
        }
    }

    /**
     * History is written under the IDE system directory (not into the user's project).
     */
    private fun historyDir(): File {
        val dir = File(PathManager.getSystemPath(), "vestige-history/${project.locationHash}")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    /**
     * Deletes stale snapshot files. This directory previously grew without any
     * retention policy at all — one file per evicted snapshot, never cleaned.
     * Runs at most once per session, on [ioExecutor], oldest files first.
     */
    private fun pruneHistoryDirOnce() {
        if (diskPruned) return
        diskPruned = true
        try {
            val dir = historyDir()
            val files = dir.listFiles { f: File -> f.isFile && f.name.endsWith(".snapshot") } ?: return
            val cutoff = System.currentTimeMillis() - MAX_DISK_AGE_MS

            var live = files.filter { file ->
                if (file.lastModified() < cutoff) {
                    file.delete()
                    false
                } else {
                    true
                }
            }

            // Then enforce the size ceiling, oldest first.
            var total = live.sumOf { it.length() }
            if (total <= MAX_DISK_BYTES) return
            live = live.sortedBy { it.lastModified() }
            for (file in live) {
                if (total <= MAX_DISK_BYTES) break
                val size = file.length()
                if (file.delete()) total -= size
            }
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            // History pruning is best-effort
        }
    }

    private fun offloadToDisk(path: String, snapshot: Snapshot) {
        try {
            val fileId = path.hashCode().toString()
            // One file per evicted snapshot so the FULL content is preserved
            val historyFile = File(historyDir(), "$fileId-${snapshot.timestamp.toEpochMilli()}.snapshot")
            historyFile.writeText("${snapshot.timestamp}|${snapshot.hash}|$path\n${snapshot.content}")
        } catch (e: ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            // Silently fail history backup
        }
    }

    fun getSnapshots(file: VirtualFile): List<Snapshot> {
        val snapshots = synchronized(shadowStore) { shadowStore[file.path] } ?: return emptyList()
        // Return a stable copy; the live list is mutated concurrently
        return synchronized(snapshots) { snapshots.toList() }
    }

    fun clearHistory(file: VirtualFile) {
        val removed = synchronized(shadowStore) { shadowStore.remove(file.path) } ?: return
        val freed = synchronized(removed) { removed.sumOf { it.content.length.toLong() } }
        totalBytes.addAndGet(-freed)
    }
}
