package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import java.awt.GridLayout
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JPanel

/**
 * At-a-glance panel for the file currently in the editor.
 *
 * Update model: this panel used to poll every 3 seconds and call
 * `analyzeFile` from the Swing timer. Because analysis freshness was
 * time-based, that guaranteed a fresh (multi-second, write-lock-blocking)
 * analysis every time the TTL lapsed — a periodic freeze on a completely idle
 * IDE. It is now event-driven: it reads cache only on the EDT and repaints
 * when the service reports new results or the selected file changes.
 */
class VestigeStatusDashboard(private val project: Project) : JPanel(), VestigeService.AnalysisListener {

    private val statsGrid = JPanel(GridLayout(0, 2, VestigeUI.SpaceSm, VestigeUI.SpaceSm))
    private val body = JPanel(BorderLayout())
    private var currentFile: VirtualFile? = null
    private var connection: com.intellij.util.messages.MessageBusConnection? = null

    init {
        layout = BorderLayout()
        background = VestigeUI.Surface
        isOpaque = true
        border = JBUI.Borders.empty(VestigeUI.SpaceLg)

        add(buildHeader(), BorderLayout.NORTH)

        statsGrid.isOpaque = false
        body.isOpaque = false
        body.add(statsGrid, BorderLayout.NORTH)
        add(body, BorderLayout.CENTER)
    }

