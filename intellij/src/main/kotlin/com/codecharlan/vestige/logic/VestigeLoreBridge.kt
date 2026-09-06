package com.codecharlan.vestige.logic

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import com.google.gson.Gson

@Service(Service.Level.PROJECT)
class VestigeLoreBridge(private val project: Project) {
    private val client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build()
    private val gson = Gson()

    private val notifications get() = project.getService(VestigeSmartNotifications::class.java)

    fun shareLore(type: String, content: Map<String, Any>, webhookUrl: String) {
        if (webhookUrl.isEmpty()) {
            notifications.showWarning("Vestige Lore Bridge", "Lore Bridge webhook is not configured in Settings — nothing was shared.")
            return
        }

        val title = content["title"] as? String ?: "Unnamed Decision"
        val text = "🚀 *Vestige Lore Export: $type*\n\n> *Title:* $title\n> *Problem:* ${content["problem"] ?: "N/A"}"

        val body = mapOf("text" to text)

        val request = HttpRequest.newBuilder()
            .uri(URI.create(webhookUrl))
            .header("Content-Type", "application/json")
            .timeout(Duration.ofSeconds(30))
            .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
            .build()

        client.sendAsync(request, HttpResponse.BodyHandlers.ofString())
            .thenAccept { response ->
                // We are on an HttpClient worker thread here — UI must go through the EDT
                onEdt {
                    if (response.statusCode() in 200..299) {
                        notifications.showInfo("Vestige Lore Bridge", "✅ Lore shared successfully to your team channel.")
                    } else {
                        notifications.showError("Vestige Lore Bridge", "Failed to share Lore: HTTP ${response.statusCode()}")
                    }
                }
            }
            .exceptionally { throwable ->
                onEdt {
                    notifications.showError("Vestige Lore Bridge", "Failed to share Lore: ${throwable.message}")
                }
                null
            }
    }

    private fun onEdt(action: () -> Unit) {
        ApplicationManager.getApplication().invokeLater {
            if (!project.isDisposed) action()
        }
    }
}
