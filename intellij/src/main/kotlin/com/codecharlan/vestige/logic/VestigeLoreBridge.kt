package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import com.google.gson.Gson

@Service(Service.Level.PROJECT)
class VestigeLoreBridge(private val project: Project) {
    private val client = HttpClient.newBuilder().build()
    private val gson = Gson()

    fun shareLore(type: String, content: Map<String, Any>, webhookUrl: String) {
        if (webhookUrl.isEmpty()) {
            Messages.showWarningDialog(project, "Lore Bridge Webhook not configured in Settings.", "Vestige")
            return
        }

        val title = content["title"] as? String ?: "Unnamed Decision"
        val text = "🚀 *Vestige Lore Export: $type*\n\n> *Title:* $title\n> *Problem:* ${content["problem"] ?: "N/A"}"
        
        val body = mapOf("text" to text)
        
        val request = HttpRequest.newBuilder()
            .uri(URI.create(webhookUrl))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
            .build()

        client.sendAsync(request, HttpResponse.BodyHandlers.ofString())
            .thenAccept { response ->
                if (response.statusCode() in 200..299) {
                    Messages.showInfoMessage(project, "✅ Lore shared successfully to team channel!", "Vestige")
                } else {
                    Messages.showErrorDialog(project, "Failed to share Lore: ${response.statusCode()}", "Vestige")
                }
            }
    }
}
