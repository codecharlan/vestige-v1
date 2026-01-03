package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.codeInsight.daemon.LineMarkerProvider
import com.intellij.icons.AllIcons
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiNameIdentifierOwner

class VestigeLineMarkerProvider : LineMarkerProvider {
    override fun collectSlowLineMarkers(elements: List<PsiElement>, result: MutableCollection<in LineMarkerInfo<*>>) {
        // Here we would implement the logic to show the Ghost Overlay HUD
        // based on line interaction.
    }
    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? {
        // Only show for main identifiers (classes, functions) to avoid clutter
        if (element !is PsiNameIdentifierOwner) return null
        
        val file = element.containingFile.virtualFile ?: return null
        
        val project = element.project
        val service = project.getService(VestigeService::class.java)
        val result = service.analyzeFile(file) ?: return null
        val stats = result.stats
        val realTime = result.realTimeStats

        // Show Seance Presence HUD for top author
        val editor = com.intellij.openapi.fileEditor.FileEditorManager.getInstance(project).selectedTextEditor
        if (editor != null && stats != null && stats.ownershipPercent > 30) {
            val line = editor.document.getLineNumber(element.textOffset)
            VestigeGhostOverlay(editor).showPresenceHUD(line, stats.topAuthor, stats.ownershipPercent)
        }
        
        // Select icon based on available data
        val (icon, tooltip) = when {
            stats != null -> {
                when {
                    stats.commits > 20 -> AllIcons.General.BalloonError to 
                        "Vestige: High churn (${stats.commits} commits, ${stats.ageDays} days old)"
                    stats.ageDays > 365 -> AllIcons.Actions.ListFiles to 
                        "Vestige: Fossil code (${stats.ageDays} days old, ${stats.commits} commits)"
                    stats.commits > 10 -> AllIcons.General.InspectionsOK to 
                        "Vestige: Active file (${stats.commits} commits, ${stats.ageDays} days old)"
                    else -> AllIcons.General.Information to 
                        "Vestige: Recent file (${stats.commits} commits, ${stats.ageDays} days old)"
                }
            }
            realTime != null -> {
                when {
                    realTime.isNewFile -> AllIcons.General.Add to 
                        "Vestige: New file (${realTime.lineCount} lines, not in git)"
                    realTime.complexity > 30 -> AllIcons.General.Warning to 
                        "Vestige: Complex file (${realTime.lineCount} lines, complexity ${realTime.complexity})"
                    realTime.lineCount > 500 -> AllIcons.Actions.ListFiles to 
                        "Vestige: Large file (${realTime.lineCount} lines)"
                    else -> AllIcons.General.InspectionsOK to 
                        "Vestige: ${realTime.lineCount} lines, ${realTime.codeHealth}"
                }
            }
            else -> return null
        }

        return LineMarkerInfo(
            element,
            element.textRange,
            icon,
            { tooltip },
            null,
            GutterIconRenderer.Alignment.LEFT,
            { "Vestige Analysis" }
        )
    }
}
