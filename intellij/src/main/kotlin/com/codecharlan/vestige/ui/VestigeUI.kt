package com.codecharlan.vestige.ui

import com.intellij.ui.JBColor
import com.intellij.util.ui.JBUI
import java.awt.*
import java.awt.geom.RoundRectangle2D
import javax.swing.*
import javax.swing.border.Border
import javax.swing.plaf.LayerUI

object VestigeUI {
    // Zenith Elite Design Tokens
    val Green = Color(0x10B981)
    val Amber = Color(0xF59E0B)
    val Red = Color(0xEF4444)
    val Purple = Color(0x8B5CF6)
    val Blue = Color(0x3B82F6)
    val Pink = Color(0xF472B6)
    
    val DeepSlate = Color(0x0F172A)
    val HologramBlue = Color(0x1E293B)
    val GlassTint = Color(255, 255, 255, 10)

    val InterFont = Font("Inter", Font.PLAIN, 13)
    val MonoFont = Font("JetBrains Mono", Font.PLAIN, 12)

    /**
     * Elite: Multi-Stop Neumorphic Border with Inner Glow
     */
    class EliteNeumorphicBorder(private val radius: Int = 24) : Border {
        override fun paintBorder(c: Component, g: Graphics, x: Int, y: Int, width: Int, height: Int) {
            val g2 = g as Graphics2D
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            
            // Outer Depth Shadow
            g2.color = Color(0, 0, 0, 50)
            g2.drawRoundRect(x + 2, y + 2, width - 4, height - 4, radius, radius)
            
            // Inner Luminous Edge
            g2.color = Color(255, 255, 255, 25)
            g2.stroke = BasicStroke(1.5f)
            g2.drawRoundRect(x, y, width - 2, height - 2, radius, radius)
        }
        override fun getBorderInsets(c: Component): Insets = JBUI.insets(12)
        override fun isBorderOpaque(): Boolean = false
    }

    /**
     * Elite: Bioluminescent Status Renderer (Pulsing Glow)
     */
    class BioluminescentRenderer(private val baseColor: Color) : JComponent() {
        private var pulse = 0f
        private val timer = Timer(50) {
            pulse = (pulse + 0.1f) % (2 * Math.PI.toFloat())
            repaint()
        }

        init { timer.start() }

        override fun paintComponent(g: Graphics) {
            val g2 = g as Graphics2D
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            
            val intensity = (Math.sin(pulse.toDouble()).toFloat() + 1) / 2
            val size = Math.min(width, height) - 4
            
            // Glow layer
            val radialGradient = RadialGradientPaint(
                (width / 2).toFloat(), (height / 2).toFloat(), (size / 2).toFloat(),
                floatArrayOf(0f, 1f),
                arrayOf(Color(baseColor.red, baseColor.green, baseColor.blue, (100 * intensity).toInt()), Color(baseColor.red, baseColor.green, baseColor.blue, 0))
            )
            g2.paint = radialGradient
            g2.fillOval(2, 2, size, size)
            
            // Core
            g2.color = baseColor
            g2.fillOval(width / 2 - 4, height / 2 - 4, 8, 8)
        }
    }

    class GlassLayerUI : LayerUI<JComponent>() {
        override fun paint(g: Graphics, c: JComponent) {
            val g2 = g.create() as Graphics2D
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            
            // Noise Texture Simulation (Subtle grain)
            g2.color = Color(255, 255, 255, 5)
            for (i in 0 until c.width step 2) {
                for (j in 0 until c.height step 2) {
                    if (Math.random() > 0.8) g2.fillRect(i, j, 1, 1)
                }
            }
            
            super.paint(g2, c)
            g2.dispose()
        }
    }

    fun wrapWithGlass(component: JComponent): JLayer<JComponent> {
        return JLayer(component, GlassLayerUI())
    }
}
