package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeHealthScore
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import java.awt.*
import java.awt.geom.RoundRectangle2D
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.ReadAction
import com.intellij.util.concurrency.AppExecutorUtil
import javax.swing.*
import javax.swing.border.EmptyBorder

/**
 * Code Health Score Dashboard - Overall project health with actionable insights
 */
class VestigeHealthDashboardPanel(private val project: Project) : JPanel() {
    
    init {
        layout = BorderLayout()
        background = VestigeUI.DeepSlate
        isOpaque = true
        
        val header = JPanel(BorderLayout()).apply {
            background = VestigeUI.HologramBlue
            border = JBUI.Borders.empty(16, 16)
            add(JBLabel("🏥 Code Health Dashboard").apply {
                font = VestigeUI.InterFont.deriveFont(18f)
                foreground = VestigeUI.Purple
            }, BorderLayout.WEST)
        }
        add(header, BorderLayout.NORTH)
        
        showLoadingState()
        
        // Load health score in background
        ReadAction.nonBlocking<VestigeHealthScore.HealthScore> {
            project.getService(VestigeHealthScore::class.java).calculateHealthScore()
        }
        .inSmartMode(project)
        .finishOnUiThread(ModalityState.any()) { healthScore ->
            updateUI(healthScore)
        }
        .submit(AppExecutorUtil.getAppExecutorService())
    }

    private fun showLoadingState() {
        val loadingPanel = JPanel(GridBagLayout()).apply {
            background = VestigeUI.DeepSlate
            add(JBLabel("Calculating Project Health Archaeometry...").apply {
                font = VestigeUI.InterFont.deriveFont(14f)
                foreground = VestigeUI.Purple
            })
        }
        add(loadingPanel, BorderLayout.CENTER)
        revalidate()
        repaint()
    }

    private fun updateUI(healthScore: VestigeHealthScore.HealthScore) {
        removeAll()
        
        val header = JPanel(BorderLayout()).apply {
            background = VestigeUI.HologramBlue
            border = JBUI.Borders.empty(16, 16)
            add(JBLabel("🏥 Code Health Dashboard").apply {
                font = VestigeUI.InterFont.deriveFont(18f)
                foreground = VestigeUI.Purple
            }, BorderLayout.WEST)
        }
        
        val contentPanel = JPanel().apply {
            layout = GridBagLayout()
            background = VestigeUI.DeepSlate
            border = JBUI.Borders.empty(16, 16)
        }
        
        val gbc = GridBagConstraints().apply {
            insets = JBUI.insets(10)
            anchor = GridBagConstraints.NORTHWEST
            fill = GridBagConstraints.HORIZONTAL
        }
        
        // Overall Score Card
        gbc.gridx = 0
        gbc.gridy = 0
        gbc.gridwidth = 2
        gbc.weightx = 1.0
        contentPanel.add(createScoreCard("Overall Health", healthScore.overall, "Project-wide health score"), gbc)
        
        // Category Cards
        gbc.gridwidth = 1
        gbc.weightx = 0.5
        
        var row = 1
        var col = 0
        healthScore.categories.forEach { entry: Map.Entry<VestigeHealthScore.Category, Double> ->
            val category = entry.key
            val score = entry.value
            gbc.gridx = col
            gbc.gridy = row
            contentPanel.add(createCategoryCard(category.name, score), gbc)
            
            col++
            if (col >= 2) {
                col = 0
                row++
            }
        }
        
        // Insights Section
        gbc.gridx = 0
        gbc.gridy = row + 1
        gbc.gridwidth = 2
        gbc.weightx = 1.0
        gbc.fill = GridBagConstraints.BOTH
        contentPanel.add(createInsightsPanel(healthScore.insights, healthScore.recommendations), gbc)
        
        val scrollPane = JBScrollPane(contentPanel)
        scrollPane.border = JBUI.Borders.empty()
        
        add(header, BorderLayout.NORTH)
        add(scrollPane, BorderLayout.CENTER)
        
        revalidate()
        repaint()
    }
    
