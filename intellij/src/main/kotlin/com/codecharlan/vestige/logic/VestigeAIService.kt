package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import com.google.gson.Gson

@Service(Service.Level.APPLICATION)
class VestigeAIService {
    private val client = HttpClient.newBuilder().build()
    private val gson = Gson()
    private val baseUrl = "https://api.openai.com/v1/chat/completions"

    fun explainCommit(diff: String, message: String, apiKey: String): String {
        if (apiKey.isEmpty()) return "OpenAI API key not configured."

        val prompt = """
            You are a senior software engineer reviewing a git commit. Explain what this commit does in 2-3 sentences. Be concise and technical.
            
            Commit Message: $message
            
            Diff:
            ${diff.take(2000)}${if (diff.length > 2000) " ...(truncated)" else ""}
            
            Explain the change:
        """.trimIndent()

        val body = mapOf(
            "model" to "gpt-3.5-turbo",
            "messages" to listOf(
                mapOf("role" to "system", "content" to "You are a helpful code review assistant."),
                mapOf("role" to "user", "content" to prompt)
            ),
            "max_tokens" to 150,
            "temperature" to 0.3
        )

        val request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer $apiKey")
            .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
            .build()

        return try {
            val response = client.send(request, HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() == 200) {
                val data = gson.fromJson(response.body(), Map::class.java)
                val choices = data["choices"] as List<*>
                val firstChoice = choices[0] as Map<*, *>
                val msg = firstChoice["message"] as Map<*, *>
                msg["content"] as String
            } else {
                "AI request failed: ${response.statusCode()}"
            }
        } catch (e: Exception) {
            "AI error: ${e.message}"
        }
    }

    fun analyzeStagnation(filePath: String, ageDays: Int, codeContext: String, apiKey: String): String {
        val prompt = """
            You are a Code Archaeologist. Analyze this file that hasn't changed in $ageDays days.
            
            File: $filePath
            Code Snippet:
            ${codeContext.take(1000)}
            
            Hypothesize why this code persists. Is it a "Load-Bearing Wall" (critical but untouchable), "Sunken Treasure" (valuable but forgotten), or a "Zombie" (useless but lurking)? Provide a technical and philosophical explanation in 3-4 sentences.
        """.trimIndent()

        val body = mapOf(
            "model" to "gpt-3.5-turbo",
            "messages" to listOf(
                mapOf("role" to "system", "content" to "You are a helpful code historian assistant."),
                mapOf("role" to "user", "content" to prompt)
            ),
            "max_tokens" to 300,
            "temperature" to 0.5
        )

        val request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer $apiKey")
            .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
            .build()

        return try {
            val response = client.send(request, HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() == 200) {
                val data = gson.fromJson(response.body(), Map::class.java)
                val choices = data["choices"] as List<*>
                val firstChoice = choices[0] as Map<*, *>
                val msg = firstChoice["message"] as Map<*, *>
                msg["content"] as String
            } else {
                "AI analysis failed."
            }
        } catch (e: Exception) {
            "AI error: ${e.message}"
        }
    }

    fun suggestRefactoring(filePath: String, interestRate: Int, lineCount: Int, apiKey: String): String {
        val prompt = """
            You are a senior architect. Suggest 3 high-ROI refactoring steps for this file.
            
            File: $filePath
            Technical Debt Interest: ${interestRate}%
            Lines of Code: $lineCount
            
            Provide actionable, specific advice.
        """.trimIndent()

        val body = mapOf(
            "model" to "gpt-3.5-turbo",
            "messages" to listOf(
                mapOf("role" to "system", "content" to "You are a senior software architect."),
                mapOf("role" to "user", "content" to prompt)
            ),
            "max_tokens" to 200,
            "temperature" to 0.4
        )

        val request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer $apiKey")
            .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
            .build()

        return try {
            val response = client.send(request, HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() == 200) {
                val data = gson.fromJson(response.body(), Map::class.java)
                val choices = data["choices"] as List<*>
                val firstChoice = choices[0] as Map<*, *>
                val msg = firstChoice["message"] as Map<*, *>
                msg["content"] as String
            } else {
                "Refactor suggestion failed."
            }
        } catch (e: Exception) {
            "AI error: ${e.message}"
        }
    }

    fun summarizeDiff(diff: String, apiKey: String): String {
        if (apiKey.isEmpty()) return "AI summary unavailable."
        val prompt = "Summarize this technical diff in 1 sentence for a project lead:\n\n${diff.take(2000)}"
        return callAI(prompt, apiKey, 100)
    }

    fun predictStabilityImpact(filePath: String, change: String, apiKey: String): String {
        if (apiKey.isEmpty()) return "AI prediction unavailable."
        val prompt = "Predict the stability impact (ROI) of this refactoring in $filePath: $change"
        return callAI(prompt, apiKey, 200)
    }

