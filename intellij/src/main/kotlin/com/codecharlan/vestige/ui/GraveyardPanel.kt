package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.ReadAction
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.table.JBTable
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.AppExecutorUtil
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JTable
import javax.swing.ListSelectionModel
import javax.swing.table.DefaultTableCellRenderer
import javax.swing.table.DefaultTableModel

/**
 * Files that were deleted from the repository, and who deleted them.
 *
 * The table is kept — a scannable list of paths is the right form here — but it
 * now has a real header, a loading state and an empty state, instead of
 * appearing as a permanently blank grid whenever the scan returned nothing.
 */
class GraveyardPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val tableModel = object : DefaultTableModel(arrayOf("Deleted file", "Deleted by", "Date"), 0) {
        override fun isCellEditable(row: Int, column: Int): Boolean = false
    }

    private val table = JBTable(tableModel).apply {
        setShowGrid(false)
        rowHeight = JBUI.scale(24)
        autoResizeMode = JTable.AUTO_RESIZE_LAST_COLUMN
        // JTable exposes setSelectionMode(int) with no matching getter, so Kotlin
        // synthetic-property syntax does not resolve here.
        setSelectionMode(ListSelectionModel.SINGLE_SELECTION)
        font = VestigeUI.bodyFont()
        tableHeader.font = VestigeUI.captionFont()
        // File paths read best in the editor's own font.
        columnModel.getColumn(0).cellRenderer = object : DefaultTableCellRenderer() {
            override fun getTableCellRendererComponent(
                table: JTable, value: Any?, isSelected: Boolean,
                hasFocus: Boolean, row: Int, column: Int
            ): Component {
                val c = super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column)
                c.font = VestigeUI.MonoFont
                return c
            }
        }
    }

    private val body = JPanel(BorderLayout()).apply { isOpaque = false }

    init {
        background = VestigeUI.Surface
        isOpaque = true
        border = JBUI.Borders.empty(VestigeUI.SpaceLg)

        add(header(), BorderLayout.NORTH)
        add(body, BorderLayout.CENTER)

        showMessage("Looking for deleted files…", "Scanning the repository history.")
        refresh()
    }

    private fun header(): JComponent = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        isOpaque = false
        border = JBUI.Borders.emptyBottom(VestigeUI.SpaceLg)
        add(JBLabel("Deleted code").apply {
            font = VestigeUI.titleFont()
            foreground = VestigeUI.TextPrimary
            alignmentX = Component.LEFT_ALIGNMENT
        })
        add(Box.createVerticalStrut(VestigeUI.SpaceXs))
        add(JBLabel("Files removed from this repository, newest first").apply {
            font = VestigeUI.captionFont()
            foreground = VestigeUI.TextMuted
            alignmentX = Component.LEFT_ALIGNMENT
        })
    }

    fun refresh() {
        tableModel.rowCount = 0

        ReadAction.nonBlocking<List<Map<String, String>>> {
            val analyzer = project.getService(VestigeGitAnalyzer::class.java)
            analyzer.findDeletedFiles()
        }
            .inSmartMode(project)
            .finishOnUiThread(ModalityState.any()) { deleted ->
                deleted.forEach { data ->
                    tableModel.addRow(
                        arrayOf(
                            data["file"] ?: "Unknown",
                            data["author"] ?: "Unknown",
                            data["date"] ?: "Unknown"
                        )
                    )
                }
                if (tableModel.rowCount == 0) {
                    showMessage(
                        "No deleted files found",
                        "Nothing has been removed in the history Vestige scanned."
                    )
                } else {
                    showTable()
                }
            }
            .submit(AppExecutorUtil.getAppExecutorService())
    }

    private fun showMessage(title: String, detail: String) {
        body.removeAll()
        body.add(VestigeUI.emptyState(title, detail), BorderLayout.CENTER)
        body.revalidate()
        body.repaint()
    }

    private fun showTable() {
        body.removeAll()
        body.add(JBScrollPane(table).apply { border = JBUI.Borders.empty() }, BorderLayout.CENTER)
        body.revalidate()
        body.repaint()
    }
}
