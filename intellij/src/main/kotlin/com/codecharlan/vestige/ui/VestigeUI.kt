package com.codecharlan.vestige.ui

import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.colors.EditorFontType
import com.intellij.ui.JBColor
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import java.awt.*
import java.awt.geom.RoundRectangle2D
import javax.swing.*
import javax.swing.border.Border
import javax.swing.plaf.LayerUI

/**
 * Vestige design system.
 *
 * Three rules this file exists to enforce:
 *
 *  1. **Theme-aware.** Every colour is a [JBColor] with a light and a dark
 *     value. The previous version hardcoded a dark slate palette, so on the
 *     default light IDE theme the panels rendered as dark rectangles with
 *     low-contrast text — the main reason the UI read as "off".
 *  2. **The IDE's own type.** Fonts are derived from the user's IDE and editor
 *     fonts. The previous version asked for `Font("Inter", …)`; when Inter
 *     isn't installed (it usually isn't) Java silently substitutes a default,
 *     which is what made the text look dated and inconsistent.
 *  3. **Cheap to paint.** No per-pixel work in `paintComponent`.
 *
 * Scaling: all sizes go through [JBUI.scale] so the UI is correct on HiDPI.
 */
object VestigeUI {

    // ── Accent & status ─────────────────────────────────────────────────────
    // Darker in light themes (contrast on white), brighter in dark themes.

    val Green: JBColor = JBColor(Color(0x0E9F6E), Color(0x34D399))
    val Amber: JBColor = JBColor(Color(0xB45309), Color(0xFBBF24))
    val Red: JBColor = JBColor(Color(0xDC2626), Color(0xF87171))
    val Purple: JBColor = JBColor(Color(0x7C3AED), Color(0xA78BFA))
    val Blue: JBColor = JBColor(Color(0x2563EB), Color(0x60A5FA))
    val Pink: JBColor = JBColor(Color(0xDB2777), Color(0xF472B6))

    // ── Surfaces ────────────────────────────────────────────────────────────
    // Named after their role, and tied to the IDE's own panel colours so the
    // plugin sits inside the theme instead of fighting it.

    /** Base panel background. */
    val Surface: JBColor = JBColor(Color(0xF7F8FA), Color(0x1E1F22))

    /** Raised card/section background. */
    val SurfaceRaised: JBColor = JBColor(Color(0xFFFFFF), Color(0x2B2D30))

    /** Subtle inset (code blocks, wells). */
    val SurfaceSunken: JBColor = JBColor(Color(0xEEF0F4), Color(0x18191B))

    val BorderSubtle: JBColor = JBColor(Color(0xE1E4E8), Color(0x393B40))
    val BorderStrong: JBColor = JBColor(Color(0xC9CDD3), Color(0x4E5157))

    // ── Text ────────────────────────────────────────────────────────────────

    val TextPrimary: JBColor = JBColor(Color(0x1F2328), Color(0xDFE1E5))
    val TextSecondary: JBColor = JBColor(Color(0x57606A), Color(0xA9ADB4))
    val TextMuted: JBColor = JBColor(Color(0x8C959F), Color(0x7A7E85))

    // ── Backwards-compatible aliases ────────────────────────────────────────
    // Existing panels reference these names; they now resolve to theme-aware
    // values, so those panels improve without being rewritten.

    val DeepSlate: JBColor get() = Surface
    val HologramBlue: JBColor get() = SurfaceRaised
    val GlassTint: JBColor get() = JBColor(Color(0, 0, 0, 8), Color(255, 255, 255, 10))

    // ── Spacing scale ───────────────────────────────────────────────────────

    val SpaceXs: Int get() = JBUI.scale(4)
    val SpaceSm: Int get() = JBUI.scale(8)
    val SpaceMd: Int get() = JBUI.scale(12)
    val SpaceLg: Int get() = JBUI.scale(16)
    val SpaceXl: Int get() = JBUI.scale(24)
    val Radius: Int get() = JBUI.scale(10)

    // ── Typography ──────────────────────────────────────────────────────────
    // Lazily resolved: the editor colour scheme isn't available during class
    // initialisation in some contexts (tests, early startup).

    /** The IDE's UI font — matches every other panel in the IDE. */
    val InterFont: Font
        get() = UIUtil.getLabelFont() ?: JBUI.Fonts.label()

    /** The user's actual editor font, so code excerpts look like their editor. */
    val MonoFont: Font
        get() = try {
            EditorColorsManager.getInstance().globalScheme.getFont(EditorFontType.PLAIN)
        } catch (e: Exception) {
            Font(Font.MONOSPACED, Font.PLAIN, JBUI.scaleFontSize(12f))
        }

