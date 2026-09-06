package com.codecharlan.vestige.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorCustomElementRenderer
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.util.Disposer
import com.intellij.util.ui.JBUI
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.Rectangle
import java.awt.RenderingHints
import java.util.WeakHashMap

/**
 * Inline editor hints: the historical intent of a line, and who owns it.
 *
 * The rendering was the part that read as dated. Both inlays hardcoded a dark
 * "glass" palette — `Color(30, 41, 59, 180)` fill, a white 12% border, slate
 * `Color(148, 163, 184)` italic text — which on a light editor scheme drew a
 * dark navy slab across the code. Text also asked for `Font("Inter", …)`,
 * normally absent and silently substituted, and the widths were fixed pixel
 * values that did not scale on HiDPI.
 *
 * They now use the theme-aware tokens, the editor's own font, and scaled
 * widths. The inlay bookkeeping is unchanged.
 */
class VestigeGhostOverlay(private val editor: Editor) {

    companion object {
        // One tracked inlay per editor and HUD type. Accessed on the EDT only.
        // WeakHashMap so disposed editors do not pin entries forever.
        private val intentInlays = WeakHashMap<Editor, Inlay<*>>()
        private val presenceInlays = WeakHashMap<Editor, Inlay<*>>()

        private fun replaceInlay(map: WeakHashMap<Editor, Inlay<*>>, editor: Editor, newInlay: Inlay<*>?) {
            map.remove(editor)?.let { previous ->
                if (previous.isValid) Disposer.dispose(previous)
            }
            if (newInlay != null) {
                map[editor] = newInlay
            }
        }
    }

    fun showIntentHUD(line: Int, message: String) {
        ApplicationManager.getApplication().invokeLater {
            if (editor.isDisposed) return@invokeLater
            if (line < 0 || line >= editor.document.lineCount) return@invokeLater
            val offset = editor.document.getLineEndOffset(line)

            val inlay = editor.inlayModel.addAfterLineEndElement(offset, true, object : EditorCustomElementRenderer {
                private val width get() = JBUI.scale(400)
                private val inset get() = JBUI.scale(10)

                override fun calcWidthInPixels(inlay: Inlay<*>): Int = width

                override fun paint(inlay: Inlay<*>, g: Graphics, targetRegion: Rectangle, textAttributes: TextAttributes) {
                    val g2 = g.create() as Graphics2D
                    try {
                        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)

                        val boxWidth = width - inset * 2
                        val radius = JBUI.scale(6)

                        // A single hairline-bordered chip that sits inside the
                        // editor's own colours instead of over-painting them.
                        g2.color = VestigeUI.SurfaceSunken
                        g2.fillRoundRect(targetRegion.x + inset, targetRegion.y, boxWidth, targetRegion.height, radius, radius)
                        g2.color = VestigeUI.BorderSubtle
                        g2.drawRoundRect(targetRegion.x + inset, targetRegion.y, boxWidth, targetRegion.height, radius, radius)

                        g2.color = VestigeUI.TextSecondary
                        g2.font = editor.colorsScheme.getFont(com.intellij.openapi.editor.colors.EditorFontType.ITALIC)
                        // Kept as a word rather than the previous 👻 emoji: the
                        // hint has to say what it is, and one glyph did not.
                        g2.drawString(
                            "Intent: $message",
                            targetRegion.x + inset * 2,
                            targetRegion.y + targetRegion.height - JBUI.scale(5)
                        )
                    } finally {
                        g2.dispose()
                    }
                }
            })
            replaceInlay(intentInlays, editor, inlay)
        }
    }

    fun showPresenceHUD(line: Int, author: String, ownership: Int) {
        ApplicationManager.getApplication().invokeLater {
            if (editor.isDisposed) return@invokeLater
            if (line < 0 || line >= editor.document.lineCount) return@invokeLater
            val offset = editor.document.getLineStartOffset(line)

            val inlay = editor.inlayModel.addInlineElement(offset, true, object : EditorCustomElementRenderer {
                override fun calcWidthInPixels(inlay: Inlay<*>): Int = JBUI.scale(120)

                override fun paint(inlay: Inlay<*>, g: Graphics, targetRegion: Rectangle, textAttributes: TextAttributes) {
                    val g2 = g.create() as Graphics2D
                    try {
                        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)

                        // Dot tone carries the meaning: a majority owner reads
                        // green, a minor contributor blue.
                        val tone = if (ownership > 50) VestigeUI.Green else VestigeUI.Blue
                        val dot = JBUI.scale(8)
                        g2.color = tone
                        g2.fillOval(
                            targetRegion.x,
                            targetRegion.y + (targetRegion.height - dot) / 2,
                            dot, dot
                        )

                        g2.color = VestigeUI.TextMuted
                        g2.font = editor.colorsScheme.getFont(com.intellij.openapi.editor.colors.EditorFontType.PLAIN)
                        g2.drawString(
                            author.take(10),
                            targetRegion.x + dot + JBUI.scale(6),
                            targetRegion.y + targetRegion.height - JBUI.scale(4)
                        )
                    } finally {
                        g2.dispose()
                    }
                }
            })
            replaceInlay(presenceInlays, editor, inlay)
        }
    }
}
