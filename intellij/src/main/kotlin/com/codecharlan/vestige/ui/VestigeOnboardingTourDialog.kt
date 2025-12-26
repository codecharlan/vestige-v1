package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.JBColor
import java.awt.*
import java.text.SimpleDateFormat
import javax.swing.*

/**
 * Interactive Onboarding Tour Dialog - Modal step-by-step walkthrough
 * of file milestones with navigation controls
 */
class VestigeOnboardingTourDialog(
    private val project: Project,
    private val milestones: List<VestigeGitAnalyzer.OnboardingMilestone>
) : DialogWrapper(project) {
    
    private var currentStep = 0
    private val contentPanel = JPanel(BorderLayout())
    private val progressBar = JProgressBar(0, milestones.size)
    
    init {
        title = "Onboarding Tour"
        init()
        updateContent()
    }
    
    override fun createCenterPanel(): JComponent {
        val mainPanel = JPanel(BorderLayout())
        mainPanel.preferredSize = Dimension(600, 400)
        mainPanel.background = JBColor.background()
        
        // Progress bar at top
        progressBar.value = currentStep + 1
        progressBar.isStringPainted = false
        progressBar.foreground = Color(16, 185, 129)
        progressBar.background = Color(96, 165, 250, 50)
        progressBar.preferredSize = Dimension(600, 4)
        
        mainPanel.add(progressBar, BorderLayout.NORTH)
        mainPanel.add(contentPanel, BorderLayout.CENTER)
        
        return mainPanel
    }
    
    override fun createActions(): Array<Action> {
        val actions = mutableListOf<Action>()
        
        // Previous button
        if (currentStep > 0) {
            actions.add(object : DialogWrapperAction("← Previous") {
                override fun doAction(e: java.awt.event.ActionEvent?) {
                    if (currentStep > 0) {
                        currentStep--
                        updateContent()
                    }
                }
            })
        }
        
        // Next/Finish button
        if (currentStep < milestones.size - 1) {
            actions.add(object : DialogWrapperAction("Next →") {
                init {
                    putValue(DEFAULT_ACTION, true)
                }
                override fun doAction(e: java.awt.event.ActionEvent?) {
                    if (currentStep < milestones.size - 1) {
                        currentStep++
                        updateContent()
                    }
                }
            })
        } else {
            actions.add(object : DialogWrapperAction("🎉 Finish Tour") {
                init {
                    putValue(DEFAULT_ACTION, true)
                }
                override fun doAction(e: java.awt.event.ActionEvent?) {
                    close(OK_EXIT_CODE)
                }
            })
        }
        
        // Close button
        actions.add(object : DialogWrapperAction("✕ Close") {
            override fun doAction(e: java.awt.event.ActionEvent?) {
                close(CANCEL_EXIT_CODE)
            }
        })
        
        return actions.toTypedArray()
    }
    
    private fun updateContent() {
        contentPanel.removeAll()
        
        val milestone = milestones[currentStep]
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        panel.background = JBColor.background()
        panel.border = BorderFactory.createEmptyBorder(30, 40, 30, 40)
        
        // Step counter
        val stepLabel = JLabel("MILESTONE ${currentStep + 1} OF ${milestones.size}", SwingConstants.CENTER)
        stepLabel.font = Font("Inter", Font.BOLD, 11)
        stepLabel.foreground = JBColor.GRAY
        stepLabel.alignmentX = Component.CENTER_ALIGNMENT
        
        panel.add(stepLabel)
        panel.add(Box.createVerticalStrut(20))
        
        // Icon
        val iconLabel = JLabel(milestone.icon, SwingConstants.CENTER)
        iconLabel.font = Font("Dialog", Font.PLAIN, 48)
        iconLabel.alignmentX = Component.CENTER_ALIGNMENT
        
        panel.add(iconLabel)
        panel.add(Box.createVerticalStrut(10))
        
        // Type
        val typeLabel = JLabel(milestone.type.name.replace("_", " "), SwingConstants.CENTER)
        typeLabel.font = Font("Inter", Font.BOLD, 14)
        typeLabel.foreground = Color(96, 165, 250)
        typeLabel.alignmentX = Component.CENTER_ALIGNMENT
        
        panel.add(typeLabel)
        panel.add(Box.createVerticalStrut(20))
        
        // Content
        val contentArea = JTextArea(milestone.content)
        contentArea.isEditable = false
        contentArea.lineWrap = true
        contentArea.wrapStyleWord = true
        contentArea.background = JBColor.background()
        contentArea.font = Font("Inter", Font.PLAIN, 14)
        contentArea.foreground = JBColor.foreground()
        contentArea.alignmentX = Component.CENTER_ALIGNMENT
        
        val contentWrapper = JPanel(BorderLayout())
        contentWrapper.background = JBColor.background()
        contentWrapper.add(contentArea, BorderLayout.CENTER)
        contentWrapper.maximumSize = Dimension(500, 200)
        
        panel.add(contentWrapper)
        panel.add(Box.createVerticalStrut(15))
        
        // Author
        if (milestone.author != null) {
            val authorLabel = JLabel("by ${milestone.author}", SwingConstants.CENTER)
            authorLabel.font = Font("Inter", Font.PLAIN, 12)
            authorLabel.foreground = JBColor.GRAY
            authorLabel.alignmentX = Component.CENTER_ALIGNMENT
            panel.add(authorLabel)
            panel.add(Box.createVerticalStrut(5))
        }
        
        // Date
        if (milestone.date != null) {
            val dateFormatter = SimpleDateFormat("MMMM dd, yyyy")
            val dateLabel = JLabel(dateFormatter.format(milestone.date), SwingConstants.CENTER)
            dateLabel.font = Font("Inter", Font.PLAIN, 11)
            dateLabel.foreground = JBColor.GRAY
            dateLabel.alignmentX = Component.CENTER_ALIGNMENT
            panel.add(dateLabel)
            panel.add(Box.createVerticalStrut(15))
        }
        
        // Importance badge
        val importanceBadge = createImportanceBadge(milestone.importance)
        importanceBadge.alignmentX = Component.CENTER_ALIGNMENT
        panel.add(importanceBadge)
        
        contentPanel.add(panel, BorderLayout.CENTER)
        
        // Update progress bar
        progressBar.value = currentStep + 1
        
        contentPanel.revalidate()
        contentPanel.repaint()
    }
    
    private fun createImportanceBadge(importance: Int): JLabel {
        val (text, bgColor, fgColor) = when {
            importance > 8 -> Triple("🔥 CRITICAL", Color(239, 68, 68, 50), Color(239, 68, 68))
            importance > 6 -> Triple("⚠️ IMPORTANT", Color(245, 158, 11, 50), Color(245, 158, 11))
            else -> Triple("📌 NOTABLE", Color(96, 165, 250, 50), Color(96, 165, 250))
        }
        
        val badge = JLabel(text, SwingConstants.CENTER)
        badge.font = Font("Inter", Font.BOLD, 10)
        badge.foreground = fgColor
        badge.background = bgColor
        badge.isOpaque = true
        badge.border = BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(fgColor, 1),
            BorderFactory.createEmptyBorder(4, 12, 4, 12)
        )
        
        return badge
    }
}
