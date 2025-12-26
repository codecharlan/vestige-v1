package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBScrollPane
import java.awt.*
import java.text.SimpleDateFormat
import javax.swing.*

/**
 * Onboarding Assistant Panel - Displays AI narratives, expert recommendations,
 * and milestone timeline for new developers
 */
class VestigeOnboardingPanel(private val project: Project) : JPanel(BorderLayout()) {
    
    private val contentPanel = JPanel()
    private val scrollPane = JBScrollPane(contentPanel)
    
    init {
        contentPanel.layout = BoxLayout(contentPanel, BoxLayout.Y_AXIS)
        contentPanel.background = JBColor.background()
        add(scrollPane, BorderLayout.CENTER)
    }
    
    fun updateOnboardingData(
        narrative: String?,
        milestones: List<VestigeGitAnalyzer.OnboardingMilestone>,
        recommendations: VestigeGitAnalyzer.OnboardingRecommendations?,
        fileName: String
    ) {
        contentPanel.removeAll()
        
        // AI Narrative Card
        if (narrative != null) {
            contentPanel.add(createNarrativeCard(narrative, fileName))
            contentPanel.add(Box.createVerticalStrut(15))
        }
        
        // Quick Facts Grid
        if (recommendations != null) {
            contentPanel.add(createQuickFactsPanel(recommendations.facts))
            contentPanel.add(Box.createVerticalStrut(15))
        }
        
        // Expert Recommendations
        if (recommendations != null && recommendations.experts.isNotEmpty()) {
            contentPanel.add(createExpertsPanel(recommendations.experts))
            contentPanel.add(Box.createVerticalStrut(15))
        }
        
        // Related Files
        if (recommendations != null && recommendations.relatedFiles.isNotEmpty()) {
            contentPanel.add(createRelatedFilesPanel(recommendations.relatedFiles))
            contentPanel.add(Box.createVerticalStrut(15))
        }
        
        // Milestone Timeline
        if (milestones.isNotEmpty()) {
            contentPanel.add(createMilestonesPanel(milestones))
            contentPanel.add(Box.createVerticalStrut(15))
        }
        
        // Interactive Tour Button
        if (milestones.isNotEmpty()) {
            contentPanel.add(createTourButton(milestones))
        }
        
        contentPanel.revalidate()
        contentPanel.repaint()
    }
    
    private fun createNarrativeCard(narrative: String, fileName: String): JPanel {
        val panel = JPanel(BorderLayout())
        panel.background = Color(16, 185, 129, 15)
        panel.border = BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(Color(16, 185, 129, 50), 1),
            BorderFactory.createEmptyBorder(15, 15, 15, 15)
        )
        
        val titleLabel = JLabel("✨ WELCOME TO ${fileName.uppercase()}")
        titleLabel.font = Font("Inter", Font.BOLD, 12)
        titleLabel.foreground = Color(16, 185, 129)
        
        val narrativeArea = JTextArea(narrative)
        narrativeArea.isEditable = false
        narrativeArea.lineWrap = true
        narrativeArea.wrapStyleWord = true
        narrativeArea.background = Color(0, 0, 0, 0)
        narrativeArea.font = Font("Inter", Font.PLAIN, 13)
        narrativeArea.foreground = JBColor.foreground()
        
        panel.add(titleLabel, BorderLayout.NORTH)
        panel.add(Box.createVerticalStrut(10), BorderLayout.CENTER)
        panel.add(narrativeArea, BorderLayout.SOUTH)
        
