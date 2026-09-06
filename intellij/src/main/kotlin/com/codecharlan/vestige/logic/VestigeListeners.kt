package com.codecharlan.vestige.logic

import com.codecharlan.vestige.ui.*
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileContentChangeEvent
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.intellij.util.Alarm
import com.intellij.util.concurrency.AppExecutorUtil
import java.util.concurrent.ConcurrentHashMap

class VestigeFileListener(private val project: Project) : BulkFileListener {
    private val log = Logger.getInstance(VestigeFileListener::class.java)
    private val eventQueue = ConcurrentHashMap.newKeySet<VirtualFile>()
    private val processingAlarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, project)

    override fun after(events: List<VFileEvent>) {
        if (project.isDisposed || DumbService.isDumb(project)) return

        // Queue files for batch processing
        events.forEach { event ->
            event.file?.let { file ->
                if (file.extension in listOf("kt", "java", "js", "ts", "py", "tsx", "jsx", "go", "rs", "cpp", "c", "h", "hpp")) {
                    eventQueue.add(file)
                }
            }
        }

        // If small batch, process immediately. Otherwise debounce
        if (eventQueue.size <= 3) {
            processQueuedEvents()
        } else {
            processingAlarm.cancelAllRequests()
            processingAlarm.addRequest({
                processQueuedEvents()
            }, 500) // Reduced from 2000ms
        }
    }

    private fun processQueuedEvents() {
        if (eventQueue.isEmpty() || project.isDisposed) return

        val service = project.getService(VestigeService::class.java)
        val achService = project.getService(VestigeAchievementService::class.java)
        val notifications = project.getService(VestigeSmartNotifications::class.java)
        val loreGen = project.getService(SentientLoreGenerator::class.java)
        val shadowEngine = project.getService(ShadowHistoryEngine::class.java)
        val oracle = project.getService(OracleService::class.java)

        val filesToProcess = eventQueue.toList()
        eventQueue.clear()

        // Process in background, limit to first 10 files to prevent overload
        filesToProcess.take(10).forEach { file ->
            // Auxiliary scans run in a proper non-blocking read action off the EDT
            ReadAction.nonBlocking<Unit> {
                if (project.isDisposed || DumbService.isDumb(project) || !file.isValid) return@nonBlocking
                loreGen.scanAndSuggest(file)
                shadowEngine.captureSnapshot(file)
                oracle.checkSemanticDrift(file)
            }
                .inSmartMode(project)
                .expireWith(service)
                .submit(AppExecutorUtil.getAppExecutorService())
                .onError { e ->
                    // Cancellation is normal here — a write action (i.e. the user
                    // typing) cancels the read action by design. Logging it as a
                    // failure buries real errors in noise.
                    if (e !is com.intellij.openapi.progress.ProcessCanceledException) {
                        log.warn("Vestige background scan failed for ${file.path}", e)
                    }
                }

            // Route the actual analysis through the service's async pipeline
            // (force bypasses the cache; listeners are notified on the EDT when done).
            service.analyzeFile(file, force = true)

            // Achievement tracking may show UI, so keep it (and the contextual hint) on the EDT
            ApplicationManager.getApplication().invokeLater {
                if (project.isDisposed) return@invokeLater
                try {
                    achService.trackAction("edit")
                    val result = service.getCachedAnalysis(file)
                    if (result != null) {
                        notifications.showContextualHint(file, result)
                    }
                } catch (e: Exception) {
                    log.warn("Vestige post-save UI update failed for ${file.path}", e)
                }
            }
        }
    }
}

class VestigeEditorListener(private val project: Project) : FileEditorManagerListener {
    override fun selectionChanged(event: com.intellij.openapi.fileEditor.FileEditorManagerEvent) {
        val file = event.newFile ?: return
        if (project.isDisposed || DumbService.isDumb(project)) return

        val service = project.getService(VestigeService::class.java)
        val notifications = project.getService(VestigeSmartNotifications::class.java)

        // Analyze file in background when opened (non-blocking read action pipeline)
        service.analyzeFileAsync(file)

        // Show helpful tip occasionally (10% chance) - always on the EDT
        if (Math.random() < 0.1) {
            ApplicationManager.getApplication().invokeLater {
                if (!project.isDisposed) {
                    notifications.showTip()
                }
            }
        }
    }
}
