package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeLoreService
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ui.Messages

class HistoryQueryAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val query = Messages.showInputDialog(
            project,
            "Search recorded project decisions (.lore/decisions):",
            "Project History Query",
            null
        )

        if (query.isNullOrBlank()) return

        val apiKey = PropertiesComponent.getInstance().getValue("vestige.openaiApiKey", "")
        val loreService = project.getService(VestigeLoreService::class.java)

        ApplicationManager.getApplication().executeOnPooledThread {
            val matches = loreService.searchDecisions(query)
            ApplicationManager.getApplication().invokeLater {
                if (project.isDisposed) return@invokeLater
                val header = if (apiKey.isEmpty()) {
                    "Note: AI-powered natural language answers require an OpenAI API key (Settings > Vestige) and are not configured. Showing keyword matches from recorded lore decisions instead.\n\n"
                } else {
                    "Note: free-form AI history answers are not implemented in this version. Showing keyword matches from recorded lore decisions.\n\n"
                }
                val body = if (matches.isEmpty()) {
                    "No recorded decisions match '$query'."
                } else {
                    matches.take(10).joinToString("\n") { d ->
                        val title = d["title"] as? String ?: "(untitled)"
                        val date = d["date"] as? String ?: ""
                        val status = d["status"] as? String ?: ""
                        "• $title ${if (date.isNotEmpty()) "($date)" else ""} ${if (status.isNotEmpty()) "[$status]" else ""}".trim()
                    }
                }
                Messages.showInfoMessage(project, header + body, "Vestige History Query")
            }
        }
    }
}
