package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File
import java.nio.file.Path

class LoreParser {
    fun parseDecisionFile(file: File): Map<String, Any>? {
        return try {
            val content = file.readText()
            if (file.name.endsWith(".json")) {
                Gson().fromJson(content, object : TypeToken<Map<String, Any>>() {}.type)
            } else {
                parseLean(content)
            }
        } catch (e: Exception) {
            println("Failed to parse ${file.path}: ${e.message}")
            null
        }
    }

    private fun parseLean(content: String): Map<String, Any> {
        val decision = mutableMapOf<String, Any>()
        var remaining = content

        // 1. Multi-line strings: key: """ ... """
        val multiLineRegex = Regex("""([a-z_]+):\s*\"\"\"([\s\S]*?)\"\"\"""")
        multiLineRegex.findAll(remaining).forEach { match ->
            decision[match.groupValues[1]] = match.groupValues[2].trim()
        }
        remaining = remaining.replace(multiLineRegex, "")

        // 2. Lists: key: [ ... ]
        val listRegex = Regex("""([a-z_]+):\s*\[([\s\S]*?)\]""")
        listRegex.findAll(remaining).forEach { match ->
            val key = match.groupValues[1]
            val rawList = match.groupValues[2]
            val itemRegex = Regex("""\"([^\"\\]*(?:\\.[^\"\\]*)*)\"|([^\s,\[\]]+)""")
            val items = itemRegex.findAll(rawList).map { itemMatch ->
                if (itemMatch.groupValues[1].isNotEmpty()) {
                    itemMatch.groupValues[1].replace("\\\"", "\"").replace("\\\\", "\\")
                } else {
                    itemMatch.groupValues[2]
                }
            }.toList()
            decision[key] = items
        }
        remaining = remaining.replace(listRegex, "")

        // 3. Simple Key-Values
        val simpleRegex = Regex("""([a-z_]+):\s*(.+)""")
        simpleRegex.findAll(remaining).forEach { match ->
            val key = match.groupValues[1]
            var value = match.groupValues[2].trim()
            if (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) {
                value = value.substring(1, value.length - 1).replace("\\\"", "\"").replace("\\\\", "\\")
            }
            decision[key] = value
        }

        return decision
    }
}

@Service(Service.Level.PROJECT)
class VestigeLoreService(private val project: Project) {
    private val parser = LoreParser()
    private var decisions = listOf<Map<String, Any>>()
    private val lorePath: String?
        get() = project.basePath?.let { "$it/.lore/decisions" }

    init {
        scanDecisions()
        project.messageBus.connect().subscribe(VirtualFileManager.VFS_CHANGES, object : BulkFileListener {
            override fun after(events: List<VFileEvent>) {
                val relevant = events.any { event ->
                    event.path.contains("/.lore/decisions/") && 
                    (event.path.endsWith(".lean") || event.path.endsWith(".json"))
                }
                if (relevant) scanDecisions()
            }
        })
    }

    fun scanDecisions() {
        val path = lorePath ?: return
        val dir = File(path)
        if (!dir.exists()) {
            decisions = emptyList()
            return
        }

        decisions = dir.listFiles { _, name -> name.endsWith(".lean") || name.endsWith(".json") }
            ?.mapNotNull { parser.parseDecisionFile(it) } ?: emptyList()
    }

    fun getDecisionsForFile(file: VirtualFile): List<Map<String, Any>> {
        val basePath = project.basePath ?: return emptyList()
        val relativePath = file.path.removePrefix(basePath).removePrefix("/")

        return decisions.filter { d ->
            val related = d["related_code"] as? List<*> ?: return@filter false
            related.any { rc ->
                val normalizedRc = (rc as? String)?.trimEnd('/') ?: return@any false
                relativePath.startsWith(normalizedRc)
            }
        }
    }

    fun searchDecisions(query: String): List<Map<String, Any>> {
        val lower = query.lowercase()
        return decisions.filter { d ->
            val title = (d["title"] as? String)?.lowercase() ?: ""
            val problem = (d["context"] as? String)?.lowercase() ?: ""
            title.contains(lower) || problem.contains(lower)
        }
    }
}
