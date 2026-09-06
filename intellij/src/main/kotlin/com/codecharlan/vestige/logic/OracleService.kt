package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import java.util.concurrent.ConcurrentHashMap

@Service(Service.Level.PROJECT)
class OracleService(private val project: Project) {

    companion object {
        /** Minimum gap between drift notifications for the same file. */
        private const val NOTIFY_COOLDOWN_MS = 10 * 60 * 1000L
    }

    /** file path -> last time we notified about it. */
    private val lastNotified = ConcurrentHashMap<String, Long>()

    /**
     * Warns when the saved file has historically-coupled siblings.
     *
     * Called from the file listener's background read action on every save, so
     * it is cancellable and rate-limited: without the cooldown this posted a
     * fresh notification on every single save of a coupled file.
     */
    fun checkSemanticDrift(file: VirtualFile) {
        ProgressManager.checkCanceled()

        val now = System.currentTimeMillis()
        lastNotified[file.path]?.let { previous ->
            if (now - previous < NOTIFY_COOLDOWN_MS) return
        }

        val analyzer = project.getService(VestigeGitAnalyzer::class.java)
        val coupledFiles = analyzer.getCoupledFiles(file)
        if (coupledFiles.isEmpty()) return

        // Filter for files with high coupling (> 60%)
        val highlyCoupled = coupledFiles.filter {
            ProgressManager.checkCanceled()
            it.frequency > 60
        }
        if (highlyCoupled.isEmpty()) return

        lastNotified[file.path] = now
        // Keep the cooldown map from growing without bound.
        if (lastNotified.size > 500) lastNotified.clear()

        val notifications = project.getService(VestigeSmartNotifications::class.java)
        val fileNames = highlyCoupled.joinToString(", ") { it.file.substringAfterLast("/") }

        notifications.showInfo(
            "Oracle: Coupled Files",
            "This file historically changes together with $fileNames (in over 60% of its recent commits). If your change affects shared behavior, those files may need a matching update."
        )
    }
}
