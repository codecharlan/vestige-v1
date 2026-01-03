package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.codecharlan.vestige.logic.VestigeDebtCalculator
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.table.JBTable
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.FlowLayout
import java.awt.GridLayout
import javax.swing.JPanel
import javax.swing.border.EmptyBorder
import javax.swing.table.DefaultTableModel

class VestigeStatusDashboard(private val project: Project) : JPanel() {
    private val tableModel = DefaultTableModel(arrayOf("Repository", "Debt Score", "Risk Level"), 0)
    private val table = JBTable(tableModel)
    private val currentFilePanel = JPanel()

    init {
        layout = BorderLayout()
        background = VestigeUI.DeepSlate
        isOpaque = true
        
        // Modern header with gradient effect
        val header = JPanel(BorderLayout()).apply {
            background = VestigeUI.HologramBlue
            border = JBUI.Borders.empty(20, 20)
            add(JBLabel("🗿 Vestige Dashboard").apply {
                font = VestigeUI.InterFont.deriveFont(20f)
                foreground = VestigeUI.Purple
            }, BorderLayout.WEST)
        }
        
        // Current file stats panel (real-time)
        currentFilePanel.layout = GridLayout(0, 2, 10, 10)
        currentFilePanel.background = VestigeUI.HologramBlue
        currentFilePanel.border = JBUI.Borders.compound(
            EmptyBorder(16, 16, 16, 16),
            JBUI.Borders.customLine(VestigeUI.Purple, 1)
        )
        
        val statsContainer = JPanel(BorderLayout()).apply {
            background = VestigeUI.DeepSlate
            add(currentFilePanel, BorderLayout.CENTER)
        }
        
        // Table with modern styling
        table.background = VestigeUI.HologramBlue
        table.foreground = java.awt.Color.WHITE
        table.gridColor = VestigeUI.Purple.darker()
        table.selectionBackground = VestigeUI.Purple.darker()
        table.selectionForeground = java.awt.Color.WHITE
        
        val scrollPane = JBScrollPane(table).apply {
            border = JBUI.Borders.empty(16, 16)
            background = VestigeUI.DeepSlate
        }
        
        add(header, BorderLayout.NORTH)
        add(statsContainer, BorderLayout.CENTER)
        add(scrollPane, BorderLayout.SOUTH)
        
        refreshData()
        
        // Auto-refresh every 3 seconds
        javax.swing.Timer(3000) {
            refreshData()
        }.start()
    }

    fun refreshData() {
        // Refresh current file stats
        currentFilePanel.removeAll()
        
        val fileEditorManager = FileEditorManager.getInstance(project)
        val currentFile = fileEditorManager.selectedFiles.firstOrNull()
        
        if (currentFile != null) {
            val service = project.getService(VestigeService::class.java)
            val result = service.analyzeFile(currentFile)
            
            if (result != null) {
                // Real-time stats
                result.realTimeStats?.let { rt ->
                    addStatCard("📝 Lines", "${rt.lineCount}")
                    addStatCard("⚡ Complexity", "${rt.complexity}")
                    addStatCard("📊 Health", rt.codeHealth)
                    addStatCard("🕐 Status", if (rt.isNewFile) "New file" else rt.estimatedAge)
                }
                
                // Git stats (if available)
                result.stats?.let { stats ->
                    addStatCard("🔄 Commits", "${stats.commits}")
                    addStatCard("📅 Age", "${stats.ageDays} days")
                    addStatCard("👤 Author", stats.topAuthor.take(15))
                }
                
                addStatCard("💎 Stability", "${result.stability}%")
                addStatCard("📈 Debt", String.format("%.1f", result.debt))
            }
        } else {
            addStatCard("📂 No file", "Open a file to see stats")
        }
        
        currentFilePanel.revalidate()
        currentFilePanel.repaint()
        
        // Refresh table
        tableModel.rowCount = 0
        val score = 25.4 // Simulated score for the current project
        
        tableModel.addRow(arrayOf(project.name, String.format("%.1f", score), "High"))
    }
    
    private fun addStatCard(label: String, value: String) {
        val card = JPanel(BorderLayout()).apply {
            background = VestigeUI.DeepSlate
            border = JBUI.Borders.compound(
                EmptyBorder(12, 12, 12, 12),
                JBUI.Borders.customLine(VestigeUI.Purple.darker(), 1)
            )
            
            add(JBLabel(label).apply {
                font = VestigeUI.InterFont.deriveFont(11f)
                foreground = java.awt.Color(180, 180, 180)
            }, BorderLayout.NORTH)
            
            add(JBLabel(value).apply {
                font = VestigeUI.InterFont.deriveFont(14f)
                foreground = VestigeUI.Purple
            }, BorderLayout.CENTER)
        }
        currentFilePanel.add(card)
    }
}
