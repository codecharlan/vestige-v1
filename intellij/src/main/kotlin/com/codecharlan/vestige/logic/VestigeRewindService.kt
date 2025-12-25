package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import git4idea.commands.Git
import git4idea.commands.GitCommand
import git4idea.commands.GitLineHandler
import git4idea.repo.GitRepositoryManager
import java.io.File

@Service(Service.Level.PROJECT)
class VestigeRewindService(private val project: Project) {
    private var isRewound = false
    private var originalBranch: String? = null

    fun startRewind(commitHash: String) {
        val repositories = GitRepositoryManager.getInstance(project).repositories
        if (repositories.isEmpty()) return
        val root = repositories[0].root
        
        val statusHandler = GitLineHandler(project, root, GitCommand.STATUS)
        val statusResult = Git.getInstance().runCommand(statusHandler)
        
        // Simplified checkout logic for parity
        val checkoutHandler = GitLineHandler(project, root, GitCommand.CHECKOUT)
        checkoutHandler.addParameters(commitHash)
        val result = Git.getInstance().runCommand(checkoutHandler)
        
        if (result.success()) {
            isRewound = true
            Messages.showInfoMessage(project, "⏪ Rewound to $commitHash", "Vestige Time Machine")
        } else {
            Messages.showErrorDialog(project, "Rewind failed: ${result.errorOutputAsHtmlString}", "Vestige")
        }
    }

    fun stopRewind() {
        if (!isRewound) return
        val repositories = GitRepositoryManager.getInstance(project).repositories
        if (repositories.isEmpty()) return
        val root = repositories[0].root

        val checkoutHandler = GitLineHandler(project, root, GitCommand.CHECKOUT)
        checkoutHandler.addParameters("main") // Defaulting to main for simplicity
        val result = Git.getInstance().runCommand(checkoutHandler)
        
        if (result.success()) {
            isRewound = false
            Messages.showInfoMessage(project, "⏩ Returned to present time.", "Vestige")
        }
    }
}
