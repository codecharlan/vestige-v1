package com.codecharlan.vestige.ui

import java.awt.BorderLayout
import javax.swing.JPanel

/**
 * Placeholder for commit playback, which is not implemented.
 *
 * The previous implementation ran a 20 fps Swing timer to animate random
 * expanding ripples and a sine-wave "playhead" over a hardcoded dark
 * rectangle, and labelled itself "Ambient visualization (decorative — not
 * actual commit playback)". It burned a repaint timer for the whole time the
 * tool window was open to draw something that carried no information and
 * admitted as much in its own caption.
 *
 * The animation and its timer are gone. The tab now says plainly what the
 * feature is and that it does not exist yet, which is the same information at
 * zero cost. The commit list in the Commits tab is the real thing to use.
 */
class VestigeEvolutionReplay : JPanel(BorderLayout()) {

    init {
        background = VestigeUI.Surface
        isOpaque = true
        add(
            VestigeUI.emptyState(
                "Commit playback is not available yet",
                "Stepping through a file's history frame by frame is planned. " +
                    "Use the Commits tab to see the list of changes."
            ),
            BorderLayout.CENTER
        )
    }
}
