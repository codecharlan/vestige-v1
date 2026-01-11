package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import java.awt.*
import java.awt.geom.Line2D
import java.awt.geom.RoundRectangle2D
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.ReadAction
import com.intellij.util.concurrency.AppExecutorUtil
import javax.swing.JPanel
import javax.swing.border.EmptyBorder

/**
 * Visual Code Evolution Graph - Interactive timeline showing how code evolved
 */
class VestigeEvolutionGraphPanel(private val project: Project) : JPanel() {
    
    private val commits = mutableListOf<CommitNode>()
    private var selectedCommit: CommitNode? = null
    
    data class CommitNode(
        val hash: String,
        val date: Long,
        val author: String,
        val message: String,
        val x: Int = 0,
        val y: Int = 0
    )
    
    init {
        layout = BorderLayout()
        background = VestigeUI.DeepSlate
        isOpaque = true
        
        val header = JPanel(BorderLayout()).apply {
            background = VestigeUI.HologramBlue
            border = JBUI.Borders.empty(16, 16)
            add(JBLabel("📈 Code Evolution Timeline").apply {
                font = VestigeUI.InterFont.deriveFont(18f)
                foreground = VestigeUI.Purple
            }, BorderLayout.WEST)
        }
        
        val graphPanel = EvolutionGraphCanvas()
        val scrollPane = JBScrollPane(graphPanel)
        scrollPane.border = JBUI.Borders.empty()
        
        add(header, BorderLayout.NORTH)
        add(scrollPane, BorderLayout.CENTER)
        
        loadEvolutionData()
    }
    
    private fun loadEvolutionData() {
        val fileEditorManager = FileEditorManager.getInstance(project)
        val currentFile = fileEditorManager.selectedFiles.firstOrNull() ?: return
        
        ReadAction.nonBlocking<List<CommitNode>> {
            val gitAnalyzer = project.getService(VestigeGitAnalyzer::class.java)
            val history = gitAnalyzer.getFileHistory(currentFile, 50)
            
            history.map { commit ->
                CommitNode(
                    hash = commit.hash.take(7),
                    date = commit.date.time,
                    author = commit.author,
                    message = commit.message.take(50)
                )
            }
        }
        .inSmartMode(project)
        .finishOnUiThread(ModalityState.any()) { nodes ->
            commits.clear()
            commits.addAll(nodes)
            repaint()
        }
        .submit(AppExecutorUtil.getAppExecutorService())
    }
    
    private inner class EvolutionGraphCanvas : JPanel() {
        init {
            preferredSize = Dimension(800, 600)
            background = VestigeUI.DeepSlate
            isOpaque = true
        }
        
        override fun paintComponent(g: Graphics) {
            super.paintComponent(g)
            val g2 = g.create() as Graphics2D
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            
            if (commits.isEmpty()) {
                g2.color = VestigeUI.Purple
                g2.font = VestigeUI.InterFont.deriveFont(14f)
                g2.drawString("Open a file to see its evolution timeline", width / 2 - 150, height / 2)
                return
            }
            
            val padding = 50
            val graphWidth = width - padding * 2
            val graphHeight = height - padding * 2
            val startX = padding
            val startY = padding
            
            // Draw timeline axis
            g2.color = VestigeUI.Purple.darker()
            g2.stroke = BasicStroke(2f)
            g2.drawLine(startX, startY + graphHeight, startX + graphWidth, startY + graphHeight)
            
            // Draw commit nodes
            val timeRange = if (commits.size > 1) {
                commits.maxOf { it.date } - commits.minOf { it.date }
            } else {
                1L
            }
            
            commits.forEachIndexed { index, commit ->
                val x = startX + (index * graphWidth / maxOf(1, commits.size - 1))
                val y = startY + graphHeight - 20
                
                // Draw connection line
                if (index > 0) {
                    val prevX = startX + ((index - 1) * graphWidth / maxOf(1, commits.size - 1))
                    g2.color = VestigeUI.Purple.withAlpha(100)
                    g2.stroke = BasicStroke(1.5f)
                    g2.drawLine(prevX, y, x, y)
                }
                
                // Draw commit node
                val nodeSize = 8
                g2.color = VestigeUI.Purple
                g2.fillOval(x - nodeSize / 2, y - nodeSize / 2, nodeSize, nodeSize)
                
                // Draw glow effect
                val glow = RoundRectangle2D.Float(
                    (x - nodeSize).toFloat(),
                    (y - nodeSize).toFloat(),
                    (nodeSize * 2).toFloat(),
                    (nodeSize * 2).toFloat(),
                    4f, 4f
                )
                g2.color = VestigeUI.Purple.withAlpha(50)
                g2.fill(glow)
                
                // Draw commit info on hover (simplified)
                if (selectedCommit?.hash == commit.hash) {
                    g2.color = VestigeUI.HologramBlue
                    val infoRect = RoundRectangle2D.Float(
                        (x + 15).toFloat(),
                        (y - 30).toFloat(),
                        200f,
                        50f,
                        8f, 8f
                    )
                    g2.fill(infoRect)
                    
                    g2.color = Color.WHITE
                    g2.font = VestigeUI.InterFont.deriveFont(11f)
                    g2.drawString(commit.message, x + 20, y - 10)
                    g2.font = VestigeUI.InterFont.deriveFont(9f)
                    g2.color = VestigeUI.Purple
                    g2.drawString("${commit.author} • ${commit.hash}", x + 20, y + 5)
                }
            }
            
            g2.dispose()
        }
    }
}

