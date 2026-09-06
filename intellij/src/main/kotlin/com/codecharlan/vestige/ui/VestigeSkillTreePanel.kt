package com.codecharlan.vestige.ui

import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.ScrollPaneConstants

/**
 * The Vestige feature list, and which features are available today.
 *
 * This used to be drawn as a hand-positioned "skill tree" graph: five circles
 * at fixed pixel coordinates joined by four hardcoded lines, labelled in
 * `Color.WHITE` (invisible on a light theme) and haloed with a white glow. The
 * graph carried no information the list doesn't — the edges were not derived
 * from anything — so it is now a plain, readable list of capabilities with an
 * honest status on each one.
 */
class VestigeSkillTreePanel : JPanel(BorderLayout()) {

    private data class Capability(
        val name: String,
        val detail: String,
        val available: Boolean
    )

    private val capabilities = listOf(
        Capability(
            "Blame and ownership",
            "Who last touched each line, and who owns most of the file.",
            available = true
        ),
        Capability(
            "Bus factor",
            "How many people hold the knowledge for a file.",
            available = true
        ),
        Capability(
            "Stale code detection",
            "Flags code that has not changed in a long time. Not implemented yet.",
            available = false
        ),
        Capability(
            "Checkout a past commit",
            "Jump the working tree to an earlier point in history. Not implemented yet.",
            available = false
        ),
        Capability(
            "Recorded decisions",
            "Searchable notes on why the code is the way it is. Not implemented yet.",
            available = false
        )
    )

    init {
        background = VestigeUI.Surface
        isOpaque = true

        val list = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            background = VestigeUI.Surface
            isOpaque = true
            border = JBUI.Borders.empty(VestigeUI.SpaceLg)
        }

        list.add(header())
        list.add(Box.createVerticalStrut(VestigeUI.SpaceSm))
        list.add(VestigeUI.sectionHeader("Capabilities").apply {
            alignmentX = Component.LEFT_ALIGNMENT
        })

        capabilities.forEach { capability ->
            list.add(row(capability))
            list.add(Box.createVerticalStrut(VestigeUI.SpaceSm))
        }

        val scroll = JBScrollPane(JPanel(BorderLayout()).apply {
            background = VestigeUI.Surface
            isOpaque = true
            add(list, BorderLayout.NORTH)
        }).apply {
            border = JBUI.Borders.empty()
            horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
            viewport.background = VestigeUI.Surface
        }

        add(scroll, BorderLayout.CENTER)
    }

    private fun header(): JComponent = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        isOpaque = false
        alignmentX = Component.LEFT_ALIGNMENT
        add(JBLabel("What Vestige can do").apply {
            font = VestigeUI.titleFont()
            foreground = VestigeUI.TextPrimary
            alignmentX = Component.LEFT_ALIGNMENT
        })
        add(Box.createVerticalStrut(VestigeUI.SpaceXs))
        add(JBLabel("Features marked unavailable are planned but not built.").apply {
            font = VestigeUI.captionFont()
            foreground = VestigeUI.TextMuted
            alignmentX = Component.LEFT_ALIGNMENT
        })
    }

    private fun row(capability: Capability): JComponent {
        val tone = if (capability.available) VestigeUI.Green else VestigeUI.TextMuted
        val card = VestigeUI.Card(tone)
        card.alignmentX = Component.LEFT_ALIGNMENT
        card.layout = BorderLayout(VestigeUI.SpaceMd, 0)

        val text = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            add(JBLabel(capability.name).apply {
                font = VestigeUI.headingFont()
                foreground = VestigeUI.TextPrimary
                alignmentX = Component.LEFT_ALIGNMENT
            })
            add(Box.createVerticalStrut(VestigeUI.SpaceXs))
            add(JBLabel(capability.detail).apply {
                font = VestigeUI.captionFont()
                foreground = VestigeUI.TextSecondary
                alignmentX = Component.LEFT_ALIGNMENT
            })
        }

        val status = JPanel(BorderLayout()).apply {
            isOpaque = false
            add(
                VestigeUI.Pill(if (capability.available) "Available" else "Planned", tone),
                BorderLayout.NORTH
            )
        }

        card.add(text, BorderLayout.CENTER)
        card.add(status, BorderLayout.EAST)
        return card
    }
}
