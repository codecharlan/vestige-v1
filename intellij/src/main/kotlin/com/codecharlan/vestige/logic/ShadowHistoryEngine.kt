package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.concurrency.AppExecutorUtil
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.time.Instant
import java.util.Collections
import java.util.LinkedHashMap

@Service(Service.Level.PROJECT)
class ShadowHistoryEngine(private val project: Project) {
    
    data class Snapshot(
        val content: String,
        val timestamp: Instant,
        val hash: String
    )

    private val shadowStore = createLinkedHashMap<String, MutableList<Snapshot>>(500) // Max 500 files
    private val maxSnapshotsPerFile = 20 // Reduced from 50
    private val ioExecutor = AppExecutorUtil.createBoundedApplicationPoolExecutor("VestigeHistoryIO", 1)

    companion object {
        private fun <K, V> createLinkedHashMap(maxEntries: Int): MutableMap<K, V> {
            return Collections.synchronizedMap(object : LinkedHashMap<K, V>(maxEntries, 0.75f, true) {
                override fun removeEldestEntry(eldest: Map.Entry<K, V>?): Boolean {
                    return size > maxEntries
                }
            })
        }
    }

    fun captureSnapshot(file: VirtualFile) {
        val path = file.path
        // Large file filter (> 500KB)
        if (file.length > 512 * 1024) return

        val content = try { String(file.contentsToByteArray()) } catch (e: Exception) { return }
        val hash = content.hashCode().toString()
        
        val snapshots = shadowStore.getOrPut(path) { mutableListOf() }
        
        if (snapshots.isNotEmpty() && snapshots.last().hash == hash) return
        
        val snapshot = Snapshot(content, Instant.now(), hash)
        snapshots.add(snapshot)
        
        if (snapshots.size > maxSnapshotsPerFile) {
            val evicted = snapshots.removeAt(0)
            ioExecutor.execute {
                offloadToDisk(path, evicted)
            }
        }
    }

    private fun offloadToDisk(path: String, snapshot: Snapshot) {
        val vestigeDir = File(project.basePath, ".vestige/history")
        if (!vestigeDir.exists()) vestigeDir.mkdirs()
        
        val fileId = path.hashCode().toString()
        val historyFile = File(vestigeDir, "$fileId.log")
        
        try {
            // Append header only, don't store full content in main log to save space
            historyFile.appendText("${snapshot.timestamp}|${snapshot.hash}|${snapshot.content.take(200)}...\n")
        } catch (e: Exception) {
            // Silently fail history backup
        }
    }

    fun getSnapshots(file: VirtualFile): List<Snapshot> {
        return shadowStore[file.path] ?: emptyList()
    }
    
    fun clearHistory(file: VirtualFile) {
        shadowStore.remove(file.path)
    }
}
