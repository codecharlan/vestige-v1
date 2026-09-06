package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeHandoffAssistant
import com.codecharlan.vestige.logic.VestigeMentorshipMatcher
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.ui.Messages

/**
 * Actions for the two knowledge-risk services.
 *
 * These services were fully implemented but had no caller anywhere in the
 * plugin — only tests reached them. The VS Code half of the product exposes the
 * same two capabilities as commands, so these match it rather than leaving
 * working analysis unreachable.
 *
 * Both run their git work inside a `Task.Backgroundable`: `identifyRisks()`
 * scans repository history and must never run on the EDT.
 */
class ShowHandoffRisksAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return

        ProgressManager.getInstance().run(
            object : Task.Backgroundable(project, "Analysing knowledge handoff risk", true) {
                private var risks: List<VestigeHandoffAssistant.OrphanageRisk> = emptyList()

                override fun run(indicator: ProgressIndicator) {
                    indicator.isIndeterminate = true
                    risks = project.getService(VestigeHandoffAssistant::class.java).identifyRisks()
                }

                override fun onSuccess() {
                    if (project.isDisposed) return
                    if (risks.isEmpty()) {
                        // The normal result on a healthy repository — say so
                        // plainly rather than implying something went wrong.
                        Messages.showInfoMessage(
                            project,
                            "No files stood out as a knowledge-handoff risk.\n\n" +
                                "This check looks for files that many different people have " +
                                "recently touched, which tends to mean no one owns them.",
                            "Knowledge Handoff Risk"
                        )
                        return
                    }

                    val body = risks.take(15).joinToString("\n") { r ->
                        "• ${r.file} — ${r.status}, risk ${r.riskScore}/100" +
                            if (r.topAuthor.isNotBlank()) " (most history: ${r.topAuthor})" else ""
                    }
                    Messages.showInfoMessage(
                        project,
                        "Files where knowledge looks thinly spread:\n\n$body\n\n" +
                            "Ranked relative to each other in this repository.",
                        "Knowledge Handoff Risk"
                    )
                }
            }
        )
    }
}

class FindExpertsAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: run {
            Messages.showInfoMessage(project, "Open a file first.", "Find Experts")
            return
        }

        ProgressManager.getInstance().run(
            object : Task.Backgroundable(project, "Finding who knows ${file.name}", true) {
                private var experts: List<VestigeMentorshipMatcher.Match> = emptyList()

                override fun run(indicator: ProgressIndicator) {
                    indicator.isIndeterminate = true
                    experts = project.getService(VestigeMentorshipMatcher::class.java)
                        .findExpertsForFile(file)
                }

                override fun onSuccess() {
                    if (project.isDisposed) return
                    if (experts.isEmpty()) {
                        Messages.showInfoMessage(
                            project,
                            "No ownership history found for ${file.name}. " +
                                "It may be new, untracked, or committed only once.",
                            "Find Experts"
                        )
                        return
                    }

                    val body = experts.joinToString("\n") { m -> "• ${m.expert} — ${m.reason}" }
                    Messages.showInfoMessage(
                        project,
                        "Who to ask about ${file.name}:\n\n$body",
                        "Find Experts"
                    )
                }
            }
        )
    }
}
