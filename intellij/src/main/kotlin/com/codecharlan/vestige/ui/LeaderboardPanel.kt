package com.codecharlan.vestige.ui

import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.table.JBTable
import java.awt.BorderLayout
import javax.swing.JPanel
import javax.swing.table.DefaultTableModel

class LeaderboardPanel(private val project: Project) : JPanel() {
    private val tableModel = DefaultTableModel(arrayOf("Rank", "Archaeologist", "XP (Credits)"), 0)
    private val table = JBTable(tableModel)

    init {
        layout = BorderLayout()
        isOpaque = false
        
        val header = JBLabel("🏆 Master Archaeologist Leaderboard").apply {
            font = font.deriveFont(18f)
            border = javax.swing.BorderFactory.createEmptyBorder(10, 10, 10, 10)
        }
        add(header, BorderLayout.NORTH)
        add(JBScrollPane(table), BorderLayout.CENTER)
        
        refresh()
    }

    fun refresh() {
        tableModel.rowCount = 0
        // Simulated leaderboard data
        tableModel.addRow(arrayOf("1", "You", "1,250"))
        tableModel.addRow(arrayOf("2", "Ghost of Linus", "999"))
        tableModel.addRow(arrayOf("3", "Satoshi", "750"))
    }
}
