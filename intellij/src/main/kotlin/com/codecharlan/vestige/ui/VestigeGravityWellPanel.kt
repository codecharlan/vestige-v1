package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import java.awt.GridLayout
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * How much churn and branching the current file carries.
 *
 * This was the "Gravity Well": a 33 fps Swing timer animating nine particles
 * on elliptical orbits around a radial-gradient blob, with the orbit radius
 * scaled by commit count and particle alpha by cyclomatic complexity. The two
 * real numbers were encoded as the speed and opacity of decorative dots, which
 * is unreadable — you cannot tell 40 commits from 60 by watching dots orbit.
 *
 * The same two numbers are now stated as figures with meters. The animation
 * timer is gone entirely, so an open tool window costs nothing when idle.
 *
 * The [VestigeService.AnalysisListener] registration and disposal are
 * unchanged.
 */
class VestigeGravityWellPanel(private val project: Project) :
    JPanel(BorderLayout()), VestigeService.AnalysisListener, Disposable {

    private val body = JPanel(BorderLayout()).apply { isOpaque = false }
    private val subtitle = JBLabel("No file analysed yet").apply {
        font = VestigeUI.captionFont()
        foreground = VestigeUI.TextMuted
        alignmentX = Component.LEFT_ALIGNMENT
    }

    init {
        background = VestigeUI.Surface
        isOpaque = true
        border = JBUI.Borders.empty(VestigeUI.SpaceLg)

        add(header(), BorderLayout.NORTH)
        add(body, BorderLayout.CENTER)

        showEmpty()

        project.getService(VestigeService::class.java).addListener(this)
        Disposer.register(project, this)
    }

    private fun header(): JComponent = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        isOpaque = false
        border = JBUI.Borders.emptyBottom(VestigeUI.SpaceLg)
        add(JBLabel("Change activity").apply {
            font = VestigeUI.titleFont()
            foreground = VestigeUI.TextPrimary
            alignmentX = Component.LEFT_ALIGNMENT
        })
        add(Box.createVerticalStrut(VestigeUI.SpaceXs))
        add(subtitle)
    }

    /** Called on the EDT by the service when a background analysis completes. */
    override fun onAnalysisUpdated(file: VirtualFile, result: VestigeService.AnalysisResult) {
        val commits = result.stats?.commits ?: 0
        val complexity = result.realTimeStats?.complexity ?: 0
        subtitle.text = file.name
        render(commits, complexity)
    }

    override fun dispose() {
        project.getService(VestigeService::class.java).removeListener(this)
    }

    private fun showEmpty() {
        body.removeAll()
        body.add(
            VestigeUI.emptyState(
                "Nothing analysed yet",
                "Open a file tracked in git — how often it changes and how branchy it is appear here."
            ),
            BorderLayout.CENTER
        )
        body.revalidate()
        body.repaint()
    }

    private fun render(commits: Int, complexity: Int) {
        // Reference points for the meters: 60 commits and 40 branches are
        // "a lot" for a single file. Stated here rather than hidden in a
        // particle-alpha calculation.
        val churnRatio = (commits / 60.0).coerceIn(0.0, 1.0)
        val complexityRatio = (complexity / 40.0).coerceIn(0.0, 1.0)

        val column = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
        }

        column.add(JPanel(GridLayout(1, 2, VestigeUI.SpaceSm, VestigeUI.SpaceSm)).apply {
            isOpaque = false
            alignmentX = Component.LEFT_ALIGNMENT
            add(VestigeUI.metricTile("$commits", "Commits", VestigeUI.Blue))
            add(VestigeUI.metricTile("$complexity", "Branches", VestigeUI.Purple))
        })

        column.add(VestigeUI.sectionHeader("How much this file churns").apply {
            alignmentX = Component.LEFT_ALIGNMENT
        })
        column.add(VestigeUI.Meter(churnRatio, VestigeUI.toneForScore(1.0 - churnRatio)).apply {
            alignmentX = Component.LEFT_ALIGNMENT
        })
        column.add(Box.createVerticalStrut(VestigeUI.SpaceXs))
        column.add(caption(churnDescription(commits)))

        column.add(VestigeUI.sectionHeader("How branchy it is").apply {
            alignmentX = Component.LEFT_ALIGNMENT
        })
        column.add(VestigeUI.Meter(complexityRatio, VestigeUI.toneForScore(1.0 - complexityRatio)).apply {
            alignmentX = Component.LEFT_ALIGNMENT
        })
        column.add(Box.createVerticalStrut(VestigeUI.SpaceXs))
        column.add(caption(complexityDescription(complexity)))

        body.removeAll()
        body.add(column, BorderLayout.NORTH)
        body.revalidate()
        body.repaint()
    }

    private fun caption(text: String): JComponent = JBLabel(text).apply {
        font = VestigeUI.captionFont()
        foreground = VestigeUI.TextMuted
        alignmentX = Component.LEFT_ALIGNMENT
    }

    private fun churnDescription(commits: Int): String = when {
        commits <= 1 -> "Barely touched since it was added."
        commits < 10 -> "$commits commits — a settled file."
        commits < 30 -> "$commits commits — changes regularly."
        else -> "$commits commits — a hotspot; changes here are frequent."
    }

    private fun complexityDescription(complexity: Int): String = when {
        complexity == 0 -> "No branching detected in the current text."
        complexity < 10 -> "$complexity decision points — straightforward to follow."
        complexity < 25 -> "$complexity decision points — moderately involved."
        else -> "$complexity decision points — hard to reason about; worth splitting up."
    }
}
