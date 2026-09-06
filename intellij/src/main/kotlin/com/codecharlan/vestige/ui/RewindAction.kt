package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.codecharlan.vestige.logic.VestigeRewindService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.ui.Messages

class RewindAction : AnAction() {
    /**
     * Reading the file's history is a git operation, so it runs in a
     * [Task.Backgroundable] and the picker opens from `onSuccess`. Calling
     * `getFileHistory` directly here blocked the EDT for the duration of the
     * walk, with no progress indicator and no way to cancel.
     */
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val file = e.getData(com.intellij.openapi.actionSystem.CommonDataKeys.VIRTUAL_FILE) ?: return
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)

        object : Task.Backgroundable(project, "Reading history of ${file.name}", true) {
            private var commits: List<VestigeGitAnalyzer.CommitInfo> = emptyList()

            override fun run(indicator: ProgressIndicator) {
                commits = analyzer.getFileHistory(file)
            }

            override fun onSuccess() {
                if (project.isDisposed) return
                if (commits.isEmpty()) {
                    Messages.showWarningDialog(project, "No history found for this file.", "Vestige Rewind")
                    return
                }

                val picker = VestigeCommitPicker(project, file, commits)
                if (picker.showAndGet()) {
                    val hash = picker.getSelectedHash()
                    if (!hash.isNullOrEmpty()) {
                        // The service runs the git commands on a background thread
                        project.getService(VestigeRewindService::class.java).startRewind(hash)
                    }
                }
            }
        }.queue()
    }
}

/**
 * Checks out the branch that was active before the last rewind.
 */
class ReturnToPresentAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        project.getService(VestigeRewindService::class.java).stopRewind()
    }
}
