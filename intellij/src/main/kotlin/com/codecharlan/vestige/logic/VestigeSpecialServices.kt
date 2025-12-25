package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.WindowManager
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.ui.Messages
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

    fun replay(editor: Editor, additions: List<String>) {
        if (isReplaying) return
        isReplaying = true

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                additions.forEach { line ->
                    val content = line.removePrefix("+")
                    if (content.isEmpty()) return@forEach

                    for (char in content) {
                        WriteCommandAction.runWriteCommandAction(project) {
                            val offset = editor.caretModel.offset
                            editor.document.insertString(offset, char.toString())
                            editor.caretModel.moveToOffset(offset + 1)
                        }
                        Thread.sleep(30 + Random().nextInt(50).toLong())
                    }
                    
                    WriteCommandAction.runWriteCommandAction(project) {
                        editor.document.insertString(editor.caretModel.offset, "\n")
                    }
                }
            } finally {
                isReplaying = false
            }
        }
    }
}

@Service(Service.Level.PROJECT)
class VestigeWormholeService(private val project: Project) {
    fun openPortal(editor: Editor, commitHash: String, content: String) {
        WriteCommandAction.runWriteCommandAction(project) {
            val offset = editor.caretModel.offset
            val portalText = "\n// --- Restored via Temporal Wormhole [${commitHash.take(7)}] ---\n$content\n// ---\n"
            editor.document.insertString(offset, portalText)
            editor.caretModel.moveToOffset(offset + portalText.length)
        }
        Messages.showInfoMessage(project, "Code fragment successfully restored from the past.", "Vestige Wormhole")
    }
}
