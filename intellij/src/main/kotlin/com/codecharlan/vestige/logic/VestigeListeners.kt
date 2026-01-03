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
import com.intellij.util.concurrency.AppExecutorUtil
import java.util.concurrent.CompletableFuture

class VestigeFileListener(private val project: Project) : BulkFileListener {
    override fun after(events: List<VFileEvent>) {
        events.forEach { event ->
            event.file?.let { file ->
                project.getService(SentientLoreGenerator::class.java).scanAndSuggest(file)
                project.getService(ShadowHistoryEngine::class.java).captureSnapshot(file)
                project.getService(OracleService::class.java).checkSemanticDrift(file)
            }
        }
        val service = project.getService(VestigeService::class.java)
        val achService = project.getService(VestigeAchievementService::class.java)
        val notifications = project.getService(VestigeSmartNotifications::class.java)
        
        events.forEach { event ->
            if (event is VFileContentChangeEvent) {
                val file = event.file
                if (file.extension in listOf("kt", "java", "js", "ts", "py", "tsx", "jsx", "go", "rs", "cpp", "c", "h", "hpp")) {
                    // Analyze in background thread
                    CompletableFuture.runAsync({
                        val result = service.analyzeFile(file, force = true)
                        achService.trackAction("edit")
                        
                        // Show contextual notification if needed (on EDT)
                        result?.let { 
                            com.intellij.openapi.application.ApplicationManager.getApplication().invokeLater {
                                notifications.showContextualHint(file, it)
                            }
                        }
                    }, AppExecutorUtil.getAppExecutorService())
                }
            }
        }
    }
}

class VestigeEditorListener(private val project: Project) : FileEditorManagerListener {
    override fun selectionChanged(event: com.intellij.openapi.fileEditor.FileEditorManagerEvent) {
        val file = event.newFile ?: return
        val service = project.getService(VestigeService::class.java)
        val notifications = project.getService(VestigeSmartNotifications::class.java)
        
        // Analyze file in background when opened
        CompletableFuture.runAsync({
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
