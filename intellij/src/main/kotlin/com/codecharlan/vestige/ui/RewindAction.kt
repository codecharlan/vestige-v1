package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeRewindService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages

class RewindAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val file = e.getData(com.intellij.openapi.actionSystem.CommonDataKeys.VIRTUAL_FILE) ?: return
        val analyzer = project.getService(com.codecharlan.vestige.logic.VestigeGitAnalyzer::class.java)
        val commits = analyzer.getFileHistory(file)
        
        if (commits.isEmpty()) {
            Messages.showWarningDialog(project, "No history found for this file.", "Vestige Rewind")
            return
        }

        val picker = VestigeCommitPicker(project, file, commits)
        if (picker.showAndGet()) {
            val hash = picker.getSelectedHash()
            if (!hash.isNullOrEmpty()) {
                project.getService(VestigeRewindService::class.java).startRewind(hash)
            }
        }
    }
}
