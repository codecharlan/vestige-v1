package com.codecharlan.vestige.logic

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.Assert

class VestigeAIServiceTest : BasePlatformTestCase() {

    /**
     * Without an API key the service must degrade gracefully rather than
     * issuing a doomed `Bearer ` request or returning fabricated content.
     */
    fun testSummarizeDiffWithoutApiKeyReturnsUnavailable() {
        val aiService = VestigeAIService()
        val summary = aiService.summarizeDiff("fake diff content", "")
        Assert.assertEquals("AI summary unavailable.", summary)
    }

    fun testPredictStabilityImpactWithoutApiKeyReturnsUnavailable() {
        val aiService = VestigeAIService()
        val prediction = aiService.predictStabilityImpact("Test.kt", "Rename function to clearName", "")
        Assert.assertEquals("AI prediction unavailable.", prediction)
    }

    /** The key accessor must round-trip through PasswordSafe without throwing. */
    fun testApiKeyAccessorRoundTrips() {
        val original = VestigeAIService.getApiKey()
        try {
            VestigeAIService.setApiKey("test-key-123")
            Assert.assertEquals("test-key-123", VestigeAIService.getApiKey())
        } finally {
            VestigeAIService.setApiKey(original)
        }
    }
}
