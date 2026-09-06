package com.codecharlan.vestige.logic

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.components.Service
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import com.google.gson.Gson

@Service
class VestigeAIService {
    private val client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build()
    private val gson = Gson()
    private val baseUrl = "https://api.openai.com/v1/chat/completions"

    companion object {
        private const val LEGACY_KEY_PROPERTY = "vestige.openaiApiKey"

        private fun credentialAttributes(): CredentialAttributes =
            CredentialAttributes(generateServiceName("Vestige", "OpenAI API Key"))

        /**
         * Reads the OpenAI API key from PasswordSafe. Falls back to (and migrates away
         * from) the legacy plain-text PropertiesComponent storage.
         */
        @JvmStatic
        fun getApiKey(): String? {
            val stored = PasswordSafe.instance.getPassword(credentialAttributes())
            if (!stored.isNullOrEmpty()) return stored

            val props = PropertiesComponent.getInstance()
            val legacy = props.getValue(LEGACY_KEY_PROPERTY)
            if (!legacy.isNullOrEmpty()) {
                PasswordSafe.instance.setPassword(credentialAttributes(), legacy)
                props.unsetValue(LEGACY_KEY_PROPERTY)
                return legacy
            }
            return null
        }

        /** Stores (or clears, when null/blank) the OpenAI API key in PasswordSafe. */
        @JvmStatic
        fun setApiKey(key: String?) {
            PasswordSafe.instance.setPassword(credentialAttributes(), key?.takeIf { it.isNotBlank() })
            // Make sure no plain-text copy lingers
            PropertiesComponent.getInstance().unsetValue(LEGACY_KEY_PROPERTY)
        }
    }

    fun explainCommit(diff: String, message: String, apiKey: String): String {
        if (apiKey.isEmpty()) return "OpenAI API key not configured."

        val prompt = """
            You are a senior software engineer reviewing a git commit. Explain what this commit does in 2-3 sentences. Be concise and technical.

            Commit Message: $message

            Diff:
            ${diff.take(2000)}${if (diff.length > 2000) " ...(truncated)" else ""}

            Explain the change:
        """.trimIndent()

        return callAI(
            prompt = prompt,
            apiKey = apiKey,
            maxTokens = 150,
            systemPrompt = "You are a helpful code review assistant.",
            temperature = 0.3
        ) ?: "AI request failed."
    }

    fun analyzeStagnation(filePath: String, ageDays: Int, codeContext: String, apiKey: String): String {
        val prompt = """
            You are a Code Archaeologist. Analyze this file that hasn't changed in $ageDays days.

            File: $filePath
            Code Snippet:
            ${codeContext.take(1000)}

            Hypothesize why this code persists. Is it a "Load-Bearing Wall" (critical but untouchable), "Sunken Treasure" (valuable but forgotten), or a "Zombie" (useless but lurking)? Provide a technical and philosophical explanation in 3-4 sentences.
        """.trimIndent()

        return callAI(
            prompt = prompt,
            apiKey = apiKey,
            maxTokens = 300,
            systemPrompt = "You are a helpful code historian assistant.",
            temperature = 0.5
        ) ?: "AI analysis failed."
    }

    fun suggestRefactoring(filePath: String, interestRate: Int, lineCount: Int, apiKey: String): String {
        val prompt = """
            You are a senior architect. Suggest 3 high-ROI refactoring steps for this file.

            File: $filePath
            Technical Debt Interest: ${interestRate}%
            Lines of Code: $lineCount

            Provide actionable, specific advice.
        """.trimIndent()

        return callAI(
            prompt = prompt,
            apiKey = apiKey,
            maxTokens = 200,
            systemPrompt = "You are a senior software architect.",
            temperature = 0.4
        ) ?: "Refactor suggestion failed."
    }

    fun summarizeDiff(diff: String, apiKey: String): String {
        if (apiKey.isEmpty()) return "AI summary unavailable."
        val prompt = """
            Analyze this technical diff. Provide a high-density, single-sentence summary for a Lead Architect.
            Focus on intent and structural impact, not just line changes.

            Diff:
            ${diff.take(2000)}
        """.trimIndent()
        return callAI(prompt, apiKey, 100) ?: "AI request failed."
    }

    fun predictStabilityImpact(filePath: String, change: String, apiKey: String): String {
        if (apiKey.isEmpty()) return "AI prediction unavailable."
        val prompt = """
            Perform a stability impact analysis for this change in '$filePath'.
            Change summary: $change

            Predict potential regressions or architectural friction in 2 sentences.
        """.trimIndent()
        return callAI(prompt, apiKey, 200) ?: "AI request failed."
    }

    /**
     * Shared request/parse pipeline for all AI calls. Returns null on any failure so
     * each caller can supply its own fallback.
     */
    private fun callAI(
        prompt: String,
        apiKey: String,
        maxTokens: Int,
        systemPrompt: String = "You are a professional software engineer.",
        temperature: Double = 0.4
    ): String? {
        if (apiKey.isEmpty()) return null

        val body = mapOf(
            "model" to "gpt-3.5-turbo",
            "messages" to listOf(
                mapOf("role" to "system", "content" to systemPrompt),
                mapOf("role" to "user", "content" to prompt)
            ),
            "max_tokens" to maxTokens,
            "temperature" to temperature
        )

        val request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer $apiKey")
            .timeout(Duration.ofSeconds(60))
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
                null
            }
        } catch (e: Exception) {
            null
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

        return callAI(
            prompt = prompt,
            apiKey = apiKey,
            maxTokens = 200,
            systemPrompt = "You are a helpful onboarding assistant.",
            temperature = 0.5
        ) ?: generateFallbackNarrative(milestones, fileName, facts)
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
