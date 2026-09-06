package com.codecharlan.vestige.ui

import java.awt.BorderLayout
import javax.swing.JPanel

/**
 * Placeholder for the edit-activity heatmap, which is not implemented.
 *
 * The previous implementation drew a gradient-filled area chart from
 * `Random(42)` — twenty fabricated data points, seeded so they looked stable
 * across repaints, with six more random dots labelled "ghost trails" and a
 * neon stroke on top. It was a chart of nothing that a reader would reasonably
 * take for real activity data, which is worse than showing no chart at all.
 *
 * It now says what the feature would be and that the data is not collected.
 */
class VestigePulsePanel : JPanel(BorderLayout()) {

    init {
        background = VestigeUI.Surface
        isOpaque = true
        add(
            VestigeUI.emptyState(
                "Edit activity is not tracked yet",
                "A heatmap of when this file is edited needs per-session history that Vestige does not record."
            ),
            BorderLayout.CENTER
        )
    }
}
