package com.codecharlan.vestige.ui

import com.intellij.ui.JBColor
import java.awt.*
import java.awt.geom.Ellipse2D
import javax.swing.JPanel
import javax.swing.Timer
import kotlin.math.sin

class VestigeEvolutionReplay : JPanel() {
    private var time = 0.0
    private val ripples = mutableListOf<Ripple>()

    data class Ripple(val x: Int, val y: Int, var radius: Float, var alpha: Float)

    init {
        isOpaque = false
        val timer = Timer(50) {
            time += 0.1
            updateRipples()
            repaint()
        }
        timer.start()
    }

    private fun updateRipples() {
        if (Math.random() > 0.95) {
            ripples.add(Ripple((Math.random() * width).toInt(), (Math.random() * height).toInt(), 0f, 1f))
        }
        val iterator = ripples.iterator()
        while (iterator.hasNext()) {
            val r = iterator.next()
            r.radius += 2f
            r.alpha -= 0.02f
            if (r.alpha <= 0) iterator.remove()
        }
    }

    override fun paintComponent(g: Graphics) {
        val g2 = g as Graphics2D
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)

        // Draw Timeline Base
        g2.color = Color(30, 41, 59, 100)
        g2.fillRect(0, 0, width, height)

        // Draw Ripples
        ripples.forEach { r ->
            g2.color = Color(96, 165, 250, (r.alpha * 255).toInt())
            g2.stroke = BasicStroke(2f)
            g2.draw(Ellipse2D.Float(r.x - r.radius, r.y - r.radius, r.radius * 2, r.radius * 2))
        }

        // Draw Current Playhead
        val x = (sin(time) * 0.4 + 0.5) * width
        g2.color = VestigeUI.Green
        g2.stroke = BasicStroke(3f)
        g2.drawLine(x.toInt(), 20, x.toInt(), height - 20)
        
        g2.font = VestigeUI.InterFont
        g2.drawString("Replaying Evolution: [Commit Hash]", 20, 30)
    }
}
