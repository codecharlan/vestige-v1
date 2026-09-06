package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import java.util.concurrent.ConcurrentHashMap

@Service(Service.Level.PROJECT)
class SentientLoreGenerator(private val project: Project) {

    companion object {
        /** Commits inspected per save. */
        private const val HISTORY_DEPTH = 5

        /** Minimum gap between lore suggestions for the same file. */
        private const val NOTIFY_COOLDOWN_MS = 10 * 60 * 1000L

        // Compiled once instead of a keyword list scanned per commit.
        private val RE_ARCHITECTURAL = Regex(
            "(?i)\\b(refactor|architect|architecture|rewrite|replace|decision|migration)\\b"
        )
    }

    private val log = Logger.getInstance(SentientLoreGenerator::class.java)

    /** file path -> last time we suggested lore for it. */
    private val lastSuggested = ConcurrentHashMap<String, Long>()

    /**
     * Suggests capturing a Lore decision when recent commits look architectural.
     *
     * Called from the file listener's background read action on every save, so
     * it is cancellable and rate-limited — it previously fired a notification
     * on every save of any file whose recent history mentioned "refactor".
     */
    fun scanAndSuggest(file: VirtualFile) {
        ProgressManager.checkCanceled()

        val now = System.currentTimeMillis()
        lastSuggested[file.path]?.let { previous ->
            if (now - previous < NOTIFY_COOLDOWN_MS) return
        }

        val analyzer = project.getService(VestigeGitAnalyzer::class.java)
        val history = analyzer.getFileHistory(file, HISTORY_DEPTH)
        if (history.isEmpty()) return

        // Look for keywords in recent commits that suggest a major decision
        var significantCommit: VestigeGitAnalyzer.CommitInfo? = null
        for (commit in history) {
            ProgressManager.checkCanceled()
            if (RE_ARCHITECTURAL.containsMatchIn(commit.message)) {
                significantCommit = commit
                break
            }
        }

        if (significantCommit == null) return

        lastSuggested[file.path] = now
        // Keep the cooldown map from growing without bound.
        if (lastSuggested.size > 500) lastSuggested.clear()

        suggestLore(file, significantCommit)
    }

    private fun suggestLore(file: VirtualFile, commit: VestigeGitAnalyzer.CommitInfo) {
        val notifications = project.getService(VestigeSmartNotifications::class.java)
        notifications.showInfo(
            "Sentient Lore Suggestion",
            "I've detected a significant architectural shift in ${file.name}. Should I capture this as a Lore decision?"
        )

        // In a real implementation, we would offer an action to auto-generate the .lean file.
        log.debug("Sentient Lore: suggesting decision capture for ${commit.hash}")
    }
}