        return panel
    }
    
    private fun createQuickFactsPanel(facts: VestigeGitAnalyzer.QuickFacts): JPanel {
        val panel = JPanel(GridLayout(1, 4, 10, 0))
        panel.background = JBColor.background()
        
        panel.add(createFactCard("📅", "${facts.age / 365}y ${facts.age % 365}d", "Age"))
        panel.add(createFactCard("🔄", facts.totalCommits.toString(), "Changes"))
        panel.add(createFactCard("👥", facts.contributors.toString(), "Contributors"))
        panel.add(createFactCard("📏", facts.complexity.toString(), "Lines"))
        
        return panel
    }
    
    private fun createFactCard(icon: String, value: String, label: String): JPanel {
        val card = JPanel()
        card.layout = BoxLayout(card, BoxLayout.Y_AXIS)
        card.background = JBColor.background()
        card.border = BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(JBColor.border(), 1),
            BorderFactory.createEmptyBorder(10, 10, 10, 10)
        )
        
        val iconLabel = JLabel(icon, SwingConstants.CENTER)
        iconLabel.font = Font("Dialog", Font.PLAIN, 24)
        iconLabel.alignmentX = Component.CENTER_ALIGNMENT
        
        val valueLabel = JLabel(value, SwingConstants.CENTER)
        valueLabel.font = Font("Inter", Font.BOLD, 14)
        valueLabel.alignmentX = Component.CENTER_ALIGNMENT
        
        val labelText = JLabel(label, SwingConstants.CENTER)
        labelText.font = Font("Inter", Font.PLAIN, 10)
        labelText.foreground = JBColor.GRAY
        labelText.alignmentX = Component.CENTER_ALIGNMENT
        
        card.add(iconLabel)
        card.add(Box.createVerticalStrut(5))
        card.add(valueLabel)
        card.add(Box.createVerticalStrut(3))
        card.add(labelText)
        
        return card
    }
    
    private fun createExpertsPanel(experts: List<VestigeGitAnalyzer.ExpertContact>): JPanel {
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        panel.background = JBColor.background()
        
        val titleLabel = JLabel("💡 ASK THESE EXPERTS")
        titleLabel.font = Font("Inter", Font.BOLD, 11)
        titleLabel.foreground = JBColor.GRAY
        panel.add(titleLabel)
        panel.add(Box.createVerticalStrut(10))
        
        val expertsGrid = JPanel(GridLayout(1, experts.size.coerceAtMost(3), 10, 0))
        expertsGrid.background = JBColor.background()
        
        experts.take(3).forEach { expert ->
            expertsGrid.add(createExpertCard(expert))
        }
        
        panel.add(expertsGrid)
        return panel
    }
    
    private fun createExpertCard(expert: VestigeGitAnalyzer.ExpertContact): JPanel {
        val card = JPanel()
        card.layout = BoxLayout(card, BoxLayout.Y_AXIS)
        card.background = Color(59, 130, 246, 15)
        card.border = BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(Color(59, 130, 246, 50), 1),
            BorderFactory.createEmptyBorder(10, 10, 10, 10)
        )
        
        val nameLabel = JLabel("👤 ${expert.name}")
        nameLabel.font = Font("Inter", Font.BOLD, 12)
        nameLabel.foreground = Color(96, 165, 250)
        
        val roleLabel = JLabel(expert.role)
        roleLabel.font = Font("Inter", Font.PLAIN, 10)
        roleLabel.foreground = JBColor.GRAY
        
        val progressPanel = JPanel(BorderLayout())
        progressPanel.background = Color(0, 0, 0, 0)
        progressPanel.preferredSize = Dimension(100, 6)
        
        val progressBar = JProgressBar(0, 100)
        progressBar.value = expert.ownership
        progressBar.isStringPainted = false
        progressBar.foreground = Color(96, 165, 250)
        
        val percentLabel = JLabel("${expert.ownership}%")
        percentLabel.font = Font("Inter", Font.BOLD, 10)
        percentLabel.foreground = Color(96, 165, 250)
        
        card.add(nameLabel)
        card.add(Box.createVerticalStrut(3))
        card.add(roleLabel)
        card.add(Box.createVerticalStrut(8))
        card.add(progressBar)
        card.add(Box.createVerticalStrut(3))
        card.add(percentLabel)
        
        return card
    }
    
    private fun createRelatedFilesPanel(relatedFiles: List<VestigeGitAnalyzer.RelatedFile>): JPanel {
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        panel.background = JBColor.background()
        
        val titleLabel = JLabel("🔗 RELATED FILES")
        titleLabel.font = Font("Inter", Font.BOLD, 11)
        titleLabel.foreground = JBColor.GRAY
        panel.add(titleLabel)
        panel.add(Box.createVerticalStrut(10))
        
        val listPanel = JPanel()
        listPanel.layout = BoxLayout(listPanel, BoxLayout.Y_AXIS)
        listPanel.background = Color(244, 114, 182, 15)
        listPanel.border = BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(Color(244, 114, 182, 50), 1),
            BorderFactory.createEmptyBorder(10, 10, 10, 10)
        )
        
        relatedFiles.forEach { file ->
            val filePanel = JPanel(BorderLayout())
            filePanel.background = Color(0, 0, 0, 0)
            
            val leftPanel = JPanel()
            leftPanel.layout = BoxLayout(leftPanel, BoxLayout.Y_AXIS)
            leftPanel.background = Color(0, 0, 0, 0)
            
            val fileLabel = JLabel(file.file)
            fileLabel.font = Font("Inter", Font.BOLD, 11)
            fileLabel.foreground = Color(244, 114, 182)
            
            val reasonLabel = JLabel(file.reason)
            reasonLabel.font = Font("Inter", Font.PLAIN, 9)
            reasonLabel.foreground = JBColor.GRAY
            
            leftPanel.add(fileLabel)
            leftPanel.add(reasonLabel)
            
            val couplingLabel = JLabel("${file.coupling}/10")
            couplingLabel.font = Font("Inter", Font.BOLD, 10)
            couplingLabel.foreground = Color(244, 114, 182)
            
            filePanel.add(leftPanel, BorderLayout.WEST)
            filePanel.add(couplingLabel, BorderLayout.EAST)
            
            listPanel.add(filePanel)
            listPanel.add(Box.createVerticalStrut(8))
        }
        
        panel.add(listPanel)
        return panel
    }
    
    private fun createMilestonesPanel(milestones: List<VestigeGitAnalyzer.OnboardingMilestone>): JPanel {
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        panel.background = JBColor.background()
        
        val titleLabel = JLabel("📍 KEY MILESTONES (${milestones.size})")
        titleLabel.font = Font("Inter", Font.BOLD, 11)
        titleLabel.foreground = JBColor.GRAY
        panel.add(titleLabel)
        panel.add(Box.createVerticalStrut(10))
        
        milestones.forEach { milestone ->
            panel.add(createMilestoneItem(milestone))
            panel.add(Box.createVerticalStrut(10))
        }
        
        return panel
    }
    
    private fun createMilestoneItem(milestone: VestigeGitAnalyzer.OnboardingMilestone): JPanel {
        val item = JPanel()
        item.layout = BoxLayout(item, BoxLayout.Y_AXIS)
        item.background = Color(255, 255, 255, 5)
        
        val borderColor = when {
            milestone.importance > 8 -> Color(239, 68, 68)
            milestone.importance > 6 -> Color(245, 158, 11)
            else -> Color(96, 165, 250)
        }
        
        item.border = BorderFactory.createCompoundBorder(
            BorderFactory.createMatteBorder(0, 3, 0, 0, borderColor),
            BorderFactory.createEmptyBorder(10, 12, 10, 12)
        )
        
        val headerPanel = JPanel(FlowLayout(FlowLayout.LEFT, 5, 0))
        headerPanel.background = Color(0, 0, 0, 0)
        
        val iconLabel = JLabel(milestone.icon)
        iconLabel.font = Font("Dialog", Font.PLAIN, 16)
        
        val typeLabel = JLabel(milestone.type.name)
        typeLabel.font = Font("Inter", Font.BOLD, 10)
        typeLabel.foreground = JBColor.GRAY
        
        val dateFormatter = SimpleDateFormat("MMM dd, yyyy")
        val dateLabel = JLabel(milestone.date?.let { dateFormatter.format(it) } ?: "")
        dateLabel.font = Font("Inter", Font.PLAIN, 9)
        dateLabel.foreground = JBColor.GRAY
        
        headerPanel.add(iconLabel)
        headerPanel.add(typeLabel)
        if (milestone.date != null) {
            headerPanel.add(dateLabel)
        }
        
        val contentLabel = JLabel("<html>${milestone.content}</html>")
        contentLabel.font = Font("Inter", Font.PLAIN, 12)
        
        val authorLabel = milestone.author?.let {
            JLabel("by $it").apply {
                font = Font("Inter", Font.PLAIN, 10)
                foreground = JBColor.GRAY
            }
        }
        
        item.add(headerPanel)
        item.add(Box.createVerticalStrut(5))
        item.add(contentLabel)
        if (authorLabel != null) {
            item.add(Box.createVerticalStrut(3))
            item.add(authorLabel)
        }
        
        return item
    }
    
    private fun createTourButton(milestones: List<VestigeGitAnalyzer.OnboardingMilestone>): JPanel {
        val panel = JPanel(FlowLayout(FlowLayout.CENTER))
        panel.background = JBColor.background()
        
        val button = JButton("🎬 Start Interactive Tour")
        button.font = Font("Inter", Font.BOLD, 13)
        button.background = Color(16, 185, 129)
        button.foreground = Color.WHITE
        button.isFocusPainted = false
        button.border = BorderFactory.createEmptyBorder(10, 20, 10, 20)
        
        button.addActionListener {
            VestigeOnboardingTourDialog(project, milestones).show()
        }
        
        panel.add(button)
        return panel
    }
}
