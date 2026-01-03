package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.util.Consumer
import java.awt.event.MouseEvent
import javax.swing.Timer

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
    override fun install(statusBar: StatusBar) {
        // Auto-update every 2 seconds to show real-time stats
        updateTimer.start()
    }
    override fun dispose() {
        updateTimer.stop()
    }
    
    private val updateTimer = Timer(2000) {
        com.intellij.openapi.wm.WindowManager.getInstance().getStatusBar(project)?.updateWidget(ID())
    }

    override fun getText(): String {
        val service = project.getService(VestigeService::class.java)
        
        // Get currently open file
        val fileEditorManager = FileEditorManager.getInstance(project)
        val currentFile = fileEditorManager.selectedFiles.firstOrNull()
        
        return if (currentFile != null) {
            service.getQuickStats(currentFile)
        } else {
            "🗿 Vestige: Ready"
        }
    }

    override fun getTooltipText(): String {
        val fileEditorManager = FileEditorManager.getInstance(project)
        val currentFile = fileEditorManager.selectedFiles.firstOrNull()
        
        return if (currentFile != null) {
            val service = project.getService(VestigeService::class.java)
            val result = service.analyzeFile(currentFile)
            val realTime = result?.realTimeStats
            val stats = result?.stats
            buildString {
                append("Vestige Temporal Analysis\n")
                append("━━━━━━━━━━━━━━━━━━━━\n")
                if (realTime != null) {
                    append("📝 Lines: ${realTime.lineCount}\n")
                    append("⚡ Complexity: ${realTime.complexity}\n")
                    append("📊 Health: ${realTime.codeHealth}\n")
                    if (realTime.isNewFile) {
                        append("✨ New file (not in git)\n")
                    }
                }
                if (stats != null) {
                    append("📅 Age: ${stats.ageDays} days\n")
                    append("🔄 Commits: ${stats.commits}\n")
                    append("👤 Top author: ${stats.topAuthor}\n")
                }
                append("\nClick to open Vestige panel")
            }
        } else {
            "Vestige Temporal Analysis\nClick to open Vestige panel"
        }
    }
    
    override fun getClickConsumer(): Consumer<MouseEvent>? = Consumer {
        com.intellij.openapi.wm.ToolWindowManager.getInstance(project).getToolWindow("Vestige")?.show(null)
    }
    override fun getAlignment(): Float = 0.5f
}
