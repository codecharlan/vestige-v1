package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.content.Content
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.content.ContentManagerEvent
import com.intellij.ui.content.ContentManagerListener
import java.awt.BorderLayout
import java.awt.GridBagLayout
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * Builds the Vestige tool window.
 *
 * Tabs are **lazy**. The previous version constructed all eleven panels on the
 * EDT the moment the tool window opened — including a JCEF browser, two Swing
 * animation timers and several panels that immediately kicked off git work —
 * so opening the tool window stalled the UI even if the user only wanted one
 * tab. Each panel is now built the first time its tab is actually selected.
 */
class VestigeToolWindowFactory : ToolWindowFactory {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val contentFactory = ContentFactory.getInstance()
        val manager = toolWindow.contentManager

        // Short, plain tab names. The old set mixed jargon ("Gravity Well",
        // "Aura") with two near-identical "Evolution" tabs.
        val tabs: List<Pair<String, (Project) -> JComponent>> = listOf(
            "Overview" to { p -> VestigeAuraPanel(p) },
            "Current File" to { p -> VestigeStatusDashboard(p) },
            "Health" to { p -> VestigeHealthDashboardPanel(p) },
            "Commits" to { p -> VestigeEvolutionGraphPanel(p) },
            "Activity" to { p -> VestigeGravityWellPanel(p) },
            "Deleted Code" to { p -> GraveyardPanel(p) },
            "Onboarding" to { p -> VestigeOnboardingPanel(p) },
            "Skills" to { _ -> VestigeSkillTreePanel() },
            "Replay" to { _ -> VestigeEvolutionReplay() }
        )

        val loader = LazyTabLoader(project)

        // The listener has to be registered before the contents are added, so
        // that the automatic selection of the first tab realises it too.
        manager.addContentManagerListener(loader)

        tabs.forEach { (title, builder) ->
            val host = JPanel(BorderLayout()).apply {
                background = VestigeUI.Surface
                isOpaque = true
                add(placeholder(), BorderLayout.CENTER)
            }
            val content = contentFactory.createContent(host, title, false).apply {
                isCloseable = false
            }
            loader.register(content, host, builder)
            manager.addContent(content)
        }

        manager.selectedContent?.let { loader.realize(it) }

        // Trigger initial analysis for the current file once indexing is done.
        DumbService.getInstance(project).runWhenSmart {
            if (project.isDisposed) return@runWhenSmart
            com.intellij.openapi.fileEditor.FileEditorManager.getInstance(project)
                .selectedFiles.firstOrNull()?.let { file ->
                    project.getService(VestigeService::class.java).analyzeFileAsync(file)
                }
        }
    }

    private fun placeholder(): JComponent = JPanel(GridBagLayout()).apply {
        isOpaque = false
        add(JBLabel("Loading…").apply {
            font = VestigeUI.bodyFont()
            foreground = VestigeUI.TextMuted
        })
    }

    /**
     * Creates each tab's panel on first selection and drops it into the tab's
     * host container. Building into a host panel (rather than swapping
     * [Content.setComponent]) keeps the tool window's own component bookkeeping
     * untouched.
     */
    private class LazyTabLoader(private val project: Project) : ContentManagerListener {

        private class Tab(val host: JPanel, val builder: (Project) -> JComponent) {
            var realized = false
        }

        private val tabs = HashMap<Content, Tab>()

        fun register(content: Content, host: JPanel, builder: (Project) -> JComponent) {
            tabs[content] = Tab(host, builder)
        }

        fun realize(content: Content) {
            val tab = tabs[content] ?: return
            if (tab.realized || project.isDisposed) return
            tab.realized = true

            val component = try {
                tab.builder(project)
            } catch (e: Exception) {
                Logger.getInstance(VestigeToolWindowFactory::class.java)
                    .warn("Failed to build Vestige tab '${content.displayName}'", e)
                VestigeUI.emptyState(
                    "This tab could not be opened",
                    e.message ?: "Unexpected error while building the panel."
                )
            }

            tab.host.removeAll()
            tab.host.add(component, BorderLayout.CENTER)
            tab.host.revalidate()
            tab.host.repaint()
        }

        override fun selectionChanged(event: ContentManagerEvent) {
            if (event.operation == ContentManagerEvent.ContentOperation.add) {
                realize(event.content)
            }
        }

        override fun contentRemoved(event: ContentManagerEvent) {
            tabs.remove(event.content)
        }
    }
}
