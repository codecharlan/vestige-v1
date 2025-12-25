package com.codecharlan.vestige.ui

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages

class HistoryQueryAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val query = Messages.showInputDialog(
            project,
            "Ask the AI about the project history (e.g., 'Who knows most about the database?')",
            "Natural Language History Query",
            null
        )
        
        if (!query.isNullOrEmpty()) {
            Messages.showInfoMessage(project, "Processing query: '$query'... (AI Historian result will appear in Tool Window)", "Vestige")
            // Logic to call AIService would go here
        }
    }
}
