package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Component
import java.awt.Dimension
import java.text.SimpleDateFormat
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.ListCellRenderer
import javax.swing.ListSelectionModel

/**
 * Pick a commit to check out.
 *
 * The list used to be a single pre-formatted string per row
 * (`"[abc1234] author: message"`) rendered in the default label font, so the
 * hash, author and subject ran together. Each part now has its own treatment,
 * with the hash in the editor font, and the dialog states which file it is
 * about.
 */
class VestigeCommitPicker(
    private val project: Project,
    private val file: VirtualFile,
    private val commits: List<VestigeGitAnalyzer.CommitInfo>
) : DialogWrapper(project) {

    private val list = JBList(commits).apply {
        selectionMode = ListSelectionModel.SINGLE_SELECTION
        cellRenderer = CommitRenderer()
        background = VestigeUI.SurfaceRaised
        if (commits.isNotEmpty()) selectedIndex = 0
    }

    init {
        title = "Check Out an Earlier Commit"
        init()
    }

    override fun createCenterPanel(): JComponent {
        val panel = JPanel(BorderLayout()).apply {
            background = VestigeUI.Surface
            preferredSize = Dimension(JBUI.scale(560), JBUI.scale(340))
            border = JBUI.Borders.empty(VestigeUI.SpaceMd)
        }

        panel.add(JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            border = JBUI.Borders.emptyBottom(VestigeUI.SpaceMd)
            add(JBLabel(file.name).apply {
                font = VestigeUI.headingFont()
                foreground = VestigeUI.TextPrimary
                alignmentX = Component.LEFT_ALIGNMENT
            })
            add(Box.createVerticalStrut(VestigeUI.SpaceXs))
            add(JBLabel("Select the point in history to move the working tree to.").apply {
                font = VestigeUI.captionFont()
                foreground = VestigeUI.TextMuted
                alignmentX = Component.LEFT_ALIGNMENT
            })
        }, BorderLayout.NORTH)

        if (commits.isEmpty()) {
            panel.add(
                VestigeUI.emptyState(
                    "No commits found",
                    "Vestige could not read any history for this file."
                ),
                BorderLayout.CENTER
            )
        } else {
            panel.add(JBScrollPane(list).apply {
                border = JBUI.Borders.empty()
                viewport.background = VestigeUI.SurfaceRaised
            }, BorderLayout.CENTER)
        }

        return panel
    }

    fun getSelectedHash(): String? {
        val index = list.selectedIndex
        return if (index >= 0) commits[index].hash else null
    }

    private class CommitRenderer : ListCellRenderer<VestigeGitAnalyzer.CommitInfo> {
        private val dateFormat = SimpleDateFormat("MMM d, yyyy")

        private val messageLabel = JBLabel().apply { font = VestigeUI.bodyFont() }
        private val metaLabel = JBLabel().apply { font = VestigeUI.captionFont() }
        private val hashLabel = JBLabel().apply { font = VestigeUI.MonoFont }

        private val panel = JPanel(BorderLayout(VestigeUI.SpaceSm, 0)).apply {
            border = JBUI.Borders.empty(VestigeUI.SpaceSm, VestigeUI.SpaceMd)
            isOpaque = true
            add(JPanel().apply {
                layout = BoxLayout(this, BoxLayout.Y_AXIS)
                isOpaque = false
                add(messageLabel)
                add(Box.createVerticalStrut(VestigeUI.SpaceXs))
                add(metaLabel)
            }, BorderLayout.CENTER)
            add(JPanel(BorderLayout()).apply {
                isOpaque = false
                add(hashLabel, BorderLayout.NORTH)
            }, BorderLayout.EAST)
        }

        override fun getListCellRendererComponent(
            list: JList<out VestigeGitAnalyzer.CommitInfo>?,
            value: VestigeGitAnalyzer.CommitInfo?,
            index: Int,
            isSelected: Boolean,
            cellHasFocus: Boolean
        ): Component {
            if (value == null) return panel

            messageLabel.text = value.message.lineSequence().firstOrNull()?.trim()
                ?.ifEmpty { "(no commit message)" } ?: "(no commit message)"
            metaLabel.text = "${dateFormat.format(value.date)} · ${value.author}"
            hashLabel.text = value.hash.take(7)

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
            messageLabel.foreground = fg
            metaLabel.foreground = if (isSelected) fg else VestigeUI.TextMuted
            hashLabel.foreground = if (isSelected) fg else VestigeUI.TextSecondary

            return panel
        }
    }
}
