package com.codecharlan.vestige.ui

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBList
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import javax.swing.*
import javax.swing.border.EmptyBorder

class VestigeCommandPalette(private val project: Project) : DialogWrapper(project) {
    private val commands = listOf(
        Command("Analyze Current File", "Vestige.AnalyzeFile", "🔍 Analyze file history and metrics", "A"),
        Command("Show File Timeline", "Vestige.ShowTimeline", "📅 View commit timeline for current file", "T"),
        Command("Search Project Lore", "Vestige.HistoryQuery", "🔎 Search historical decisions", "S"),
        Command("Add Lore Decision", "Vestige.AddDecision", "➕ Record architectural decision", "L"),
        Command("Rewind Time ⏪", "Vestige.Rewind", "⏪ Checkout previous commit", "R"),
        Command("Chat with Ghost 👻", "Vestige.ChatWithGhost", "👻 AI-powered code history chat", "C"),
        Command("Open Wormhole 🕳️", "Vestige.Wormhole", "🕳️ Bridge historical code to present", "W"),
        Command("Toggle Echo Chamber", "Vestige.ToggleEcho", "🔊 Auditory code health feedback", "E"),
        Command("Share Lore to Team", "Vestige.ShareLore", "🚀 Export insights to team", "H"),
        Command("Clear Vestige Cache", "Vestige.ClearCache", "🗑️ Clear cached analysis data", "X")
    )
    
    data class Command(
        val name: String,
        val actionId: String,
        val description: String,
        val shortcut: String
    )

    private val panel = JPanel(BorderLayout())
    private val listModel = DefaultListModel<Command>()
    private val commandList = JBList<Command>(listModel).apply {
        cellRenderer = CommandRenderer()
        selectionMode = ListSelectionModel.SINGLE_SELECTION
        addListSelectionListener {
            if (!valueIsAdjusting && selectedValue != null) {
                executeCommand(selectedValue)
            }
        }
    }

    private val searchField = JTextField().apply {
        font = VestigeUI.InterFont
        border = JBUI.Borders.compound(
            JBUI.Borders.empty(12, 16),
            JBUI.Borders.customLine(VestigeUI.Purple, 1)
        )
        addKeyListener(object : KeyAdapter() {
            override fun keyReleased(e: KeyEvent) {
                filterCommands(text)
            }
            
            override fun keyPressed(e: KeyEvent) {
                when (e.keyCode) {
                    KeyEvent.VK_ENTER -> {
                        commandList.selectedValue?.let { executeCommand(it) }
                    }
                    KeyEvent.VK_UP -> {
                        if (commandList.selectedIndex > 0) {
                            commandList.selectedIndex = commandList.selectedIndex - 1
                        }
                    }
                    KeyEvent.VK_DOWN -> {
                        if (commandList.selectedIndex < listModel.size - 1) {
                            commandList.selectedIndex = commandList.selectedIndex + 1
                        }
                    }
                    KeyEvent.VK_ESCAPE -> {
                        close(0)
                    }
                }
            }
        })
    }
    
    private fun filterCommands(query: String) {
        listModel.clear()
        val filtered = if (query.isEmpty()) {
            commands
        } else {
            // Fuzzy search: matches if all query characters appear in order
            commands.filter { command ->
                fuzzyMatch(query.lowercase(), command.name.lowercase()) ||
                command.description.lowercase().contains(query.lowercase())
            }
        }
        filtered.forEach { listModel.addElement(it) }
        if (listModel.size > 0) {
            commandList.selectedIndex = 0
        }
    }
    
    private fun fuzzyMatch(query: String, text: String): Boolean {
        var queryIndex = 0
        for (char in text) {
            if (queryIndex < query.length && char == query[queryIndex]) {
                queryIndex++
            }
        }
        return queryIndex == query.length
    }
    
    private fun executeCommand(command: Command) {
        try {
            val actionManager = ActionManager.getInstance()
            val action = actionManager.getAction(command.actionId)
            action?.actionPerformed(AnActionEvent.createFromAnAction(action, null, "", com.intellij.openapi.actionSystem.DataContext.EMPTY_CONTEXT))
            close(0)
        } catch (e: Exception) {
            // Action might not exist, show error
            JOptionPane.showMessageDialog(
                panel,
                "Command '${command.name}' is not available",
                "Vestige",
                JOptionPane.ERROR_MESSAGE
            )
        }
    }

    init {
        init()
        title = "Vestige Command Palette"
        isResizable = false
        filterCommands("")
    }

    override fun createCenterPanel(): JComponent {
        panel.border = EmptyBorder(0, 0, 0, 0)
        panel.background = VestigeUI.DeepSlate
        
        // Header
        val header = JLabel("Vestige Command Palette").apply {
            font = VestigeUI.InterFont.deriveFont(16f)
            foreground = VestigeUI.Purple
            border = JBUI.Borders.empty(16, 16, 8, 16)
        }
        
        // Search field with modern styling
        val searchPanel = JPanel(BorderLayout()).apply {
            background = VestigeUI.DeepSlate
            add(header, BorderLayout.NORTH)
            add(searchField, BorderLayout.CENTER)
        }
        
        // Command list with scroll
        val scrollPane = JBScrollPane(commandList).apply {
            border = JBUI.Borders.empty()
            background = VestigeUI.HologramBlue
        }
        commandList.background = VestigeUI.HologramBlue
        
        panel.add(searchPanel, BorderLayout.NORTH)
        panel.add(scrollPane, BorderLayout.CENTER)
        
        // Focus search field
        SwingUtilities.invokeLater { 
            searchField.requestFocusInWindow()
        }
        
        return panel
    }
    
    private class CommandRenderer : ListCellRenderer<Command> {
        private val panel = JPanel(BorderLayout()).apply {
            border = JBUI.Borders.empty(12, 16)
            background = VestigeUI.HologramBlue
        }
        private val nameLabel = JLabel().apply {
            font = VestigeUI.InterFont.deriveFont(14f)
            foreground = java.awt.Color.WHITE
        }
        private val descLabel = JLabel().apply {
            font = VestigeUI.InterFont.deriveFont(11f)
            foreground = java.awt.Color(200, 200, 200)
        }
        private val shortcutLabel = JLabel().apply {
            font = VestigeUI.MonoFont.deriveFont(10f)
            foreground = VestigeUI.Purple
            border = JBUI.Borders.empty(4, 8)
        }
        
        init {
            val leftPanel = JPanel(BorderLayout()).apply {
                background = VestigeUI.HologramBlue
                add(nameLabel, BorderLayout.NORTH)
                add(descLabel, BorderLayout.SOUTH)
            }
            panel.add(leftPanel, BorderLayout.CENTER)
            panel.add(shortcutLabel, BorderLayout.EAST)
        }
        
        override fun getListCellRendererComponent(
            list: JList<out Command>?,
            value: Command?,
            index: Int,
            isSelected: Boolean,
            cellHasFocus: Boolean
        ): JComponent {
            if (value == null) return panel
            
            nameLabel.text = value.name
            descLabel.text = value.description
            shortcutLabel.text = value.shortcut
            
            val bg = if (isSelected) {
                VestigeUI.Purple.darker().darker()
            } else {
                VestigeUI.HologramBlue
            }
            
            panel.background = bg
            nameLabel.background = bg
            descLabel.background = bg
            shortcutLabel.background = bg
            
            return panel
        }
    }
}
