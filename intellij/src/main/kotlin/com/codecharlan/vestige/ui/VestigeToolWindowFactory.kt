package com.codecharlan.vestige.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import javax.swing.BoxLayout
import javax.swing.JPanel

class VestigeToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val contentFactory = ContentFactory.getInstance()

        // Timeline Tab
        val timelinePanel = JPanel()
        timelinePanel.layout = BoxLayout(timelinePanel, BoxLayout.Y_AXIS)
        timelinePanel.add(VestigePulsePanel())
        timelinePanel.add(VestigeUI.ZenithPanel().apply {
            add(VestigeStatusDashboard(project))
        })
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

        // Performance Tab
        val performancePanel = PerformancePanel(project)
        val performanceContent = contentFactory.createContent(performancePanel, "Performance", false)
        toolWindow.contentManager.addContent(performanceContent)

        // Flow Tab
        val flowPanel = FlowPanel(project)
        val flowContent = contentFactory.createContent(flowPanel, "Flow", false)
        toolWindow.contentManager.addContent(flowContent)

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
    }
}
