package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
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

/**
 * Status-bar readout for the selected file.
 *
 * [getText], [getTooltipText] and [getPresentation] are all called by the
 * platform on the EDT, and the tooltip in particular is called while the mouse
 * hovers. They are therefore strict cache reads. The refresh timer is the only
 * thing that requests analysis, and it does so off the EDT.
 */
class VestigeStatusBarWidget(private val project: Project) : StatusBarWidget, StatusBarWidget.TextPresentation {
    override fun ID(): String = "VestigeStatusBar"
    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun install(statusBar: StatusBar) {
        // Periodic refresh. Kept at 30s: each update can trigger re-analysis once the
        // service cache TTL expires, so a short interval would force constant re-analysis.
        updateTimer.start()
    }

    override fun dispose() {
        updateTimer.stop()
    }

    private val updateTimer = Timer(30000) {
        if (!project.isDisposed) {
            // Ask for a refresh of the selected file's analysis here, on the
            // timer, rather than from getText/getTooltipText. analyzeFileAsync
            // returns immediately and publishes via the service's listeners.
            selectedFile()?.let { file ->
                project.getService(VestigeService::class.java)?.analyzeFileAsync(file)
            }
            com.intellij.openapi.wm.WindowManager.getInstance().getStatusBar(project)?.updateWidget(ID())
        }
    }

    private fun selectedFile(): VirtualFile? {
        if (project.isDisposed) return null
        return FileEditorManager.getInstance(project).selectedFiles.firstOrNull()
    }

    /**
     * Cached text only.
     *
     * This used to call `service.getQuickStats`, which calls `analyzeFile`,
     * which schedules analysis and can return a value only after a cache
     * lookup — i.e. the EDT drove analysis scheduling on every status-bar
     * repaint.
     */
    override fun getText(): String {
        val file = selectedFile() ?: return "🗿 Vestige: Ready"
        val service = project.getService(VestigeService::class.java) ?: return "🗿 Vestige: Ready"
        val result = service.getCachedAnalysis(file) ?: return "🗿 Vestige: analysing…"
        val realTime = result.realTimeStats

        return when {
            realTime != null && realTime.isNewFile -> "✨ New file: ${realTime.lineCount} lines"
            result.stats != null -> "🗿 ${result.stats!!.commits} commits | ${result.stability}% stable"
            realTime != null -> "📝 ${realTime.lineCount} lines | ${realTime.codeHealth}"
            else -> "🗿 Vestige: Ready"
        }
    }

    /**
     * Cached text only. The old version called `service.analyzeFile(...)` from
     * inside the tooltip callback.
     */
    override fun getTooltipText(): String {
        val file = selectedFile() ?: return "Vestige Temporal Analysis\nClick to open Vestige panel"
        val service = project.getService(VestigeService::class.java)
        val result = service?.getCachedAnalysis(file)
            ?: return "Vestige Temporal Analysis\nAnalysing ${file.name}…\n\nClick to open Vestige panel"

        val realTime = result.realTimeStats
        val stats = result.stats
        return buildString {
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
    }

    override fun getClickConsumer(): Consumer<MouseEvent>? = Consumer {
        com.intellij.openapi.wm.ToolWindowManager.getInstance(project).getToolWindow("Vestige")?.show(null)
    }

    override fun getAlignment(): Float = 0.5f
}
