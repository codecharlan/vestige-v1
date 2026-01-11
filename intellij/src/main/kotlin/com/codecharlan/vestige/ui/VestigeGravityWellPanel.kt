package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.JBColor
import java.awt.*
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JPanel
import javax.swing.Timer
import kotlin.math.*

class VestigeGravityWellPanel(private val project: Project) : JPanel(), VestigeService.AnalysisListener, Disposable {
    private var angle = 0.0
    private var mouseX = 0
    private var mouseY = 0
    private var gravityLevel = 1.0
    private var complexityAlpha = 150

    init {
        isOpaque = false
        preferredSize = Dimension(300, 300)
        project.getService(VestigeService::class.java).addListener(this)
        Disposer.register(project, this)
        
        addMouseMotionListener(object : MouseAdapter() {
            override fun mouseMoved(e: MouseEvent) {
                mouseX = e.x
                mouseY = e.y
                repaint()
            }
        })

        val timer = Timer(30) {
            if (isShowing) {
                angle += 0.05
                repaint()
            }
        }
        timer.start()
    }

    override fun onAnalysisUpdated(file: VirtualFile, result: VestigeService.AnalysisResult) {
        gravityLevel = 1.0 + (result.stats?.commits ?: 0) / 10.0
        complexityAlpha = min(255, 150 + (result.realTimeStats?.complexity ?: 0))
        repaint()
    }

    override fun dispose() {
        project.getService(VestigeService::class.java).removeListener(this)
    }

    override fun paintComponent(g: Graphics) {
        val g2 = g as Graphics2D
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)

        val cx = width / 2
        val cy = height / 2
        
        // Draw Radial Background Gird
        g2.color = Color(60, 165, 250, 40)
        for (i in 1..5) {
            val r = (i * 40 * gravityLevel).toInt()
            g2.drawOval(cx - r, cy - r, r * 2, r * 2)
        }

        // Draw Pulsating Gravity Well
        val pulse = (sin(angle) * 10 * gravityLevel).toInt()
        val wellR = (30 * gravityLevel).toInt() + pulse
        val grad = RadialGradientPaint(
            Point(cx, cy), max(1f, wellR.toFloat()), 
            floatArrayOf(0f, 1f), 
            arrayOf(Color(139, 92, 246, 200), Color(139, 92, 246, 0))
        )
        g2.paint = grad
        g2.fillOval(cx - wellR, cy - wellR, wellR * 2, wellR * 2)

        // Draw Orbiting Particles (Simulating 3D context)
        for (i in 0..8) {
            val orbitR = (80 + i * 15 * gravityLevel).toInt()
            val speed = (0.5 + i * 0.1) * gravityLevel
            val pAngle = angle * speed + (i * PI / 4)
            
            val x = (cx + orbitR * cos(pAngle)).toInt()
            val y = (cy + orbitR * sin(pAngle) * 0.4).toInt() // Elliptical for perspective
            
            val size = (4 + (sin(pAngle) * 2).toInt() * gravityLevel).toInt() // Pseudo-depth size
            val alpha = complexityAlpha + (sin(pAngle) * 100).toInt()
            
            g2.color = Color(96, 165, 250, max(0, min(255, alpha)))
            g2.fillOval(x - size / 2, y - size / 2, size, size)
            
            // Link to mouse for "Interaction"
            if (dist(x, y, mouseX, mouseY) < 50) {
                g2.stroke = BasicStroke(1f)
                g2.drawLine(x, y, mouseX, mouseY)
            }
        }
    }

    private fun dist(x1: Int, y1: Int, x2: Int, y2: Int): Double {
        return sqrt(((x2 - x1).toDouble().pow(2.0) + (y2 - y1).toDouble().pow(2.0)))
    }
}
