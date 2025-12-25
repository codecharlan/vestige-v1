package com.codecharlan.vestige.ui

import com.intellij.ui.JBColor
import java.awt.*
import java.awt.geom.Line2D
import javax.swing.JPanel

class VestigeSkillTreePanel : JPanel() {
    private val nodes = listOf(
        SkillNode("Basic Blame", 50, 50, true),
        SkillNode("Bus Factor", 150, 50, true),
        SkillNode("Zombie Detection", 150, 150, false),
        SkillNode("Time Travel", 250, 100, false),
        SkillNode("Lore Mastery", 350, 100, false)
    )

    data class SkillNode(val name: String, val x: Int, val y: Int, val unlocked: Boolean)

    init {
        isOpaque = false
        preferredSize = Dimension(500, 300)
    }

    override fun paintComponent(g: Graphics) {
        val g2 = g as Graphics2D
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)

        // Draw connections
        g2.color = Color(96, 165, 250, 100)
        g2.stroke = BasicStroke(2f)
        g2.draw(Line2D.Float(50f, 50f, 150f, 50f))
        g2.draw(Line2D.Float(150f, 50f, 150f, 150f))
        g2.draw(Line2D.Float(150f, 50f, 250f, 100f))
        g2.draw(Line2D.Float(250f, 100f, 350f, 100f))

        // Draw Nodes
        nodes.forEach { node ->
            val color = if (node.unlocked) VestigeUI.Green else Color(100, 116, 139)
            g2.color = color
            g2.fillOval(node.x - 20, node.y - 20, 40, 40)
            
            g2.color = Color.WHITE
            g2.font = VestigeUI.InterFont.deriveFont(10f)
            val fm = g2.fontMetrics
            g2.drawString(node.name, node.x - fm.stringWidth(node.name) / 2, node.y + 35)

            if (node.unlocked) {
                g2.color = Color(255, 255, 255, 100)
                g2.drawOval(node.x - 25, node.y - 25, 50, 50)
            }
        }
    }
}