    fun titleFont(): Font = InterFont.deriveFont(Font.BOLD, JBUI.scaleFontSize(15f).toFloat())
    fun headingFont(): Font = InterFont.deriveFont(Font.BOLD, JBUI.scaleFontSize(13f).toFloat())
    fun bodyFont(): Font = InterFont.deriveFont(JBUI.scaleFontSize(12f).toFloat())
    fun captionFont(): Font = InterFont.deriveFont(JBUI.scaleFontSize(11f).toFloat())
    fun metricFont(): Font = InterFont.deriveFont(Font.BOLD, JBUI.scaleFontSize(22f).toFloat())

    // ── Components ──────────────────────────────────────────────────────────

    /**
     * A flat card: rounded, single hairline border, no fake shadow.
     * Replaces the previous "neumorphic" double-stroke border, which read as
     * blurry at any scale factor.
     */
    class CardBorder(
        private val radius: Int = JBUI.scale(10),
        private val accent: Color? = null
    ) : Border {
        override fun paintBorder(c: Component, g: Graphics, x: Int, y: Int, width: Int, height: Int) {
            val g2 = g.create() as Graphics2D
            try {
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                g2.color = BorderSubtle
                g2.stroke = BasicStroke(1f)
                g2.draw(RoundRectangle2D.Float(
                    x + 0.5f, y + 0.5f,
                    (width - 1).toFloat(), (height - 1).toFloat(),
                    radius.toFloat(), radius.toFloat()
                ))
                // Optional 3px accent rail on the leading edge.
                accent?.let {
                    g2.color = it
                    g2.fillRoundRect(x, y + radius / 2, JBUI.scale(3), height - radius, 2, 2)
                }
            } finally {
                g2.dispose()
            }
        }

        override fun getBorderInsets(c: Component): Insets =
            JBUI.insets(SpaceMd, if (accent != null) SpaceLg else SpaceMd, SpaceMd, SpaceMd)

        override fun isBorderOpaque(): Boolean = false
    }

    /** Kept for source compatibility; now renders the flat card border. */
    class EliteNeumorphicBorder(radius: Int = 24) : Border {
        private val delegate = CardBorder(JBUI.scale(radius.coerceAtMost(14)))
        override fun paintBorder(c: Component, g: Graphics, x: Int, y: Int, w: Int, h: Int) =
            delegate.paintBorder(c, g, x, y, w, h)
        override fun getBorderInsets(c: Component): Insets = delegate.getBorderInsets(c)
        override fun isBorderOpaque(): Boolean = false
    }

    /** Rounded, opaque panel used as the base for cards and tiles. */
    open class Card(accent: Color? = null) : JPanel() {
        init {
            isOpaque = false
            background = SurfaceRaised
            border = CardBorder(Radius, accent)
        }

        override fun paintComponent(g: Graphics) {
            val g2 = g.create() as Graphics2D
            try {
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                g2.color = background
                g2.fill(RoundRectangle2D.Float(
                    0f, 0f, width.toFloat(), height.toFloat(),
                    Radius.toFloat(), Radius.toFloat()
                ))
            } finally {
                g2.dispose()
            }
            super.paintComponent(g)
        }
    }

    /** Small status pill: coloured text on a tinted, rounded background. */
    class Pill(text: String, private val tone: Color) : JLabel(text) {
        init {
            font = captionFont()
            foreground = tone
            border = JBUI.Borders.empty(2, 8)
            isOpaque = false
        }

        override fun paintComponent(g: Graphics) {
            val g2 = g.create() as Graphics2D
            try {
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                g2.color = Color(tone.red, tone.green, tone.blue, 28)
                g2.fillRoundRect(0, 0, width, height, height, height)
            } finally {
                g2.dispose()
            }
            super.paintComponent(g)
        }
    }

    /**
     * A labelled metric tile: big value, small caption. The building block for
     * dashboards — consistent everywhere instead of ad-hoc per panel.
     */
    fun metricTile(value: String, caption: String, tone: Color = Purple): JPanel {
        val card = Card()
        card.layout = BoxLayout(card, BoxLayout.Y_AXIS)
        card.add(JLabel(value).apply {
            font = metricFont()
            foreground = tone
            alignmentX = Component.LEFT_ALIGNMENT
        })
        card.add(Box.createVerticalStrut(SpaceXs))
        card.add(JLabel(caption.uppercase()).apply {
            font = captionFont()
            foreground = TextMuted
            alignmentX = Component.LEFT_ALIGNMENT
        })
        return card
    }

