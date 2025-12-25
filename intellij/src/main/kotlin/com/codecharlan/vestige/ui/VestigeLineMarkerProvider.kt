package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.codeInsight.daemon.LineMarkerProvider
import com.intellij.icons.AllIcons
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiNameIdentifierOwner

class VestigeLineMarkerProvider : LineMarkerProvider {
    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? {
        // Only show for main identifiers (classes, functions) to avoid clutter
        if (element !is PsiNameIdentifierOwner) return null
        
        val project = element.project
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)
        val file = element.containingFile.virtualFile ?: return null
        
        val stats = analyzer.getFileStats(file) ?: return null
        
        // Ported logic for icon selection
        val icon = when {
            stats.commits > 20 -> AllIcons.General.BalloonError // High Churn 🔥
            stats.ageDays > 365 -> AllIcons.Actions.ListFiles // Fossil 🗿
            else -> AllIcons.General.InspectionsOK // Stable / Recent ✨
        }

        return LineMarkerInfo(
            element,
            element.textRange,
            icon,
            { "Vestige: ${stats.commits} commits, last changed ${stats.ageDays} days ago" },
            null,
            GutterIconRenderer.Alignment.LEFT,
            { "Vestige Analysis" }
        )
    }
}