    private fun createScoreCard(title: String, score: Double, description: String): JPanel {
        val card = JPanel(BorderLayout()).apply {
            background = VestigeUI.HologramBlue
            border = JBUI.Borders.compound(
                EmptyBorder(20, 20, 20, 20),
                JBUI.Borders.customLine(VestigeUI.Purple, 2)
            )
            preferredSize = Dimension(0, 120)
        }
        
        val scoreLabel = JBLabel("${(score * 100).toInt()}%").apply {
            font = VestigeUI.InterFont.deriveFont(48f)
            foreground = getScoreColor(score)
        }
        
        val titleLabel = JBLabel(title).apply {
            font = VestigeUI.InterFont.deriveFont(16f)
            foreground = Color.WHITE
        }
        
        val descLabel = JBLabel(description).apply {
            font = VestigeUI.InterFont.deriveFont(12f)
            foreground = Color(180, 180, 180)
        }
        
        val leftPanel = JPanel(BorderLayout()).apply {
            background = VestigeUI.HologramBlue
            add(titleLabel, BorderLayout.NORTH)
            add(descLabel, BorderLayout.SOUTH)
        }
        
        card.add(leftPanel, BorderLayout.WEST)
        card.add(scoreLabel, BorderLayout.EAST)
        
        return card
    }
    
    private fun createCategoryCard(category: String, score: Double): JPanel {
        val card = JPanel(BorderLayout()).apply {
            background = VestigeUI.HologramBlue
            border = JBUI.Borders.compound(
                EmptyBorder(16, 16, 16, 16),
                JBUI.Borders.customLine(VestigeUI.Purple.darker(), 1)
            )
            preferredSize = Dimension(0, 100)
        }
        
        val progressBar = JPanel().apply {
            preferredSize = Dimension(0, 8)
            background = VestigeUI.DeepSlate
            border = JBUI.Borders.empty(4, 0)
        }
        
        val progressFill = JPanel().apply {
            background = getScoreColor(score)
            preferredSize = Dimension((progressBar.preferredSize.width * score).toInt(), 8)
        }
        progressBar.add(progressFill, BorderLayout.WEST)
        
        val categoryLabel = JBLabel(category).apply {
            font = VestigeUI.InterFont.deriveFont(14f)
            foreground = Color.WHITE
        }
        
        val scoreLabel = JBLabel("${(score * 100).toInt()}%").apply {
            font = VestigeUI.InterFont.deriveFont(12f)
            foreground = getScoreColor(score)
        }
        
        card.add(categoryLabel, BorderLayout.NORTH)
        card.add(progressBar, BorderLayout.CENTER)
        card.add(scoreLabel, BorderLayout.SOUTH)
        
        return card
    }
    
    private fun createInsightsPanel(insights: List<VestigeHealthScore.Insight>, recommendations: List<String>): JPanel {
        val panel = JPanel(BorderLayout()).apply {
            background = VestigeUI.HologramBlue
            border = JBUI.Borders.compound(
                EmptyBorder(16, 16, 16, 16),
                JBUI.Borders.customLine(VestigeUI.Purple, 1)
            )
        }
        
        val insightsLabel = JBLabel("💡 Insights & Recommendations").apply {
            font = VestigeUI.InterFont.deriveFont(16f)
            foreground = VestigeUI.Purple
            border = JBUI.Borders.empty(0, 0, 12, 0)
        }
        
        val insightsList = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            background = VestigeUI.HologramBlue
        }
        
        insights.take(5).forEach { insight ->
            val insightPanel = JPanel(BorderLayout()).apply {
                background = VestigeUI.DeepSlate
                border = JBUI.Borders.empty(8, 8)
            }
            
            val icon = when (insight.severity) {
                "CRITICAL" -> "🔴"
                "MEDIUM" -> "🟡"
                else -> "🟢"
            }
            
            val text = JBLabel("$icon ${insight.message}").apply {
                font = VestigeUI.InterFont.deriveFont(12f)
                foreground = Color.WHITE
            }
            
            insightPanel.add(text, BorderLayout.WEST)
            insightsList.add(insightPanel)
            insightsList.add(Box.createVerticalStrut(8))
        }
        
        recommendations.forEach { rec ->
            val recPanel = JPanel(BorderLayout()).apply {
                background = VestigeUI.DeepSlate
                border = JBUI.Borders.empty(8, 8)
            }
            
            val text = JBLabel(rec).apply {
                font = VestigeUI.InterFont.deriveFont(12f)
                foreground = VestigeUI.Green
            }
            
            recPanel.add(text, BorderLayout.WEST)
            insightsList.add(recPanel)
            insightsList.add(Box.createVerticalStrut(8))
        }
        
        panel.add(insightsLabel, BorderLayout.NORTH)
        panel.add(JBScrollPane(insightsList), BorderLayout.CENTER)
        
        return panel
    }
    
    private fun getScoreColor(score: Double): Color {
        return when {
            score >= 0.8 -> VestigeUI.Green
            score >= 0.6 -> VestigeUI.Amber
            score >= 0.4 -> VestigeUI.Red
            else -> VestigeUI.Red.darker()
        }
    }
}