    /** Section heading with consistent treatment across every panel. */
    fun sectionHeader(text: String): JComponent = JLabel(text.uppercase()).apply {
        font = captionFont().deriveFont(Font.BOLD)
        foreground = TextMuted
        border = JBUI.Borders.empty(SpaceMd, 0, SpaceSm, 0)
    }

    /** Horizontal hairline separator. */
    fun divider(): JComponent = object : JComponent() {
        init {
            preferredSize = Dimension(1, 1)
            maximumSize = Dimension(Int.MAX_VALUE, 1)
        }
        override fun paintComponent(g: Graphics) {
            g.color = BorderSubtle
            g.fillRect(0, 0, width, 1)
        }
    }

    /** Empty state: title, explanation, optional action. Never a blank panel. */
    fun emptyState(title: String, detail: String, actionText: String? = null, action: (() -> Unit)? = null): JPanel {
        val wrapper = JPanel(GridBagLayout()).apply {
            background = Surface
            isOpaque = true
        }
        val content = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(JLabel(title).apply {
                font = headingFont()
                foreground = TextPrimary
                alignmentX = Component.CENTER_ALIGNMENT
            })
            add(Box.createVerticalStrut(SpaceXs))
            add(JLabel(detail).apply {
                font = bodyFont()
                foreground = TextSecondary
                alignmentX = Component.CENTER_ALIGNMENT
            })
            if (actionText != null && action != null) {
                add(Box.createVerticalStrut(SpaceMd))
                add(JButton(actionText).apply {
                    alignmentX = Component.CENTER_ALIGNMENT
                    addActionListener { action() }
                })
            }
        }
        wrapper.add(content)
        return wrapper
    }

    /** Determinate meter (0..1) — replaces ad-hoc bar drawing in the panels. */
    class Meter(private var value: Double, private val tone: Color) : JComponent() {
        init {
            preferredSize = Dimension(JBUI.scale(120), JBUI.scale(6))
            maximumSize = Dimension(Int.MAX_VALUE, JBUI.scale(6))
        }

        fun setValue(v: Double) {
            value = v.coerceIn(0.0, 1.0)
            repaint()
        }

        override fun paintComponent(g: Graphics) {
            val g2 = g.create() as Graphics2D
            try {
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                val h = height.toFloat()
                g2.color = SurfaceSunken
                g2.fillRoundRect(0, 0, width, height, height, height)
                g2.color = tone
                val filled = (width * value.coerceIn(0.0, 1.0)).toInt()
                if (filled > 0) g2.fillRoundRect(0, 0, filled, height, height, height)
            } finally {
                g2.dispose()
            }
        }
    }

    /**
     * Status indicator. Static by default — the previous implementation ran a
     * 20 fps repaint timer per instance purely for a pulsing glow.
     */
    class BioluminescentRenderer(private val baseColor: Color) : JComponent() {
        init {
            preferredSize = Dimension(JBUI.scale(12), JBUI.scale(12))
        }

        override fun paintComponent(g: Graphics) {
            val g2 = g.create() as Graphics2D
            try {
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                val d = minOf(width, height)
                // Soft halo, drawn once — no animation timer.
                g2.color = Color(baseColor.red, baseColor.green, baseColor.blue, 40)
                g2.fillOval(0, 0, d, d)
                g2.color = baseColor
                val core = (d * 0.5).toInt().coerceAtLeast(4)
                g2.fillOval((width - core) / 2, (height - core) / 2, core, core)
            } finally {
                g2.dispose()
            }
        }
    }

    /**
     * Kept for source compatibility. The old implementation generated random
     * per-pixel noise on every repaint (~10^5 `Math.random()` calls per paint),
     * which made scrolling and resizing visibly janky. It is now a no-op
     * pass-through.
     */
    class GlassLayerUI : LayerUI<JComponent>()

    fun wrapWithGlass(component: JComponent): JLayer<JComponent> = JLayer(component, GlassLayerUI())

    /** Tone for a 0..1 score: green good, amber middling, red poor. */
    fun toneForScore(score: Double): JBColor = when {
        score >= 0.75 -> Green
        score >= 0.5 -> Amber
        else -> Red
    }
}

// Extension function for Color with alpha
fun Color.withAlpha(alpha: Int): Color {
    return Color(this.red, this.green, this.blue, alpha.coerceIn(0, 255))
}
