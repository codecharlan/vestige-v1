package com.codecharlan.vestige.logic

import com.codecharlan.vestige.ui.*
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.intellij.openapi.vfs.newvfs.events.VFileContentChangeEvent
import com.intellij.openapi.project.DumbService
import com.intellij.util.Alarm
import com.intellij.util.concurrency.AppExecutorUtil
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import com.intellij.openapi.application.ReadAction

class VestigeFileListener(private val project: Project) : BulkFileListener {
    private val eventQueue = ConcurrentHashMap.newKeySet<VirtualFile>()
    private val processingAlarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, project)
    
    override fun after(events: List<VFileEvent>) {
        if (DumbService.isDumb(project)) return
        
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
        if (eventQueue.isEmpty()) return
        
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
            CompletableFuture.runAsync({
                if (DumbService.isDumb(project)) return@runAsync
                
                loreGen.scanAndSuggest(file)
                shadowEngine.captureSnapshot(file)
                oracle.checkSemanticDrift(file)
                
                val result = service.analyzeFile(file, force = true)
                achService.trackAction("edit")
                
                if (result != null) {
                    com.intellij.openapi.application.ApplicationManager.getApplication().invokeLater {
                        notifications.showContextualHint(file, result)
                    }
                }
            }, AppExecutorUtil.getAppExecutorService())
        }
    }
}

class VestigeEditorListener(private val project: Project) : FileEditorManagerListener {
    override fun selectionChanged(event: com.intellij.openapi.fileEditor.FileEditorManagerEvent) {
        val file = event.newFile ?: return
        if (DumbService.isDumb(project)) return
        
        val service = project.getService(VestigeService::class.java)
        val notifications = project.getService(VestigeSmartNotifications::class.java)
        
        // Analyze file in background when opened
        CompletableFuture.runAsync({
            if (DumbService.isDumb(project)) return@runAsync
            
            val result = service.analyzeFile(file)
            // Show helpful tip occasionally (10% chance)
            if (Math.random() < 0.1) {
                com.intellij.openapi.application.ApplicationManager.getApplication().invokeLater {
                    notifications.showTip()
                }
            }
        }, AppExecutorUtil.getAppExecutorService())
    }
}
