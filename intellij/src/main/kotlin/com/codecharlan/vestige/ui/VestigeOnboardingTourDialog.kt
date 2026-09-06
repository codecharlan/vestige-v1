package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import java.text.SimpleDateFormat
import javax.swing.Action
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JTextArea

/**
 * Step-by-step walkthrough of a file's key commits.
 *
 * Restyled onto the design system: the content was previously centre-aligned
 * with a 48pt emoji per step, `Font("Inter", …)` throughout (usually absent,
 * so silently substituted) and a hand-built importance badge with a hardcoded
 * translucent background. Body text is now left-aligned and readable at any
 * theme, and the badge is the shared [VestigeUI.Pill].
 *
 * Navigation behaviour, button actions and step bookkeeping are unchanged.
 */
class VestigeOnboardingTourDialog(
    private val project: Project,
    private val milestones: List<VestigeGitAnalyzer.OnboardingMilestone>
) : DialogWrapper(project) {

    private var currentStep = 0
    private val contentPanel = JPanel(BorderLayout()).apply {
        background = VestigeUI.Surface
        isOpaque = true
    }
    private val progress = VestigeUI.Meter(0.0, VestigeUI.Blue)
    private val stepLabel = JBLabel().apply {
        font = VestigeUI.captionFont()
        foreground = VestigeUI.TextMuted
        alignmentX = Component.LEFT_ALIGNMENT
    }

    // Both navigation buttons always exist; their state is updated per step.
    private val previousAction: Action = object : DialogWrapperAction("Previous") {
        override fun doAction(e: java.awt.event.ActionEvent?) {
            if (currentStep > 0) {
                currentStep--
                updateContent()
            }
        }
    }

    private val nextAction: Action = object : DialogWrapperAction("Next") {
        init {
            putValue(DEFAULT_ACTION, true)
        }
        override fun doAction(e: java.awt.event.ActionEvent?) {
            if (currentStep < milestones.size - 1) {
                currentStep++
                updateContent()
            } else {
                // Last step: Next behaves as Finish.
                close(OK_EXIT_CODE)
            }
        }
    }

    private val dismissAction: Action = object : DialogWrapperAction("Close") {
        override fun doAction(e: java.awt.event.ActionEvent?) {
            close(CANCEL_EXIT_CODE)
        }
    }

    init {
        title = "Walk Through Key Commits"
        init()
        updateContent()
    }

    override fun createCenterPanel(): JComponent {
        val mainPanel = JPanel(BorderLayout()).apply {
            preferredSize = Dimension(JBUI.scale(600), JBUI.scale(400))
            background = VestigeUI.Surface
            isOpaque = true
            border = JBUI.Borders.empty(VestigeUI.SpaceLg)
        }

        val top = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            border = JBUI.Borders.emptyBottom(VestigeUI.SpaceLg)
            add(stepLabel)
            add(Box.createVerticalStrut(VestigeUI.SpaceSm))
            add(progress)
        }

        mainPanel.add(top, BorderLayout.NORTH)
        mainPanel.add(contentPanel, BorderLayout.CENTER)

        return mainPanel
    }

    override fun createActions(): Array<Action> {
        return arrayOf(previousAction, nextAction, dismissAction)
    }

    private fun updateContent() {
        // Keep button states in sync with the current step.
        previousAction.isEnabled = currentStep > 0
        nextAction.putValue(
            Action.NAME,
            if (currentStep < milestones.size - 1) "Next" else "Finish"
        )

        contentPanel.removeAll()

        if (milestones.isEmpty()) {
            stepLabel.text = "Nothing to walk through"
            progress.setValue(0.0)
            contentPanel.add(
                VestigeUI.emptyState(
                    "No key commits",
                    "Vestige found no notable commits for this file."
                ),
                BorderLayout.CENTER
            )
            contentPanel.revalidate()
            contentPanel.repaint()
            return
        }

        val milestone = milestones[currentStep]

        stepLabel.text = "Step ${currentStep + 1} of ${milestones.size}"
        progress.setValue((currentStep + 1).toDouble() / milestones.size)

        val tone = when {
            milestone.importance > 8 -> VestigeUI.Red
            milestone.importance > 6 -> VestigeUI.Amber
            else -> VestigeUI.Blue
        }
        val importance = when {
            milestone.importance > 8 -> "Critical"
            milestone.importance > 6 -> "Important"
            else -> "Notable"
        }

        val column = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false

            add(JPanel(BorderLayout()).apply {
                isOpaque = false
                alignmentX = Component.LEFT_ALIGNMENT
                add(VestigeUI.Pill(importance, tone), BorderLayout.WEST)
            })
            add(Box.createVerticalStrut(VestigeUI.SpaceMd))

            add(JBLabel(milestone.type.name.replace('_', ' ').lowercase()
                .replaceFirstChar { it.uppercase() }).apply {
                font = VestigeUI.titleFont()
                foreground = VestigeUI.TextPrimary
                alignmentX = Component.LEFT_ALIGNMENT
            })
            add(Box.createVerticalStrut(VestigeUI.SpaceSm))

            add(JTextArea(milestone.content).apply {
                isEditable = false
                isFocusable = false
                lineWrap = true
                wrapStyleWord = true
                isOpaque = false
                border = JBUI.Borders.empty()
                font = VestigeUI.bodyFont()
                foreground = VestigeUI.TextPrimary
                alignmentX = Component.LEFT_ALIGNMENT
            })
            add(Box.createVerticalStrut(VestigeUI.SpaceMd))

            val meta = buildString {
                milestone.author?.let { append(it) }
                milestone.date?.let {
                    if (isNotEmpty()) append(" · ")
                    append(SimpleDateFormat("MMMM d, yyyy").format(it))
                }
                milestone.hash?.let {
                    if (isNotEmpty()) append(" · ")
                    append(it.take(7))
                }
            }
            if (meta.isNotEmpty()) {
                add(JBLabel(meta).apply {
                    font = VestigeUI.captionFont()
                    foreground = VestigeUI.TextMuted
                    alignmentX = Component.LEFT_ALIGNMENT
                })
            }
        }

        contentPanel.add(column, BorderLayout.NORTH)
        contentPanel.revalidate()
        contentPanel.repaint()
    }
}
