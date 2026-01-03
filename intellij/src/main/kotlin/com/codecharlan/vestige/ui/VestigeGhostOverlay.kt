package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorCustomElementRenderer
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.InlayModel
import com.intellij.openapi.editor.markup.TextAttributes
import java.awt.*

class VestigeGhostOverlay(private val editor: Editor) {
    
    fun showIntentHUD(line: Int, message: String) {
        val model = editor.inlayModel
        val offset = editor.document.getLineEndOffset(line)
        
        model.addAfterLineEndElement(offset, true, object : EditorCustomElementRenderer {
            override fun calcWidthInPixels(inlay: Inlay<*>): Int = 400
            
            override fun paint(inlay: Inlay<*>, g: Graphics, targetRegion: Rectangle, textAttributes: TextAttributes) {
                val g2 = g.create() as java.awt.Graphics2D
                g2.setRenderingHint(java.awt.RenderingHints.KEY_ANTIALIASING, java.awt.RenderingHints.VALUE_ANTIALIAS_ON)
                
                // Glass effect
                g2.color = Color(30, 41, 59, 180)
                g2.fillRoundRect(targetRegion.x + 10, targetRegion.y, 380, targetRegion.height, 8, 8)
                
                // Border
                g2.color = Color(255, 255, 255, 30)
                g2.drawRoundRect(targetRegion.x + 10, targetRegion.y, 380, targetRegion.height, 8, 8)
                
                // Text
                g2.color = Color(148, 163, 184) // Slate 400
                g2.font = Font("Inter", Font.ITALIC, 11)
                g2.drawString("👻 Historical Intent: $message", targetRegion.x + 20, targetRegion.y + targetRegion.height - 5)
                
                g2.dispose()
            }
        })
    }

    fun showPresenceHUD(line: Int, author: String, ownership: Int) {
        val model = editor.inlayModel
        val offset = editor.document.getLineStartOffset(line)
        
        model.addInlineElement(offset, true, object : EditorCustomElementRenderer {
            override fun calcWidthInPixels(inlay: Inlay<*>): Int = 120
            
            override fun paint(inlay: Inlay<*>, g: Graphics, targetRegion: Rectangle, textAttributes: TextAttributes) {
                val g2 = g.create() as java.awt.Graphics2D
                g2.setRenderingHint(java.awt.RenderingHints.KEY_ANTIALIASING, java.awt.RenderingHints.VALUE_ANTIALIAS_ON)
                
                // Bioluminescent Halo
                val auraColor = if (ownership > 50) Color(16, 185, 129, 100) else Color(59, 130, 246, 60)
                g2.color = auraColor
                g2.fillOval(targetRegion.x, targetRegion.y + 2, 12, 12)
                
                // Author Tag
                g2.color = Color(255, 255, 255, 180)
                g2.font = Font("Inter", Font.BOLD, 10)
                g2.drawString(author.take(10), targetRegion.x + 18, targetRegion.y + targetRegion.height - 4)
                
                g2.dispose()
            }
        })
    }
}
