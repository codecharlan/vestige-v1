package com.codecharlan.vestige.ui

import com.intellij.openapi.project.Project
import java.awt.BorderLayout
import javax.swing.JPanel

/**
 * Two unbuilt features. Both were previously a single 16pt label reading
 * "⚡ Performance Evolution Timeline (Simulation)" / "🌊 Evolutionary Flow
 * Waves (Simulation)" pinned to the top of an otherwise blank panel, with a
 * comment noting the real implementation was missing.
 *
 * Neither is currently added to the tool window; they are kept so the wiring
 * stays available, but they now state plainly what they would show.
 */
class PerformancePanel(private val project: Project) : JPanel(BorderLayout()) {
    init {
        background = VestigeUI.Surface
        isOpaque = true
        add(
            VestigeUI.emptyState(
                "Performance history is not available",
                "Tracking how a file's runtime cost changes over time needs benchmark data Vestige does not collect."
            ),
            BorderLayout.CENTER
        )
    }
}

class FlowPanel(private val project: Project) : JPanel(BorderLayout()) {
    init {
        background = VestigeUI.Surface
        isOpaque = true
        add(
            VestigeUI.emptyState(
                "Change-flow view is not available",
                "Showing how changes propagate between files needs cross-file coupling analysis that is not implemented yet."
            ),
            BorderLayout.CENTER
        )
    }
}
