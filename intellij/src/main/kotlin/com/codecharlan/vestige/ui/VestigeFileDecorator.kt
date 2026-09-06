package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.intellij.ide.projectView.ProjectViewNode
import com.intellij.ide.projectView.ProjectViewNodeDecorator

/**
 * Project-view decoration for files Vestige has already analysed.
 *
 * [decorate] is called by the platform on the EDT, once per visible node, on
 * every project-view repaint. It must therefore be a pure cache read: no git,
 * no file I/O, no VFS child enumeration, and no work scheduling. If the data
 * is not already in the service cache the node is left undecorated and will
 * pick up its badge on a later repaint, once the background analysis that the
 * rest of the plugin drives has populated the cache.
 */
class VestigeFileDecorator : ProjectViewNodeDecorator {
    override fun decorate(node: ProjectViewNode<*>, data: com.intellij.ide.projectView.PresentationData) {
        val file = node.virtualFile ?: return
        val project = node.project ?: return
        if (project.isDisposed) return
        val service = project.getService(VestigeService::class.java) ?: return

        // Directories are not decorated.
        //
        // The previous version called `file.children` here and then looked up
        // every child in the cache. On the EDT, `children` on a directory that
        // the VFS has not yet loaded triggers a synchronous disk refresh, and it
        // ran for every visible directory node on every repaint. An aggregate
        // badge is not worth a disk touch during painting.
        if (file.isDirectory) return

        // Cache-only. `getCachedAnalysis` is a plain map lookup; `analyzeFile`
        // would schedule work, and `analyzeFileAsync` (which the old version
        // called on a cache miss) queued a task per visible node per repaint,
        // so scrolling the project view enqueued hundreds of analyses.
        val result = service.getCachedAnalysis(file) ?: return

        val stats = result.stats
        val realTime = result.realTimeStats

        val badges = mutableListOf<String>()
        if (stats != null) {
            when {
                stats.commits > 20 -> badges.add("🔥")
                stats.ageDays > 365 -> badges.add("🗿")
                stats.commits > 10 -> badges.add("⚡")
                else -> badges.add("✨")
            }
            result.busFactor?.let { busFactor ->
                if (busFactor.risk == "critical" || busFactor.risk == "high") badges.add("⚠️")
            }
        } else {
            realTime?.let {
                when {
                    it.isNewFile -> badges.add("✨")
                    it.complexity > 30 -> badges.add("⚙️")
                    else -> {} // no badge for an ordinary uncommitted file
                }
            }
        }

        if (badges.isEmpty()) return

        // Never re-add the plain file name: colored fragments would override the
        // platform's own rendering (including VCS file coloring) for every node.
        // Decorations are applied via locationString only.
        data.locationString = badges.joinToString(" ")
        data.tooltip = buildString {
            append("Vestige Intelligence\n")
            stats?.let { append("• Age: ${it.ageDays} days\n• Churn: ${it.commits} commits\n") }
            realTime?.let { append("• Health: ${it.codeHealth}\n") }
        }
    }
}
