package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.codecharlan.vestige.logic.VestigeService
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Component
import java.awt.Font
import java.awt.GridLayout
import java.text.SimpleDateFormat
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JTextArea
import javax.swing.ScrollPaneConstants

/**
 * "Get up to speed on this file": a written summary, the people to ask, the
 * files that change alongside it, and the commits that mattered.
 *
 * Rewritten onto the shared design system. The previous version hardcoded a
 * dark palette (tinted `Color(16, 185, 129, 15)` boxes, `Color.WHITE` text)
 * and asked for `Font("Inter", …)`, which is normally not installed — so on a
 * light IDE theme it rendered as washed-out boxes with unreadable text.
 */
class VestigeOnboardingPanel(private val project: Project) :
    JPanel(BorderLayout()), VestigeService.AnalysisListener, Disposable {

    /** The vertical stack of sections. */
    private val contentPanel = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        background = VestigeUI.Surface
        isOpaque = true
        border = JBUI.Borders.empty(VestigeUI.SpaceLg)
    }

    /**
     * Horizontal scrolling is disabled so the viewport forces its width onto
     * the view — that is what lets the wrapping text areas report a correct
     * preferred height instead of running off the side.
     */
    private val scrollPane = JBScrollPane(JPanel(BorderLayout()).apply {
        background = VestigeUI.Surface
        isOpaque = true
        add(contentPanel, BorderLayout.NORTH)
    }).apply {
        border = JBUI.Borders.empty()
        horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
        viewport.background = VestigeUI.Surface
    }

    private val dateFormat = SimpleDateFormat("MMM d, yyyy")

    init {
        background = VestigeUI.Surface
        isOpaque = true

        showEmpty()

        project.getService(VestigeService::class.java).addListener(this)
        Disposer.register(project, this)
    }

    override fun dispose() {
        project.getService(VestigeService::class.java).removeListener(this)
    }

    /** Called on the EDT by the service when a background analysis completes. */
    override fun onAnalysisUpdated(file: VirtualFile, result: VestigeService.AnalysisResult) {
        updateOnboardingData(
            result.onboardingNarrative,
            result.onboardingTour ?: emptyList(),
            result.onboardingRecommendations,
            file.name
        )
    }

    private fun showEmpty() {
        removeAll()
        add(
            VestigeUI.emptyState(
                "Nothing to show yet",
                "Open a file tracked in git — its summary, owners and key commits appear here."
            ),
            BorderLayout.CENTER
        )
        revalidate()
        repaint()
    }

    fun updateOnboardingData(
        narrative: String?,
        milestones: List<VestigeGitAnalyzer.OnboardingMilestone>,
        recommendations: VestigeGitAnalyzer.OnboardingRecommendations?,
        fileName: String
    ) {
        if (narrative == null && recommendations == null && milestones.isEmpty()) {
            showEmpty()
            return
        }

        contentPanel.removeAll()

        stack(fileHeader(fileName))

        recommendations?.let {
            stack(VestigeUI.sectionHeader("At a glance"))
            stack(factsGrid(it.facts))
        }

        if (narrative != null) {
            stack(VestigeUI.sectionHeader("Summary"))
            stack(narrativeCard(narrative))
        }

        if (recommendations != null && recommendations.experts.isNotEmpty()) {
            stack(VestigeUI.sectionHeader("Who to ask"))
            recommendations.experts.take(3).forEach { stack(expertRow(it)) }
        }

        if (recommendations != null && recommendations.relatedFiles.isNotEmpty()) {
            stack(VestigeUI.sectionHeader("Often changed together"))
            recommendations.relatedFiles.forEach { stack(relatedFileRow(it)) }
        }

        if (milestones.isNotEmpty()) {
            stack(VestigeUI.sectionHeader("Key commits (${milestones.size})"))
            milestones.forEach { stack(milestoneRow(it)) }
            stack(tourButton(milestones))
        }

        removeAll()
        add(scrollPane, BorderLayout.CENTER)
        revalidate()
        repaint()
    }

    /** Appends a left-aligned section with a consistent gap below it. */
    private fun stack(component: JComponent) {
        component.alignmentX = Component.LEFT_ALIGNMENT
        contentPanel.add(component)
        contentPanel.add(Box.createVerticalStrut(VestigeUI.SpaceSm))
    }

    private fun fileHeader(fileName: String): JComponent = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        isOpaque = false
        add(JBLabel(fileName).apply {
            font = VestigeUI.titleFont()
            foreground = VestigeUI.TextPrimary
            alignmentX = Component.LEFT_ALIGNMENT
        })
        add(Box.createVerticalStrut(VestigeUI.SpaceXs))
        add(JBLabel("What a newcomer needs to know about this file").apply {
            font = VestigeUI.captionFont()
            foreground = VestigeUI.TextMuted
            alignmentX = Component.LEFT_ALIGNMENT
        })
    }

    private fun factsGrid(facts: VestigeGitAnalyzer.QuickFacts): JComponent =
        JPanel(GridLayout(0, 2, VestigeUI.SpaceSm, VestigeUI.SpaceSm)).apply {
            isOpaque = false
            add(VestigeUI.metricTile(formatAge(facts.age), "Age", VestigeUI.TextSecondary))
            add(VestigeUI.metricTile("${facts.totalCommits}", "Commits", VestigeUI.Blue))
            add(VestigeUI.metricTile("${facts.contributors}", "Contributors", VestigeUI.Purple))
            add(VestigeUI.metricTile("${facts.complexity}", "Lines", VestigeUI.TextSecondary))
        }

    private fun narrativeCard(narrative: String): JComponent = VestigeUI.Card().apply {
        layout = BorderLayout()
        add(wrappedText(narrative, VestigeUI.bodyFont(), VestigeUI.TextPrimary), BorderLayout.CENTER)
    }

    private fun expertRow(expert: VestigeGitAnalyzer.ExpertContact): JComponent {
        val card = VestigeUI.Card()
        card.layout = BorderLayout(VestigeUI.SpaceMd, 0)

        val left = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(JBLabel(expert.name).apply {
                font = VestigeUI.headingFont()
                foreground = VestigeUI.TextPrimary
                alignmentX = Component.LEFT_ALIGNMENT
            })
            add(Box.createVerticalStrut(VestigeUI.SpaceXs))
            add(JBLabel("${expert.role} · owns ${expert.ownership}% of the current lines").apply {
                font = VestigeUI.captionFont()
                foreground = VestigeUI.TextMuted
                alignmentX = Component.LEFT_ALIGNMENT
            })
            add(Box.createVerticalStrut(VestigeUI.SpaceSm))
            add(VestigeUI.Meter(expert.ownership / 100.0, VestigeUI.Blue).apply {
                alignmentX = Component.LEFT_ALIGNMENT
            })
        }

        card.add(left, BorderLayout.CENTER)
        card.add(pillBox("${expert.ownership}%", VestigeUI.Blue), BorderLayout.EAST)
        return card
    }

    private fun relatedFileRow(file: VestigeGitAnalyzer.RelatedFile): JComponent {
        val card = VestigeUI.Card()
        card.layout = BorderLayout(VestigeUI.SpaceMd, 0)

        val left = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(JBLabel(file.file).apply {
                font = VestigeUI.MonoFont
                foreground = VestigeUI.TextPrimary
                alignmentX = Component.LEFT_ALIGNMENT
            })
            add(Box.createVerticalStrut(VestigeUI.SpaceXs))
            add(JBLabel(file.reason).apply {
                font = VestigeUI.captionFont()
                foreground = VestigeUI.TextMuted
                alignmentX = Component.LEFT_ALIGNMENT
            })
        }

        card.add(left, BorderLayout.CENTER)
        card.add(
            pillBox("${file.coupling}/10", VestigeUI.toneForScore(file.coupling / 10.0)),
            BorderLayout.EAST
        )
        return card
    }

    private fun milestoneRow(milestone: VestigeGitAnalyzer.OnboardingMilestone): JComponent {
        val accent = when {
            milestone.importance > 8 -> VestigeUI.Red
            milestone.importance > 6 -> VestigeUI.Amber
            else -> VestigeUI.Blue
        }

        val card = VestigeUI.Card(accent)
        card.layout = BoxLayout(card, BoxLayout.Y_AXIS)

        val meta = buildString {
            append(milestone.type.name.replace('_', ' ').lowercase().replaceFirstChar { it.uppercase() })
            milestone.date?.let { append(" · ").append(dateFormat.format(it)) }
            milestone.author?.let { append(" · ").append(it) }
            milestone.hash?.let { append(" · ").append(it.take(7)) }
        }

        card.add(JBLabel(meta).apply {
            font = VestigeUI.captionFont()
            foreground = VestigeUI.TextMuted
            alignmentX = Component.LEFT_ALIGNMENT
        })
        card.add(Box.createVerticalStrut(VestigeUI.SpaceXs))
        card.add(wrappedText(milestone.content, VestigeUI.bodyFont(), VestigeUI.TextPrimary).apply {
            alignmentX = Component.LEFT_ALIGNMENT
        })
        return card
    }

    private fun tourButton(milestones: List<VestigeGitAnalyzer.OnboardingMilestone>): JComponent =
        JPanel(BorderLayout()).apply {
            isOpaque = false
            border = JBUI.Borders.emptyTop(VestigeUI.SpaceXs)
            add(JButton("Walk through these commits").apply {
                addActionListener { VestigeOnboardingTourDialog(project, milestones).show() }
            }, BorderLayout.WEST)
        }

    /** Wrapping, non-editable, non-opaque prose. Reads as a label, wraps as a text area. */
    private fun wrappedText(text: String, textFont: Font, color: Color): JTextArea =
        JTextArea(text).apply {
            isEditable = false
            isFocusable = false
            lineWrap = true
            wrapStyleWord = true
            isOpaque = false
            border = JBUI.Borders.empty()
            font = textFont
            foreground = color
        }

    /** Keeps a [VestigeUI.Pill] at its natural height when placed in a BorderLayout edge. */
    private fun pillBox(text: String, tone: Color): JComponent = JPanel(BorderLayout()).apply {
        isOpaque = false
        add(VestigeUI.Pill(text, tone), BorderLayout.NORTH)
    }

    private fun formatAge(days: Int): String = when {
        days <= 0 -> "new"
        days < 30 -> "${days}d"
        days < 365 -> "${days / 30}mo"
        else -> "${days / 365}y"
    }
}
