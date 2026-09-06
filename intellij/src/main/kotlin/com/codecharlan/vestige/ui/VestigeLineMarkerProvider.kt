package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.codeInsight.daemon.LineMarkerProvider
import com.intellij.icons.AllIcons
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiNameIdentifierOwner
import com.intellij.psi.util.PsiTreeUtil

/**
 * Gutter icons summarising Vestige's view of the current file.
 *
 * [getLineMarkerInfo] is called on a daemon thread for *every* PSI element of
 * every highlighting pass — thousands of calls per keystroke-triggered pass. It
 * must be pure and allocation-light: cached lookups only, no git, no file I/O,
 * no editor or document mutation, and no work scheduling.
 */
class VestigeLineMarkerProvider : LineMarkerProvider {

    override fun collectSlowLineMarkers(elements: List<PsiElement>, result: MutableCollection<in LineMarkerInfo<*>>) {
        // Intentionally empty: this provider only produces per-element markers.
    }

    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? {
        // Cheapest discriminators first, so the vast majority of elements are
        // rejected before anything is resolved or looked up.
        if (element !is PsiNameIdentifierOwner) return null
        val nameIdentifier = element.nameIdentifier ?: return null

        val project = element.project
        if (project.isDisposed) return null

        val file = element.containingFile?.virtualFile ?: return null

        // Cache-only. The old version called `service.analyzeFile(file)`, which
        // consults the cache TTL and schedules a background analysis on a miss —
        // from a per-element hot path, so every highlighting pass over an
        // uncached file queued redundant analyses. If there is nothing cached,
        // render no marker; the pass that follows the analysis will draw it.
        val service = project.getService(VestigeService::class.java) ?: return null
        val result = service.getCachedAnalysis(file) ?: return null

        val stats = result.stats
        val realTime = result.realTimeStats

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

        // Anchor on the leaf element of the name identifier, as required by the platform.
        val anchor = PsiTreeUtil.getDeepestFirst(nameIdentifier)

        return LineMarkerInfo(
            anchor,
            anchor.textRange,
            icon,
            { tooltip },
            null,
            GutterIconRenderer.Alignment.LEFT,
            { "Vestige Analysis" }
        )
    }
}
