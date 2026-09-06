package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.*
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.ui.Messages

class ChatWithGhostAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val input = Messages.showInputDialog(project, "Message the Ghost of the Codebase:", "Ghost Chat", null)
        if (!input.isNullOrEmpty()) {
            Messages.showInfoMessage(project, "The Ghost whispers: \"I remember when this line was first drafted... It was a simpler time.\"", "Ghost Response")
        }
    }
}

class ToggleEchoAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        project.getService(VestigeEchoChamber::class.java).toggle()
    }
}

class WormholeAction : AnAction() {
    /**
     * The history read is a git operation and runs in a [Task.Backgroundable];
     * the picker opens from `onSuccess`. Calling `getFileHistory` inline froze
     * the EDT for the length of the walk.
     */
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)

        object : Task.Backgroundable(project, "Reading history of ${file.name}", true) {
            private var commits: List<VestigeGitAnalyzer.CommitInfo> = emptyList()

            override fun run(indicator: ProgressIndicator) {
                commits = analyzer.getFileHistory(file)
            }

            override fun onSuccess() {
                if (project.isDisposed || editor.isDisposed) return
                if (commits.isEmpty()) {
                    Messages.showWarningDialog(project, "No history found for this file.", "Temporal Wormhole")
                    return
                }

                val picker = VestigeCommitPicker(project, file, commits)
                if (picker.showAndGet()) {
                    val hash = picker.getSelectedHash()
                    if (!hash.isNullOrEmpty()) {
                        val service = project.getService(VestigeWormholeService::class.java)
                        service.openPortal(editor, file, hash)
                    }
                }
            }
        }.queue()
    }
}

class ShowPetDetailsAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val service = project.getService(VestigeCipherPet::class.java)
        Messages.showInfoMessage(project, "Cipher says: \"${service.getRandomMessage()}\"", "Cipher Pet")
    }
}

class ShareLoreAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val props = com.intellij.ide.util.PropertiesComponent.getInstance()
        val webhook = props.getValue("vestige.collabWebhookUrl", "")
        
        if (webhook.isEmpty()) {
            Messages.showWarningDialog(project, "Collaboration Webhook not configured in Settings.", "Vestige")
            return
        }

        val bridge = project.getService(VestigeLoreBridge::class.java)
        bridge.shareLore("Manual Export", mapOf("title" to "Explored file history", "problem" to "Sharing context with team"), webhook)
    }
}
