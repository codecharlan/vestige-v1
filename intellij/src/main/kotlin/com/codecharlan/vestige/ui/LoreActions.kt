package com.codecharlan.vestige.ui

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.LocalFileSystem
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date

class AddDecisionAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val basePath = project.basePath
        if (basePath == null) {
            Messages.showErrorDialog(project, "Cannot record a decision: this project has no base directory.", "Vestige Lore")
            return
        }
        val title = Messages.showInputDialog(project, "Enter Lore Decision Title:", "Add Decision", null)
        if (title.isNullOrBlank()) return
        val decisionText = Messages.showInputDialog(project, "Describe the decision (optional):", "Add Decision", null) ?: ""

        try {
            val decisionsDir = File(basePath, ".lore/decisions")
            if (!decisionsDir.exists() && !decisionsDir.mkdirs()) {
                Messages.showErrorDialog(project, "Could not create ${decisionsDir.path}.", "Vestige Lore")
                return
            }

            val slug = title.lowercase()
                .replace(Regex("[^a-z0-9]+"), "-")
                .trim('-')
                .take(60)
                .ifEmpty { "decision" }
            var target = File(decisionsDir, "$slug.lean")
            if (target.exists()) {
                target = File(decisionsDir, "$slug-${System.currentTimeMillis()}.lean")
            }

            val date = SimpleDateFormat("yyyy-MM-dd").format(Date())
            val content = buildString {
                append("title: \"").append(escapeLean(title)).append("\"\n")
                append("status: \"accepted\"\n")
                append("date: \"").append(date).append("\"\n")
                append("decision: \"").append(escapeLean(decisionText)).append("\"\n")
            }
            target.writeText(content)

            LocalFileSystem.getInstance().refreshAndFindFileByIoFile(target)
            Messages.showInfoMessage(
                project,
                "Decision '$title' written to ${target.relativeTo(File(basePath)).path}.",
                "Vestige Lore"
            )
        } catch (ex: Exception) {
            Messages.showErrorDialog(project, "Failed to write decision file: ${ex.message}", "Vestige Lore")
        }
    }

    private fun escapeLean(value: String): String {
        return value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\r", "")
            .replace("\n", "\\n")
    }
}

class ShowEvolutionAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        // This is simulated by showing the tool window and focusing on a specific visualization
        com.intellij.openapi.wm.ToolWindowManager.getInstance(project).getToolWindow("Vestige")?.show(null)
    }
}
