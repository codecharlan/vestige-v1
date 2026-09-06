package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys

class AnalyzeFileAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return
        val service = project.getService(VestigeService::class.java)

        // Analysis runs asynchronously (never on the EDT); registered listeners
        // (status bar, tool window, ...) are notified when the result is ready.
        service.analyzeFile(file, force = true)

        NotificationGroupManager.getInstance()
            .getNotificationGroup("VestigeNotifications")
            .createNotification(
                "Vestige",
                "Analyzing ${file.name} in the background...",
                NotificationType.INFORMATION
            )
            .notify(project)
    }
}
