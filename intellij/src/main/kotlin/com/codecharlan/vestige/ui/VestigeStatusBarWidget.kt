package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.util.Consumer
import java.awt.event.MouseEvent

class VestigeStatusBarWidgetFactory : StatusBarWidgetFactory {
    override fun getId(): String = "VestigeStatusBar"
    override fun getDisplayName(): String = "Vestige Status"
    override fun isAvailable(project: Project): Boolean = true
    override fun createWidget(project: Project): StatusBarWidget = VestigeStatusBarWidget(project)
    override fun disposeWidget(widget: StatusBarWidget) {}
    override fun canBeEnabledOn(statusBar: StatusBar): Boolean = true
}

class VestigeStatusBarWidget(private val project: Project) : StatusBarWidget, StatusBarWidget.TextPresentation {
    override fun ID(): String = "VestigeStatusBar"
    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this
    override fun install(statusBar: StatusBar) {}
    override fun dispose() {}

    override fun getText(): String {
        val service = project.getService(VestigeService::class.java)
        // In a real implementation we'd get the current file's analysis
        // Placeholder text for parity
        return "🗿 Vestige: 95% Stability | 👤 You (100%)"
    }

    override fun getTooltipText(): String = "Vestige Temporal Analysis\nClick for details"
    override fun getClickConsumer(): Consumer<MouseEvent>? = Consumer {
        com.intellij.openapi.wm.ToolWindowManager.getInstance(project).getToolWindow("Vestige")?.show(null)
    }
    override fun getAlignment(): Float = 0.5f
}
