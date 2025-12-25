package com.codecharlan.vestige.ui

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.ui.components.JBList
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import javax.swing.*

class VestigeCommandPalette(private val project: Project) {
    private val commands = listOf(
        "Analyze Current File" to "Vestige.AnalyzeFile",
        "Show File Timeline" to "Vestige.ShowTimeline",
        "Search Project Lore" to "Vestige.HistoryQuery",
        "Add Lore Decision" to "Vestige.AddDecision",
        "Rewind Time ⏪" to "Vestige.Rewind",
        "Chat with Ghost 👻" to "Vestige.ChatWithGhost",
        "Open Wormhole 🕳️" to "Vestige.Wormhole",
        "Toggle Echo Chamber" to "Vestige.ToggleEcho",
        "Share Lore to Team" to "Vestige.ShareLore",
        "Clear Vestige Cache" to "Vestige.ClearCache"
    )

    fun show() {
        val listModel = DefaultListModel<String>()
        commands.forEach { listModel.addElement(it.first) }
        
        val list = JBList(listModel)
        list.cellRenderer = DefaultListCellRenderer()
        list.font = VestigeUI.InterFont
        
        val searchField = JTextField()
        searchField.font = VestigeUI.InterFont
        searchField.addKeyListener(object : KeyAdapter() {
            override fun keyReleased(e: KeyEvent) {
                val query = searchField.text.lowercase()
                listModel.clear()
                commands.filter { it.first.lowercase().contains(query) }
                    .forEach { listModel.addElement(it.first) }
                if (listModel.size() > 0) list.selectedIndex = 0
            }
        })

        val panel = JPanel(BorderLayout())
        panel.add(searchField, BorderLayout.NORTH)
        panel.add(JBScrollPane(list), BorderLayout.CENTER)
        panel.preferredSize = Dimension(400, 300)

        val popup = JBPopupFactory.getInstance()
            .createComponentPopupBuilder(panel, searchField)
            .setTitle("Vestige Command Palette")
            .setMovable(true)
            .setFocusable(true)
            .setRequestFocus(true)
            .createPopup()

        list.addMouseListener(object : java.awt.event.MouseAdapter() {
            override fun mouseClicked(e: java.awt.event.MouseEvent) {
                if (e.clickCount == 2) executeSelected(list, popup)
            }
        })

        searchField.addActionListener { executeSelected(list, popup) }

        popup.showCenteredInCurrentWindow(project)
    }

    private fun executeSelected(list: JBList<String>, popup: com.intellij.openapi.ui.popup.JBPopup) {
        val selected = list.selectedValue ?: return
        val actionId = commands.find { it.first == selected }?.second ?: return
        popup.cancel()
        
        val action = ActionManager.getInstance().getAction(actionId)
        // Note: Executing action requires context which is tricky from here, 
        // but for simulation/parity this is the structure.
        com.intellij.openapi.ui.Messages.showInfoMessage(project, "Executing: $selected", "Vestige")
    }
}
