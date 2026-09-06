package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.concurrency.AppExecutorUtil
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import java.text.SimpleDateFormat
import java.util.Date
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.ScrollPaneConstants

/**
 * The commit history of the file currently in the editor.
 *
 * This used to be a custom-painted "timeline": commits plotted as dots along a
 * single horizontal axis, each with a translucent square "glow" behind it, and
 * hover detail drawn in `Color.WHITE` on a hardcoded dark rectangle. With 50
 * commits the dots overlapped into an unreadable smear, the labels were
 * invisible on light themes, and there was no mouse listener at all so the
 * hover card could never actually appear.
 *
 * It is now a vertical list: date, author, subject and short hash per commit —
 * denser, scrollable, readable, and theme-correct.
 */
class VestigeEvolutionGraphPanel(private val project: Project) : JPanel(BorderLayout()) {

    data class CommitNode(
        val hash: String,
        val date: Long,
        val author: String,
        val message: String
    )

    private val commits = mutableListOf<CommitNode>()
    private val body = JPanel(BorderLayout()).apply { isOpaque = false }
    private val dateFormat = SimpleDateFormat("MMM d, yyyy")
    private val subtitle = JBLabel().apply {
        font = VestigeUI.captionFont()
        foreground = VestigeUI.TextMuted
        alignmentX = Component.LEFT_ALIGNMENT
    }

    init {
        background = VestigeUI.Surface
        isOpaque = true
        border = JBUI.Borders.empty(VestigeUI.SpaceLg)

        add(header(), BorderLayout.NORTH)
        add(body, BorderLayout.CENTER)

        loadEvolutionData()
    }

    private fun header(): JComponent = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        isOpaque = false
        border = JBUI.Borders.emptyBottom(VestigeUI.SpaceLg)
        add(JBLabel("Commit history").apply {
            font = VestigeUI.titleFont()
            foreground = VestigeUI.TextPrimary
            alignmentX = Component.LEFT_ALIGNMENT
        })
        add(Box.createVerticalStrut(VestigeUI.SpaceXs))
        add(subtitle)
    }

    private fun loadEvolutionData() {
        val currentFile = FileEditorManager.getInstance(project).selectedFiles.firstOrNull()
        if (currentFile == null) {
            subtitle.text = "No file open"
            showMessage(
                "No file open",
                "Open a file tracked in git to see the commits that changed it."
            )
            return
        }

        subtitle.text = currentFile.name
        showMessage("Reading history…", "Loading the most recent commits for ${currentFile.name}.")

        ReadAction.nonBlocking<List<CommitNode>> {
            val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
            gitAnalyzer.getFileHistory(currentFile, 50).map { commit ->
                CommitNode(
                    hash = commit.hash.take(7),
                    date = commit.date.time,
                    author = commit.author,
                    message = commit.message.lineSequence().firstOrNull()?.trim().orEmpty()
                )
            }
        }
            .inSmartMode(project)
            .finishOnUiThread(ModalityState.any()) { nodes ->
                commits.clear()
                commits.addAll(nodes)
                render(currentFile.name)
            }
            .submit(AppExecutorUtil.getAppExecutorService())
    }

    private fun render(fileName: String) {
        if (commits.isEmpty()) {
            subtitle.text = fileName
            showMessage(
                "No commit history",
                "$fileName has no recorded commits — it may be new or untracked."
            )
            return
        }

        subtitle.text = "$fileName · ${commits.size} most recent commits"

        val column = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
        }

        commits.forEach { commit ->
            column.add(commitRow(commit))
            column.add(Box.createVerticalStrut(VestigeUI.SpaceSm))
        }

        body.removeAll()
        body.add(JBScrollPane(JPanel(BorderLayout()).apply {
            background = VestigeUI.Surface
            isOpaque = true
            add(column, BorderLayout.NORTH)
        }).apply {
            border = JBUI.Borders.empty()
            horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
            viewport.background = VestigeUI.Surface
        }, BorderLayout.CENTER)
        body.revalidate()
        body.repaint()
    }

    private fun commitRow(commit: CommitNode): JComponent {
        val card = VestigeUI.Card()
        card.alignmentX = Component.LEFT_ALIGNMENT
        card.layout = BorderLayout(VestigeUI.SpaceMd, 0)

        val text = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(JBLabel(commit.message.ifEmpty { "(no commit message)" }).apply {
                font = VestigeUI.bodyFont()
                foreground = VestigeUI.TextPrimary
                alignmentX = Component.LEFT_ALIGNMENT
            })
            add(Box.createVerticalStrut(VestigeUI.SpaceXs))
            add(JBLabel("${dateFormat.format(Date(commit.date))} · ${commit.author}").apply {
                font = VestigeUI.captionFont()
                foreground = VestigeUI.TextMuted
                alignmentX = Component.LEFT_ALIGNMENT
            })
        }

        val hash = JPanel(BorderLayout()).apply {
            isOpaque = false
            add(JBLabel(commit.hash).apply {
                font = VestigeUI.MonoFont
                foreground = VestigeUI.TextSecondary
            }, BorderLayout.NORTH)
        }

        card.add(text, BorderLayout.CENTER)
        card.add(hash, BorderLayout.EAST)
        return card
    }

    private fun showMessage(title: String, detail: String) {
        body.removeAll()
        body.add(VestigeUI.emptyState(title, detail), BorderLayout.CENTER)
        body.revalidate()
        body.repaint()
    }
}
