package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.application.ApplicationManager
import java.io.File

@Service(Service.Level.PROJECT)
class SentientLoreGenerator(private val project: Project) {

    fun scanAndSuggest(file: VirtualFile) {
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)
        val history = analyzer.getFileHistory(file, 5)
        
        if (history.isEmpty()) return

        // Look for keywords in recent commits that suggest a major decision
        val keywords = listOf("refactor", "architect", "rewrite", "replace", "decision", "migration")
        val significantCommit = history.find { commit ->
            keywords.any { keyword -> commit.message.lowercase().contains(keyword) }
        }

        if (significantCommit != null) {
            suggestLore(file, significantCommit)
        }
    }

    private fun suggestLore(file: VirtualFile, commit: VestigeGitAnalyzer.CommitInfo) {
        val notifications = project.getService(VestigeSmartNotifications::class.java)
        notifications.showInfo(
            "Sentient Lore Suggestion",
            "I've detected a significant architectural shift in ${file.name}. Should I capture this as a Lore decision?"
        )
        
        // In a real implementation, we would offer an action to auto-generate the .lean file
        // For now, we'll just log it.
        println("Sentient Lore: Suggesting decision capture for ${commit.hash}")
    }
}
