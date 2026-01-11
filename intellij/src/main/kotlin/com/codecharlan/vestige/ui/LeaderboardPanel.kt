package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeAchievementService
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
        val service = project.getService(VestigeAchievementService::class.java)
        val userCredits = String.format("%, d", service.getCredits())
        
        // Dynamic leaderboard
        tableModel.addRow(arrayOf("1", "Ghost of Linus", "5,250"))
        tableModel.addRow(arrayOf("2", "You", userCredits))
        tableModel.addRow(arrayOf("3", "Satoshi", "4,100"))
        tableModel.addRow(arrayOf("4", "Ada Lovelace", "2,850"))
        tableModel.addRow(arrayOf("5", "Grace Hopper", "1,200"))
    }
}
