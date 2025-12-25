package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeRewindService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages

class RewindAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val hash = Messages.showInputDialog(project, "Enter commit hash to rewind to:", "Vestige Rewind", null)
        if (!hash.isNullOrEmpty()) {
            project.getService(VestigeRewindService::class.java).startRewind(hash)
        }
    }
}
