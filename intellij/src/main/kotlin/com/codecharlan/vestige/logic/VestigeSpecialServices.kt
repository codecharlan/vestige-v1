package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.WindowManager
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VirtualFile
import org.eclipse.jgit.revwalk.RevWalk
import org.eclipse.jgit.storage.file.FileRepositoryBuilder
import org.eclipse.jgit.treewalk.TreeWalk
import java.io.File
import java.util.Random

@Service(Service.Level.PROJECT)
class VestigeCipherPet(private val project: Project) {
    var reputation = 0
    var level = 1
    private val states = listOf("🥚", "🐣", "🐥", "🦉", "🐉", "👑")
    private val messages = listOf(
        "Ready for some archaeology?",
        "I smell some fossil code nearby...",
        "Your Lore contributions make me strong!",
        "Refactoring is like snacks for me.",
        "I'm keeping an eye on those interest rates."
    )

    fun updateReputation(points: Int) {
        reputation += points
        level = minOf(states.size - 1, reputation / 100) + 1
    }

    fun getStatusText(): String {
        val pet = states[minOf(states.size - 1, level - 1)]
        return "$pet Cipher (Lvl $level)"
    }

    fun getRandomMessage(): String = messages[Random().nextInt(messages.size)]
}

@Service(Service.Level.PROJECT)
class VestigeEchoChamber(private val project: Project) {
    var isEnabled = false

    fun toggle() {
        isEnabled = !isEnabled
        Messages.showInfoMessage(project, "Architectural Echo Chamber: ${if (isEnabled) "Synthesizing..." else "Silenced"}", "Vestige")
    }

    fun reflect(safetyScore: Int, interestRate: Int) {
        if (!isEnabled) return
        if (safetyScore < 40 || interestRate > 50) {
            println("🔊 ECHO: Low-frequency hum. High technical debt zone.")
        } else {
            println("🔊 ECHO: Harmonic resonance. High stability zone.")
        }
    }
}

@Service(Service.Level.PROJECT)
class VestigeGhostCursor(private val project: Project) {
    private var isReplaying = false

    companion object {
        /** Lines replayed per animation tick. */
        private const val LINES_PER_TICK = 1

        /** Delay between ticks. */
        private const val TICK_DELAY_MS = 60

        /** Hard cap on replayed lines. */
        private const val MAX_REPLAY_LINES = 500

        /** Hard cap on replayed characters. */
        private const val MAX_REPLAY_CHARS = 20_000
    }

    /**
     * "Types" [additions] into [editor] as an animation.
     *
     * This used to run one `WriteCommandAction` PER CHARACTER from a pooled
     * thread, with a `Thread.sleep` between each. Every write action takes the
     * global write lock and pushes a separate undo record, so a 2,000-character
     * diff meant 2,000 write-lock acquisitions, 2,000 undo entries and ~2
     * minutes during which every keystroke contended with the replay.
     *
     * Now one write action per line, scheduled on the EDT by a Swing timer:
     * the animation is preserved, the undo history is per line, and no
     * background thread holds or waits on the write lock.
     */
    fun replay(editor: Editor, additions: List<String>) {
        if (isReplaying) return

        val lines = additions.asSequence()
            .map { it.removePrefix("+") }
            .filter { it.isNotEmpty() }
            .take(MAX_REPLAY_LINES)
            .toList()
        if (lines.isEmpty()) return

        isReplaying = true
        var index = 0
        var charsWritten = 0

        val timer = javax.swing.Timer(TICK_DELAY_MS, null)
        timer.addActionListener {
            if (project.isDisposed || editor.isDisposed || index >= lines.size || charsWritten >= MAX_REPLAY_CHARS) {
                timer.stop()
                isReplaying = false
                return@addActionListener
            }

            val chunk = buildString {
                var emitted = 0
                while (emitted < LINES_PER_TICK && index < lines.size && charsWritten < MAX_REPLAY_CHARS) {
                    val line = lines[index++]
                    append(line).append('\n')
                    charsWritten += line.length + 1
                    emitted++
                }
            }

            // One write action per tick, on the EDT, where write actions belong.
            WriteCommandAction.runWriteCommandAction(project) {
                val offset = editor.caretModel.offset
                editor.document.insertString(offset, chunk)
                editor.caretModel.moveToOffset(offset + chunk.length)
            }
        }
        timer.isRepeats = true
        timer.start()
    }
}

@Service(Service.Level.PROJECT)
class VestigeWormholeService(private val project: Project) {

    /**
     * Fetches the real content of [file] at [commitHash] via JGit on a pooled thread,
     * then inserts it at the caret inside a write command on the EDT.
     * Shows an error and inserts nothing if the historical content cannot be read.
     */
    fun openPortal(editor: Editor, file: VirtualFile, commitHash: String) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val content = fetchHistoricalContent(file, commitHash)
            ApplicationManager.getApplication().invokeLater {
                if (project.isDisposed) return@invokeLater
                if (content == null) {
                    Messages.showErrorDialog(
                        project,
                        "Could not read ${file.name} at commit ${commitHash.take(7)} from git history. Nothing was inserted.",
                        "Vestige Wormhole"
                    )
                    return@invokeLater
                }
                if (editor.isDisposed) return@invokeLater
                WriteCommandAction.runWriteCommandAction(project) {
                    val offset = editor.caretModel.offset
                    val portalText = "\n// --- Restored via Temporal Wormhole [${commitHash.take(7)}] ---\n$content\n// --- End of restored fragment ---\n"
                    editor.document.insertString(offset, portalText)
                    editor.caretModel.moveToOffset(offset + portalText.length)
                }
                Messages.showInfoMessage(
                    project,
                    "Inserted the content of ${file.name} as of commit ${commitHash.take(7)}.",
                    "Vestige Wormhole"
                )
            }
        }
    }

    private fun fetchHistoricalContent(file: VirtualFile, commitHash: String): String? {
        val gitDir = findGitDir(File(file.path)) ?: return null
        return try {
            val repo = FileRepositoryBuilder().setGitDir(gitDir).readEnvironment().build()
            try {
                val commitId = repo.resolve(commitHash) ?: return null
                val revWalk = RevWalk(repo)
                try {
                    val commit = revWalk.parseCommit(commitId)
                    val workTree = gitDir.parentFile.absolutePath
                    if (!file.path.startsWith("$workTree/")) return null
                    val relPath = file.path.substring(workTree.length + 1)
                    val treeWalk = TreeWalk.forPath(repo, relPath, commit.tree) ?: return null
                    try {
                        val blobId = treeWalk.getObjectId(0)
                        String(repo.open(blobId).bytes, Charsets.UTF_8)
                    } finally {
                        treeWalk.close()
                    }
                } finally {
                    revWalk.close()
                }
            } finally {
                repo.close()
            }
        } catch (e: com.intellij.openapi.progress.ProcessCanceledException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    private fun findGitDir(start: File): File? {
        var current: File? = start.parentFile
        while (current != null) {
            val candidate = File(current, ".git")
            if (candidate.exists() && candidate.isDirectory) return candidate
            current = current.parentFile
        }
        return null
    }
}
