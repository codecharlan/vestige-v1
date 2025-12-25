package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeDebtCalculator
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.table.JBTable
import java.awt.BorderLayout
import javax.swing.JPanel
import javax.swing.table.DefaultTableModel

class VestigeStatusDashboard(private val project: Project) : JPanel() {
    private val tableModel = DefaultTableModel(arrayOf("Repository", "Debt Score", "Risk Level"), 0)
    private val table = JBTable(tableModel)

    init {
        layout = BorderLayout()
        isOpaque = false
        
        val header = JBLabel("🗿 Enterprise Health Dashboard").apply {
            font = font.deriveFont(18f)
            border = javax.swing.BorderFactory.createEmptyBorder(10, 10, 10, 10)
        }
        add(header, BorderLayout.NORTH)
        
        add(JBScrollPane(table), BorderLayout.CENTER)
        
        refreshData()
    }

    fun refreshData() {
        tableModel.rowCount = 0
        // In a real implementation, we would iterate over all open repositories
        // For this recovery, we'll show a placeholder based on the current project
        val debtCalculator = project.getService(VestigeDebtCalculator::class.java)
        val score = 25.4 // Simulated score for the current project
        
        tableModel.addRow(arrayOf(project.name, String.format("%.1f", score), "High"))
    }
}
