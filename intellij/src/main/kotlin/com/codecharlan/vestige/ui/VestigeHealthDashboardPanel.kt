package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeHealthScore
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import java.awt.*
import java.awt.geom.RoundRectangle2D
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
        loadHealthScore()
    }

    /**
     * Runs as a visible, cancellable background task.
     *
     * It deliberately does NOT use a long `ReadAction.nonBlocking`: health
     * scoring issues git calls, which have no cancellation points, so holding
     * the read lock across them made every keystroke (which needs the write
     * lock) wait — the freeze users reported. The scorer now takes only brief
     * read actions for document text.
     */
    private fun loadHealthScore() {
        ProgressManager.getInstance().run(
            object : Task.Backgroundable(project, "Calculating Vestige code health", true) {
                private var result: VestigeHealthScore.HealthScore? = null

                override fun run(indicator: ProgressIndicator) {
                    indicator.isIndeterminate = true
                    indicator.text = "Sampling repository history…"
                    result = project.getService(VestigeHealthScore::class.java).calculateHealthScore()
                }

                override fun onSuccess() {
                    result?.let { updateUI(it) }
                }

                override fun onCancel() {
                    showMessageState("Health calculation cancelled.", "Reopen this tab to try again.")
                }

                override fun onThrowable(error: Throwable) {
                    Logger.getInstance(VestigeHealthDashboardPanel::class.java)
                        .warn("Health score calculation failed", error)
                    showMessageState("Could not calculate code health.", error.message ?: "Unknown error")
                }
            }
        )
    }

    private fun showLoadingState() {
        val loadingPanel = JPanel(GridBagLayout()).apply {
            background = VestigeUI.DeepSlate
            add(JBLabel("Analysing repository health…").apply {
                font = VestigeUI.InterFont.deriveFont(14f)
                foreground = VestigeUI.Purple
            })
        }
        add(loadingPanel, BorderLayout.CENTER)
        revalidate()
        repaint()
    }

    /** Empty/failure state with a way back — never a silent blank panel. */
    private fun showMessageState(title: String, detail: String) {
        removeAll()
        val panel = JPanel(GridBagLayout()).apply { background = VestigeUI.DeepSlate }
        val content = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(JBLabel(title).apply {
                font = VestigeUI.InterFont.deriveFont(Font.BOLD, 14f)
                foreground = VestigeUI.TextPrimary
                alignmentX = Component.CENTER_ALIGNMENT
            })
            add(Box.createVerticalStrut(6))
            add(JBLabel(detail).apply {
                font = VestigeUI.InterFont.deriveFont(12f)
                foreground = VestigeUI.TextMuted
                alignmentX = Component.CENTER_ALIGNMENT
            })
            add(Box.createVerticalStrut(14))
            add(JButton("Retry").apply {
                alignmentX = Component.CENTER_ALIGNMENT
                addActionListener {
                    removeAll()
                    showLoadingState()
                    loadHealthScore()
                }
            })
        }
        panel.add(content)
        add(panel, BorderLayout.CENTER)
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
        val card = VestigeUI.Card()
        card.layout = BorderLayout(VestigeUI.SpaceLg, 0)

        val scoreLabel = JBLabel("${(score * 100).toInt()}%").apply {
            font = VestigeUI.InterFont.deriveFont(java.awt.Font.BOLD, JBUI.scaleFontSize(34f).toFloat())
            foreground = VestigeUI.toneForScore(score)
        }

        val leftPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(JBLabel(title).apply {
                font = VestigeUI.headingFont()
                foreground = VestigeUI.TextPrimary
                alignmentX = Component.LEFT_ALIGNMENT
            })
            add(Box.createVerticalStrut(VestigeUI.SpaceXs))
            add(JBLabel(description).apply {
                font = VestigeUI.captionFont()
                foreground = VestigeUI.TextMuted
                alignmentX = Component.LEFT_ALIGNMENT
            })
        }

        card.add(leftPanel, BorderLayout.WEST)
        card.add(scoreLabel, BorderLayout.EAST)

        return card
    }

    private fun createCategoryCard(category: String, score: Double): JPanel {
        val card = VestigeUI.Card()
        card.layout = BoxLayout(card, BoxLayout.Y_AXIS)

        val label = category.lowercase().replace('_', ' ')
            .replaceFirstChar { it.uppercase() }

        val header = JPanel(BorderLayout()).apply {
            isOpaque = false
            add(JBLabel(label).apply {
                font = VestigeUI.bodyFont()
                foreground = VestigeUI.TextPrimary
            }, BorderLayout.WEST)
            add(JBLabel("${(score * 100).toInt()}%").apply {
                font = VestigeUI.captionFont().deriveFont(java.awt.Font.BOLD)
                foreground = VestigeUI.toneForScore(score)
            }, BorderLayout.EAST)
        }
        header.alignmentX = Component.LEFT_ALIGNMENT
        card.add(header)
        card.add(Box.createVerticalStrut(VestigeUI.SpaceSm))

        // A real meter. The previous version sized its fill from
        // `progressBar.preferredSize.width`, which is 0, and added it with a
        // BorderLayout constraint to a FlowLayout panel — so it never drew.
        val meter = VestigeUI.Meter(score, VestigeUI.toneForScore(score))
        meter.alignmentX = Component.LEFT_ALIGNMENT
        card.add(meter)

        return card
    }
    
    private fun createInsightsPanel(insights: List<VestigeHealthScore.Insight>, recommendations: List<String>): JPanel {
        val panel = JPanel(BorderLayout()).apply {
            isOpaque = false
        }

        val heading = VestigeUI.sectionHeader("What to look at")

        val list = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
        }

        // Severity is carried by a Pill's tone rather than a coloured emoji, so
        // it still reads correctly in a light theme and to a screen reader.
        insights.take(5).forEach { insight ->
            val row = VestigeUI.Card()
            row.layout = BorderLayout(VestigeUI.SpaceSm, 0)
            val tone = when (insight.severity) {
                "CRITICAL" -> VestigeUI.Red
                "MEDIUM" -> VestigeUI.Amber
                else -> VestigeUI.Green
            }
            row.add(VestigeUI.Pill(insight.severity.lowercase(), tone), BorderLayout.WEST)
            row.add(JBLabel(insight.message).apply {
                font = VestigeUI.bodyFont()
                foreground = VestigeUI.TextPrimary
            }, BorderLayout.CENTER)
            row.alignmentX = Component.LEFT_ALIGNMENT
            row.maximumSize = Dimension(Int.MAX_VALUE, row.preferredSize.height)
            list.add(row)
            list.add(Box.createVerticalStrut(VestigeUI.SpaceSm))
        }

        if (recommendations.isNotEmpty()) {
            list.add(VestigeUI.sectionHeader("Suggested next steps"))
            recommendations.forEach { rec ->
                val row = VestigeUI.Card()
                row.layout = BorderLayout()
                row.add(JBLabel(rec).apply {
                    font = VestigeUI.bodyFont()
                    foreground = VestigeUI.TextSecondary
                }, BorderLayout.CENTER)
                row.alignmentX = Component.LEFT_ALIGNMENT
                row.maximumSize = Dimension(Int.MAX_VALUE, row.preferredSize.height)
                list.add(row)
                list.add(Box.createVerticalStrut(VestigeUI.SpaceSm))
            }
        }

        panel.add(heading, BorderLayout.NORTH)
        panel.add(list, BorderLayout.CENTER)

        return panel
    }

    private fun getScoreColor(score: Double): Color {
        return VestigeUI.toneForScore(score)
    }
}