    private fun buildHeader(): JPanel = JPanel(BorderLayout()).apply {
        isOpaque = false
        border = JBUI.Borders.emptyBottom(VestigeUI.SpaceLg)

        val titleBlock = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(JBLabel("Vestige").apply {
                font = VestigeUI.titleFont()
                foreground = VestigeUI.TextPrimary
                alignmentX = Component.LEFT_ALIGNMENT
            })
            add(Box.createVerticalStrut(VestigeUI.SpaceXs))
            add(JBLabel("History and risk for the file you're in").apply {
                font = VestigeUI.captionFont()
                foreground = VestigeUI.TextMuted
                alignmentX = Component.LEFT_ALIGNMENT
            })
        }
        add(titleBlock, BorderLayout.WEST)
    }

    override fun addNotify() {
        super.addNotify()
        project.getService(VestigeService::class.java).addListener(this)

        // Follow the editor selection instead of polling for it.
        connection = project.messageBus.connect().also { conn ->
            conn.subscribe(FileEditorManagerListener.FILE_EDITOR_MANAGER, object : FileEditorManagerListener {
                override fun selectionChanged(event: FileEditorManagerEvent) {
                    refresh()
                }
            })
        }
        refresh()
    }

    override fun removeNotify() {
        project.getService(VestigeService::class.java).removeListener(this)
        connection?.disconnect()
        connection = null
        super.removeNotify()
    }

    /** Called by the service when a background analysis completes. */
    override fun onAnalysisUpdated(file: VirtualFile, result: VestigeService.AnalysisResult) {
        if (file == currentFile) {
            ApplicationManager.getApplication().invokeLater {
                if (!project.isDisposed && isShowing) render(result)
            }
        }
    }

    private fun refresh() {
        if (project.isDisposed) return
        val file = FileEditorManager.getInstance(project).selectedFiles.firstOrNull()
        currentFile = file

        if (file == null) {
            showEmpty("No file open", "Open a tracked file to see its history and risk.")
            return
        }

        val service = project.getService(VestigeService::class.java)
        // EDT-safe: cache only. Never analyse from the UI thread.
        val cached = service.getCachedAnalysisOnly(file)
        if (cached != null) {
            render(cached)
        } else {
            showEmpty("Analysing ${file.name}…", "Results appear here as soon as the scan finishes.")
            service.analyzeFileAsync(file)
        }
    }

    private fun showEmpty(title: String, detail: String) {
        statsGrid.removeAll()
        body.removeAll()
        body.add(VestigeUI.emptyState(title, detail), BorderLayout.CENTER)
        body.revalidate()
        body.repaint()
    }

    private fun render(result: VestigeService.AnalysisResult) {
        statsGrid.removeAll()
        body.removeAll()

        result.realTimeStats?.let { rt ->
            statsGrid.add(VestigeUI.metricTile("${rt.lineCount}", "Lines", VestigeUI.Blue))
            statsGrid.add(VestigeUI.metricTile("${rt.complexity}", "Branches", VestigeUI.Purple))
        }

        result.stats?.let { stats ->
            statsGrid.add(VestigeUI.metricTile("${stats.commits}", "Commits", VestigeUI.Blue))
            statsGrid.add(VestigeUI.metricTile(formatAge(stats.ageDays), "Last change", VestigeUI.TextSecondary))
        }

        val stabilityTone = VestigeUI.toneForScore(result.stability / 100.0)
        statsGrid.add(VestigeUI.metricTile("${result.stability}%", "Stability", stabilityTone))

        result.busFactor?.let { bf ->
            val tone = when (bf.risk.lowercase()) {
                "critical", "high" -> VestigeUI.Red
                "medium" -> VestigeUI.Amber
                else -> VestigeUI.Green
            }
            statsGrid.add(VestigeUI.metricTile("${bf.busFactor}", "Bus factor", tone))
        }

        val content = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(statsGrid)

            // Owner + risk, stated in words rather than only as a number.
            result.busFactor?.let { bf ->
                add(Box.createVerticalStrut(VestigeUI.SpaceLg))
                add(VestigeUI.sectionHeader("Ownership"))
                val card = VestigeUI.Card()
                card.layout = BoxLayout(card, BoxLayout.Y_AXIS)
                val owner = bf.contributors.firstOrNull()
                card.add(JBLabel(
                    if (owner != null) "${owner.name} wrote most of this file (${owner.percent}%)"
                    else "No ownership data"
                ).apply {
                    font = VestigeUI.bodyFont()
                    foreground = VestigeUI.TextPrimary
                    alignmentX = Component.LEFT_ALIGNMENT
                })
                card.add(Box.createVerticalStrut(VestigeUI.SpaceXs))
                card.add(JBLabel(riskExplanation(bf.busFactor)).apply {
                    font = VestigeUI.captionFont()
                    foreground = VestigeUI.TextMuted
                    alignmentX = Component.LEFT_ALIGNMENT
                })
                card.maximumSize = Dimension(Int.MAX_VALUE, card.preferredSize.height)
                add(card)
            }

            if (result.debt > 0) {
                add(Box.createVerticalStrut(VestigeUI.SpaceLg))
                add(VestigeUI.sectionHeader("Technical debt signal"))
                val meter = VestigeUI.Meter(
                    (result.debt / 50.0).coerceIn(0.0, 1.0),
                    VestigeUI.toneForScore(1.0 - (result.debt / 50.0).coerceIn(0.0, 1.0))
                )
                add(meter)
                add(Box.createVerticalStrut(VestigeUI.SpaceXs))
                add(JBLabel(debtScoreCaption(result)).apply {
                    font = VestigeUI.captionFont()
                    foreground = VestigeUI.TextMuted
                    alignmentX = Component.LEFT_ALIGNMENT
                })
            }
        }

        body.add(content, BorderLayout.NORTH)
        body.revalidate()
        body.repaint()
    }

    /**
     * Describes the debt score by naming the three inputs it is computed from.
     *
     * This deliberately reports no money and no hours. The score is
     * `size × churn × log(age)` — an ordering signal for files inside this one
     * repository. Multiplying it by an invented hourly rate (which the previous
     * version did) produced a currency figure that looked like an estimate while
     * resting on no estimate at all.
     */
    private fun debtScoreCaption(result: VestigeService.AnalysisResult): String {
        val inputs = buildList {
            result.stats?.let { add("${it.commits} commits") }
            (result.realTimeStats?.lineCount)?.let { add("$it lines") }
            result.stats?.let { add("${formatAge(it.ageDays)} old") }
        }
        val basis = if (inputs.isEmpty()) "churn, size and age" else inputs.joinToString(", ")
        return String.format(
            "Score %.1f — relative within this repository, from %s. Not a cost or a time estimate.",
            result.debt, basis
        )
    }

    private fun formatAge(days: Int): String = when {
        days <= 0 -> "today"
        days == 1 -> "1 day"
        days < 30 -> "$days days"
        days < 365 -> "${days / 30} mo"
        else -> "${days / 365}y ${(days % 365) / 30}mo"
    }

    private fun riskExplanation(busFactor: Int): String = when {
        busFactor <= 1 -> "Only one person has meaningful history here — worth sharing context."
        busFactor == 2 -> "Two people hold most of the knowledge."
        else -> "Knowledge is spread across $busFactor contributors."
    }
}
