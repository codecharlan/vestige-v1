package com.codecharlan.vestige.ui

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.ex.ActionUtil
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Dimension
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.*

class VestigeCommandPalette(private val project: Project) : DialogWrapper(project) {

    // Descriptions carry the meaning; the emoji that used to prefix every name
    // and every description made the list hard to scan and duplicated the text.
    private val commands = listOf(
        Command("Analyze current file", "Vestige.AnalyzeFile", "Analyze this file's history and metrics", "A"),
        Command("Show file timeline", "Vestige.ShowTimeline", "View the commit timeline for this file", "T"),
        Command("Search project history", "Vestige.HistoryQuery", "Search recorded decisions and history", "S"),
        Command("Record a decision", "Vestige.AddDecision", "Write down why the code is this way", "L"),
        Command("Check out an earlier commit", "Vestige.Rewind", "Move the working tree to a past commit", "R"),
        Command("Ask about this code's history", "Vestige.ChatWithGhost", "Question the file's history in natural language", "C"),
        Command("Compare with a past version", "Vestige.Wormhole", "Bring historical code alongside the present", "W"),
        Command("Toggle audio feedback", "Vestige.ToggleEcho", "Play a sound cue on code health changes", "E"),
        Command("Share findings with the team", "Vestige.ShareLore", "Export insights to the configured webhook", "H"),
        Command("Clear cached analysis", "Vestige.ClearCache", "Discard stored analysis results", "X")
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
        background = VestigeUI.SurfaceRaised
        // Selection changes only update highlighting. Commands execute
        // exclusively on Enter or double-click.
        addKeyListener(object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                if (e.keyCode == KeyEvent.VK_ENTER) {
                    selectedValue?.let { executeCommand(it) }
                    e.consume()
                }
            }
        })
        addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                if (e.clickCount == 2 && SwingUtilities.isLeftMouseButton(e)) {
                    val index = locationToIndex(e.point)
                    if (index >= 0) {
                        selectedIndex = index
                        selectedValue?.let { executeCommand(it) }
                    }
                }
            }
        })
    }

    private val searchField = JBTextField().apply {
        font = VestigeUI.bodyFont()
        emptyText.text = "Type to filter commands"
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

    private val emptyLabel = JBLabel("No command matches that.").apply {
        font = VestigeUI.bodyFont()
        foreground = VestigeUI.TextMuted
        border = JBUI.Borders.empty(VestigeUI.SpaceLg)
        isVisible = false
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
        emptyLabel.isVisible = listModel.isEmpty
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
        val action = ActionManager.getInstance().getAction(command.actionId)
        if (action == null) {
            JOptionPane.showMessageDialog(
                panel,
                "Command '${command.name}' is not available",
                "Vestige",
                JOptionPane.ERROR_MESSAGE
            )
            return
        }
        // Close the palette first so the invoked action can open its own dialogs.
        close(0)
        val dataContext = SimpleDataContext.builder()
            .add(CommonDataKeys.PROJECT, project)
            .build()
        try {
            ActionUtil.invokeAction(action, dataContext, "VestigeCommandPalette", null, null)
        } catch (e: Exception) {
            JOptionPane.showMessageDialog(
                null,
                "Command '${command.name}' failed: ${e.message}",
                "Vestige",
                JOptionPane.ERROR_MESSAGE
            )
        }
    }

    init {
        init()
        title = "Vestige Commands"
        isResizable = false
        filterCommands("")
    }

    override fun createCenterPanel(): JComponent {
        panel.border = JBUI.Borders.empty()
        panel.background = VestigeUI.Surface
        panel.preferredSize = Dimension(JBUI.scale(520), JBUI.scale(420))

        // The dialog frame already carries the title; a second in-panel heading
        // was redundant. Only the search field sits above the list now.
        val searchPanel = JPanel(BorderLayout()).apply {
            background = VestigeUI.Surface
            border = JBUI.Borders.empty(VestigeUI.SpaceMd, VestigeUI.SpaceMd, VestigeUI.SpaceSm, VestigeUI.SpaceMd)
            add(searchField, BorderLayout.CENTER)
        }

        val scrollPane = JBScrollPane(commandList).apply {
            border = JBUI.Borders.empty()
            background = VestigeUI.SurfaceRaised
            viewport.background = VestigeUI.SurfaceRaised
        }

        val listArea = JPanel(BorderLayout()).apply {
            background = VestigeUI.SurfaceRaised
            add(scrollPane, BorderLayout.CENTER)
            add(emptyLabel, BorderLayout.NORTH)
        }

        panel.add(searchPanel, BorderLayout.NORTH)
        panel.add(listArea, BorderLayout.CENTER)

        // Focus search field
        SwingUtilities.invokeLater {
            searchField.requestFocusInWindow()
        }

        return panel
    }

    /**
     * Row renderer. The previous version painted the name in `Color.WHITE` and
     * the description in `Color(200, 200, 200)` over a hardcoded dark panel, so
     * on a light IDE theme the text was near-invisible; selection was signalled
     * by `Purple.darker().darker()` rather than the IDE's own selection colour.
     */
    private class CommandRenderer : ListCellRenderer<Command> {
        private val nameLabel = JBLabel().apply { font = VestigeUI.bodyFont() }
        private val descLabel = JBLabel().apply { font = VestigeUI.captionFont() }
        private val shortcutLabel = JBLabel().apply {
            font = VestigeUI.MonoFont
            border = JBUI.Borders.empty(0, VestigeUI.SpaceSm)
        }

        private val textColumn = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(nameLabel)
            add(Box.createVerticalStrut(VestigeUI.SpaceXs))
            add(descLabel)
        }

        private val panel = JPanel(BorderLayout(VestigeUI.SpaceSm, 0)).apply {
            border = JBUI.Borders.empty(VestigeUI.SpaceSm, VestigeUI.SpaceMd)
            isOpaque = true
            add(textColumn, BorderLayout.CENTER)
            add(JPanel(BorderLayout()).apply {
                isOpaque = false
                add(shortcutLabel, BorderLayout.NORTH)
            }, BorderLayout.EAST)
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

            // Defer to the IDE's list colours so selection matches every other
            // list in the IDE, in both light and dark themes.
            val bg: Color = if (isSelected) {
                list?.selectionBackground ?: VestigeUI.SurfaceRaised
            } else {
                list?.background ?: VestigeUI.SurfaceRaised
            }
            val fg: Color = if (isSelected) {
                list?.selectionForeground ?: VestigeUI.TextPrimary
            } else {
                VestigeUI.TextPrimary
            }

            panel.background = bg
            nameLabel.foreground = fg
            descLabel.foreground = if (isSelected) fg else VestigeUI.TextMuted
            shortcutLabel.foreground = if (isSelected) fg else VestigeUI.TextMuted

            return panel
        }
    }
}
