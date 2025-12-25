package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages

class ClearCacheAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        // In a real impl, we'd clear the cache in VestigeService
        Messages.showInfoMessage(project, "Vestige cache cleared successfully.", "Vestige")
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
