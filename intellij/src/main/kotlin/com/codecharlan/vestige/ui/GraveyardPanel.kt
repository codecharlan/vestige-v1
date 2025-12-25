package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.table.JBTable
import java.awt.BorderLayout
import javax.swing.JPanel
import javax.swing.table.DefaultTableModel

class GraveyardPanel(private val project: Project) : JPanel() {
    private val tableModel = DefaultTableModel(arrayOf("Deleted Path", "Author", "Date"), 0)
    private val table = JBTable(tableModel)

    init {
        layout = BorderLayout()
        isOpaque = false
        
        val header = JBLabel("💀 Code Graveyard").apply {
            font = font.deriveFont(18f)
            border = javax.swing.BorderFactory.createEmptyBorder(10, 10, 10, 10)
        }
        add(header, BorderLayout.NORTH)
        add(JBScrollPane(table), BorderLayout.CENTER)
        
        refresh()
    }

    fun refresh() {
        tableModel.rowCount = 0
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)
        val deleted = analyzer.findDeletedFiles()
        deleted.forEach { data ->
            tableModel.addRow(arrayOf(data["path"] ?: "Unknown", data["author"] ?: "Unknown", data["date"] ?: "Unknown"))
        }
    }
}