    private fun callAI(prompt: String, apiKey: String, maxTokens: Int): String {
        val body = mapOf(
            "model" to "gpt-3.5-turbo",
            "messages" to listOf(
                mapOf("role" to "system", "content" to "You are a professional software engineer."),
                mapOf("role" to "user", "content" to prompt)
            ),
            "max_tokens" to maxTokens,
            "temperature" to 0.4
        )

        val request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer $apiKey")
            .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
            .build()

        return try {
            val response = client.send(request, HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() == 200) {
                val data = gson.fromJson(response.body(), Map::class.java)
                val choices = data["choices"] as List<*>
                val firstChoice = choices[0] as Map<*, *>
                val msg = firstChoice["message"] as Map<*, *>
                msg["content"] as String
            } else {
                "AI request failed."
            }
        } catch (e: Exception) {
            "AI error: ${e.message}"
        }
    }

    /**
     * Onboarding: Generate friendly narrative for file history
     * Creates a 2-3 sentence summary perfect for new developers
     */
    fun generateOnboardingNarrative(
        milestones: List<VestigeGitAnalyzer.OnboardingMilestone>,
        fileName: String,
        facts: VestigeGitAnalyzer.QuickFacts,
        apiKey: String
    ): String {
        if (apiKey.isEmpty()) {
            return generateFallbackNarrative(milestones, fileName, facts)
        }

        val milestonesSummary = milestones.take(5).joinToString("\n") { m ->
            "${m.icon} ${m.type}: ${m.content} (${m.author ?: "Unknown"})"
        }

        val prompt = """
            You are onboarding a new developer to a codebase. Create a friendly, concise narrative (2-3 sentences) about this file's history.
            
            File: $fileName
            Age: ${facts.age} days
            Total Changes: ${facts.totalCommits}
            Contributors: ${facts.contributors}
            
            Key Milestones:
            $milestonesSummary
            
            Write a welcoming summary that:
            1. Explains when and why this file was created
            2. Highlights 1-2 major changes or patterns
            3. Mentions current state and who maintains it
            
            Keep it conversational and helpful for someone new to the codebase.
        """.trimIndent()

        val body = mapOf(
            "model" to "gpt-3.5-turbo",
            "messages" to listOf(
                mapOf("role" to "system", "content" to "You are a helpful onboarding assistant."),
                mapOf("role" to "user", "content" to prompt)
            ),
            "max_tokens" to 200,
            "temperature" to 0.5
        )

        val request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer $apiKey")
            .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
            .build()

        return try {
            val response = client.send(request, HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() == 200) {
                val data = gson.fromJson(response.body(), Map::class.java)
                val choices = data["choices"] as List<*>
                val firstChoice = choices[0] as Map<*, *>
                val msg = firstChoice["message"] as Map<*, *>
                msg["content"] as String
            } else {
                generateFallbackNarrative(milestones, fileName, facts)
            }
        } catch (e: Exception) {
            generateFallbackNarrative(milestones, fileName, facts)
        }
    }

    /**
     * Fallback narrative generator (no AI required)
     */
    fun generateFallbackNarrative(
        milestones: List<VestigeGitAnalyzer.OnboardingMilestone>,
        fileName: String,
        facts: VestigeGitAnalyzer.QuickFacts
    ): String {
        val birthMilestone = milestones.firstOrNull { it.type == VestigeGitAnalyzer.MilestoneType.BIRTH }
        val creator = birthMilestone?.author ?: "a developer"
        val ageYears = facts.age / 365
        val ageDesc = if (ageYears > 0) "$ageYears year${if (ageYears > 1) "s" else ""}" else "${facts.age} days"

        var narrative = "$fileName was created $ageDesc ago by $creator. "

        narrative += if (facts.totalCommits > 50) {
            "It has evolved through ${facts.totalCommits} changes by ${facts.contributors} contributor${if (facts.contributors > 1) "s" else ""}, "
        } else {
            "It has seen ${facts.totalCommits} updates, "
        }

        val majorMilestones = milestones.filter { 
            it.type in listOf(
                VestigeGitAnalyzer.MilestoneType.REFACTOR,
                VestigeGitAnalyzer.MilestoneType.SECURITY
            )
        }

        narrative += if (majorMilestones.isNotEmpty()) {
            val latest = majorMilestones.first()
            "including ${latest.content.lowercase()}. "
        } else {
            "maintaining steady evolution. "
        }

        val ownershipTransition = milestones.firstOrNull { 
            it.type == VestigeGitAnalyzer.MilestoneType.OWNERSHIP_TRANSITION 
        }
        
        narrative += if (ownershipTransition != null) {
            "${ownershipTransition.content}."
        } else if (birthMilestone != null) {
            "${birthMilestone.author} remains a key contributor."
        } else {
            "The file continues to be actively maintained."
        }

        return narrative
    }
}
