package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.codecharlan.vestige.logic.VestigeService
import com.intellij.ide.projectView.ProjectViewNode
import com.intellij.ide.projectView.ProjectViewNodeDecorator
import com.intellij.ui.SimpleTextAttributes
import java.awt.Color

class VestigeFileDecorator : ProjectViewNodeDecorator {
    override fun decorate(node: ProjectViewNode<*>, data: com.intellij.ide.projectView.PresentationData) {
        val file = node.virtualFile ?: return
        val project = node.project ?: return
        val service = project.getService(VestigeService::class.java)
        val isDir = file.isDirectory
        
        // Ensure the original filename is present before adding badges
        data.addText(file.name, SimpleTextAttributes.REGULAR_ATTRIBUTES)

        if (isDir) {
            val children = file.children.filter { !it.isDirectory }
            if (children.isEmpty()) return
            
            val childStats = children.mapNotNull { service.analyzeFile(it)?.stats }
            if (childStats.isEmpty()) return
            
            val avgCommits = childStats.map { it.commits }.average().toInt()
            val maxAge = childStats.map { it.ageDays }.maxOrNull() ?: 0
            
            val color = when {
                avgCommits > 15 -> VestigeUI.Red
                maxAge > 180 -> VestigeUI.Amber
                else -> VestigeUI.Purple
            }
            
            val prefix = when(color) {
                VestigeUI.Red -> "🔥"
                VestigeUI.Amber -> "🗿"
                else -> "🌌"
            }
            
            data.addText(" $prefix Group", SimpleTextAttributes(SimpleTextAttributes.STYLE_PLAIN, color))
            data.tooltip = "Vestige: Aggregated Heat (Avg $avgCommits commits)"
            return
        }
        
        // Individual File Decoration
        val result = service.analyzeFile(file) ?: return
        val stats = result.stats
        val realTime = result.realTimeStats
        
        val badges = mutableListOf<String>()
        if (stats != null) {
            when {
                stats.commits > 20 -> badges.add("🔥")
                stats.ageDays > 365 -> badges.add("🗿")
                stats.commits > 10 -> badges.add("⚡")
                else -> badges.add("✨")
            }
            result.busFactor?.let { busFactor ->
                if (busFactor.risk == "critical" || busFactor.risk == "high") badges.add("⚠️")
            }
        } else {
            realTime?.let {
                if (it.isNewFile) {
                    badges.add("✨")
                } else if (it.complexity > 30) {
                    badges.add("⚙️")
                } else {
                    // No badge
                }
            }
        }

        val color = when {
            stats?.commits ?: 0 > 20 -> VestigeUI.Red
            stats?.ageDays ?: 0 > 365 -> VestigeUI.Amber
            realTime?.isNewFile == true -> VestigeUI.Green
            else -> VestigeUI.Purple
        }
        
        if (badges.isNotEmpty()) {
            data.addText(" ${badges.joinToString(" ")}", SimpleTextAttributes(SimpleTextAttributes.STYLE_PLAIN, color))
        }
        
        data.tooltip = buildString {
            append("Vestige Intelligence\n")
            stats?.let { append("• Age: ${it.ageDays} days\n• Churn: ${it.commits} commits\n") }
            realTime?.let { append("• Health: ${it.codeHealth}\n") }
            append("• Status: Luminous")
        }
    }
}
