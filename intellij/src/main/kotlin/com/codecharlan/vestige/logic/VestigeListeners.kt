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

class VestigeFileListener(private val project: Project) : BulkFileListener {
    override fun after(events: List<VFileEvent>) {
        val service = project.getService(VestigeService::class.java)
        val achService = project.getService(VestigeAchievementService::class.java)
        
        events.forEach { event ->
            if (event is VFileContentChangeEvent) {
                val file = event.file
                if (file.extension in listOf("kt", "java", "js", "ts", "py")) {
                    service.analyzeFile(file, force = true)
                    achService.trackAction("edit")
                }
            }
        }
    }
}

class VestigeEditorListener(private val project: Project) : FileEditorManagerListener {
    override fun selectionChanged(event: com.intellij.openapi.fileEditor.FileEditorManagerEvent) {
        val file = event.newFile ?: return
        val service = project.getService(VestigeService::class.java)
        service.analyzeFile(file)
    }
}
