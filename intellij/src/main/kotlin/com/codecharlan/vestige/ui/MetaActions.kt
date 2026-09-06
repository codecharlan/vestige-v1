package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.ui.Messages

class ClearCacheAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val service = project.getService(VestigeService::class.java)
        // VestigeService exposes no cache-wipe API; the honest equivalent is to
        // force fresh analysis of the open files, which replaces their cached entries.
        val openFiles = FileEditorManager.getInstance(project).openFiles
        if (openFiles.isEmpty()) {
            Messages.showInfoMessage(
                project,
                "No files are open. Vestige refreshes cached analysis per file; open a file and rerun this action to refresh it.",
                "Vestige"
            )
            return
        }
        openFiles.forEach { service.analyzeFileAsync(it) }
        Messages.showInfoMessage(
            project,
            "Re-analysis started for ${openFiles.size} open file(s). Cached results are replaced as each analysis completes.",
            "Vestige"
        )
    }
}

class ToggleAnnotationsAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val service = project.getService(VestigeService::class.java)
        service.isEnabled = !service.isEnabled
        Messages.showInfoMessage(project, "Vestige Annotations: ${if (service.isEnabled) "Enabled" else "Disabled"}", "Vestige")
    }
}
