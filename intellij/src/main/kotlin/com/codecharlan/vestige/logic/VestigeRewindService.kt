package com.codecharlan.vestige.logic

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import git4idea.commands.Git
import git4idea.commands.GitCommand
import git4idea.commands.GitLineHandler
import git4idea.repo.GitRepositoryManager

@Service(Service.Level.PROJECT)
class VestigeRewindService(private val project: Project) {
    @Volatile
    private var rewound = false

    @Volatile
    private var originalBranch: String? = null

    fun isRewound(): Boolean = rewound

    fun startRewind(commitHash: String) {
        object : Task.Backgroundable(project, "Vestige: Rewinding time...", false) {
            override fun run(indicator: ProgressIndicator) {
                val repositories = GitRepositoryManager.getInstance(project).repositories
                if (repositories.isEmpty()) {
                    showError("No Git repository found in this project.")
                    return
                }
                val repository = repositories[0]
                val root = repository.root

                // Refuse to rewind when the working tree is dirty
                val statusHandler = GitLineHandler(project, root, GitCommand.STATUS)
                statusHandler.addParameters("--porcelain")
                val statusResult = Git.getInstance().runCommand(statusHandler)
                if (!statusResult.success()) {
                    showError("Could not determine working tree status: ${statusResult.errorOutputAsJoinedString}")
                    return
                }
                if (statusResult.output.any { it.isNotBlank() }) {
                    showError("Your working tree has uncommitted changes. Commit or stash them before rewinding.")
                    return
                }

                // Capture the branch we are leaving BEFORE checking out
                val branchBefore = repository.currentBranchName

                val checkoutHandler = GitLineHandler(project, root, GitCommand.CHECKOUT)
                checkoutHandler.addParameters(commitHash)
                val result = Git.getInstance().runCommand(checkoutHandler)

                if (result.success()) {
                    if (!rewound) {
                        originalBranch = branchBefore
                    }
                    rewound = true
                    repository.update()
                    showInfo("⏪ Rewound to $commitHash. Use 'Return to Present' to go back.")
                } else {
                    showError("Rewind failed: ${result.errorOutputAsJoinedString}")
                }
            }
        }.queue()
    }

    fun stopRewind() {
        if (!rewound) {
            showInfo("You are already in the present.")
            return
        }
        val branch = originalBranch
        if (branch.isNullOrEmpty()) {
            showError("Vestige could not determine your original branch. Please check out your branch manually via Git.")
            return
        }

        object : Task.Backgroundable(project, "Vestige: Returning to present...", false) {
            override fun run(indicator: ProgressIndicator) {
                val repositories = GitRepositoryManager.getInstance(project).repositories
                if (repositories.isEmpty()) return
                val repository = repositories[0]
                val root = repository.root

                val checkoutHandler = GitLineHandler(project, root, GitCommand.CHECKOUT)
                checkoutHandler.addParameters(branch)
                val result = Git.getInstance().runCommand(checkoutHandler)

                if (result.success()) {
                    rewound = false
                    originalBranch = null
                    repository.update()
                    showInfo("⏩ Returned to present time ($branch).")
                } else {
                    showError("Return to present failed: ${result.errorOutputAsJoinedString}")
                }
            }
        }.queue()
    }

    private fun showInfo(message: String) {
        ApplicationManager.getApplication().invokeLater {
            if (!project.isDisposed) {
                Messages.showInfoMessage(project, message, "Vestige Time Machine")
            }
        }
    }

    private fun showError(message: String) {
        ApplicationManager.getApplication().invokeLater {
            if (!project.isDisposed) {
                Messages.showErrorDialog(project, message, "Vestige Time Machine")
            }
        }
    }
}
