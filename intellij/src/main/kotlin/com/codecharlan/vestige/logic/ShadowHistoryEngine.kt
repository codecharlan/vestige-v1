package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.time.Instant

@Service(Service.Level.PROJECT)
class ShadowHistoryEngine(private val project: Project) {
    
    data class Snapshot(
        val content: String,
        val timestamp: Instant,
        val hash: String
    )

    private val shadowStore = ConcurrentHashMap<String, MutableList<Snapshot>>()
    private val maxSnapshotsPerFile = 50 // Roughly 4 hours if snapshotting every 5 mins

    fun captureSnapshot(file: VirtualFile) {
        val path = file.path
        val content = try { String(file.contentsToByteArray()) } catch (e: Exception) { return }
        val hash = content.hashCode().toString()
        
        val snapshots = shadowStore.getOrPut(path) { mutableListOf() }
        
        if (snapshots.isNotEmpty() && snapshots.last().hash == hash) return
        
        val snapshot = Snapshot(content, Instant.now(), hash)
        snapshots.add(snapshot)
        
        if (snapshots.size > maxSnapshotsPerFile) {
            offloadToDisk(path, snapshots.removeAt(0))
        }
    }

    private fun offloadToDisk(path: String, snapshot: Snapshot) {
        val vestigeDir = File(project.basePath, ".vestige/history")
        if (!vestigeDir.exists()) vestigeDir.mkdirs()
        
        val fileId = path.hashCode().toString()
        val historyFile = File(vestigeDir, "$fileId.log")
        
        try {
            historyFile.appendText("${snapshot.timestamp}|${snapshot.hash}|${snapshot.content.take(100)}...\n")
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
