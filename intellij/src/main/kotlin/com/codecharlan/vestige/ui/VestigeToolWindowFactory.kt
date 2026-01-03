package com.codecharlan.vestige.ui

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTabbedPane
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.content.ContentFactory
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import javax.swing.JPanel
import javax.swing.JScrollPane

class VestigeToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val contentFactory = ContentFactory.getInstance()

        // Aura Dashboard (New Zenith Experience)
        val auraPanel = VestigeAuraPanel(project)
        val auraContent = contentFactory.createContent(auraPanel, "Aura", false)
        toolWindow.contentManager.addContent(auraContent, 0)

        // Timeline Tab (Dashboard)
        val timelinePanel = JPanel(BorderLayout())
        timelinePanel.add(VestigeStatusDashboard(project), BorderLayout.CENTER)
        
        val timelineContent = contentFactory.createContent(timelinePanel, "Timeline", false)
        toolWindow.contentManager.addContent(timelineContent)

        // Graveyard Tab
        val graveyardPanel = GraveyardPanel(project)
        val graveyardContent = contentFactory.createContent(graveyardPanel, "Graveyard", false)
        toolWindow.contentManager.addContent(graveyardContent)

        // Leaderboard Tab
        val leaderboardPanel = LeaderboardPanel(project)
        val leaderboardContent = contentFactory.createContent(leaderboardPanel, "Leaderboard", false)
        toolWindow.contentManager.addContent(leaderboardContent)

        /* Performance and Flow panels not implemented yet
        // Performance Tab
        val performancePanel = PerformancePanel(project)
        val performanceContent = contentFactory.createContent(performancePanel, "Performance", false)
        toolWindow.contentManager.addContent(performanceContent)

        // Flow Tab
        val flowPanel = FlowPanel(project)
        val flowContent = contentFactory.createContent(flowPanel, "Flow", false)
        toolWindow.contentManager.addContent(flowContent)
        */

        // Gravity Well Tab
        val wellPanel = VestigeGravityWellPanel()
        val wellContent = contentFactory.createContent(wellPanel, "Gravity Well", false)
        toolWindow.contentManager.addContent(wellContent)

        // Skill Tree Tab
        val skillPanel = VestigeSkillTreePanel()
        val skillContent = contentFactory.createContent(skillPanel, "Skill Tree", false)
        toolWindow.contentManager.addContent(skillContent)

        // Onboarding Tab
        val onboardingPanel = VestigeOnboardingPanel(project)
        val onboardingContent = contentFactory.createContent(onboardingPanel, "Onboarding", false)
        toolWindow.contentManager.addContent(onboardingContent)

        // Evolution Preview Tab
        val replayPanel = VestigeEvolutionReplay()
        val replayContent = contentFactory.createContent(replayPanel, "Evolution", false)
        toolWindow.contentManager.addContent(replayContent)
        
        // Health Score Dashboard Tab
        val healthPanel = VestigeHealthDashboardPanel(project)
        val healthContent = contentFactory.createContent(healthPanel, "Health Score", false)
        toolWindow.contentManager.addContent(healthContent)
        
        // Evolution Graph Tab
        val evolutionGraphPanel = VestigeEvolutionGraphPanel(project)
        val evolutionGraphContent = contentFactory.createContent(evolutionGraphPanel, "Evolution Graph", false)
        toolWindow.contentManager.addContent(evolutionGraphContent)
    }
}
