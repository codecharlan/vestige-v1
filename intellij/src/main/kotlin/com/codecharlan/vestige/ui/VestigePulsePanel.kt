package com.codecharlan.vestige.ui

import java.awt.*
import java.awt.geom.Path2D
import javax.swing.JPanel
import kotlin.random.Random

class VestigePulsePanel : JPanel() {
    init {
        isOpaque = false
        preferredSize = Dimension(300, 200)
    }

    override fun paintComponent(g: Graphics) {
        val g2 = g as Graphics2D
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)

        val w = width.toDouble()
        val h = height.toDouble()

        // Draw Heatmap (Simulated for parity)
        val path = Path2D.Double()
        path.moveTo(0.0, h)
        
        val segments = 20
        val rnd = Random(42)
        for (i in 1..segments) {
            val x = (i * w) / segments
            val y = h - (rnd.nextDouble() * h * 0.8)
            path.lineTo(x, y)
        }
        path.lineTo(w, h)
        path.closePath()

        // Gradient for the heatmap
        val gradient = LinearGradientPaint(
            0f, 0f, 0f, h.toFloat(),
            floatArrayOf(0f, 1f),
            arrayOf(VestigeUI.Purple, Color(0, 0, 0, 0))
        )
        g2.paint = gradient
        g2.fill(path)

        // Draw "Ghost Trails" (Simulated points)
        g2.color = VestigeUI.Pink
        for (i in 0..5) {
            val ex = rnd.nextDouble() * w
            val ey = rnd.nextDouble() * h
            g2.fillOval(ex.toInt(), ey.toInt(), 4, 4)
        }
        
        // Neon Glow effect (simplified)
        g2.stroke = BasicStroke(2f)
        g2.color = VestigeUI.Blue
        g2.draw(path)
    }
}
