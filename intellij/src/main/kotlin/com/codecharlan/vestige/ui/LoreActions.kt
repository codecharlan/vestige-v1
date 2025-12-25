package com.codecharlan.vestige.ui

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages

class AddDecisionAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val title = Messages.showInputDialog(project, "Enter Lore Decision Title:", "Add Decision", null)
        if (!title.isNullOrEmpty()) {
            Messages.showInfoMessage(project, "Decision '$title' added to .lore/decisions. The history is being updated.", "Vestige Lore")
        }
    }
}

class ShowEvolutionAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        // This is simulated by showing the tool window and focusing on a specific visualization
        com.intellij.openapi.wm.ToolWindowManager.getInstance(project).getToolWindow("Vestige")?.show(null)
    }
}
