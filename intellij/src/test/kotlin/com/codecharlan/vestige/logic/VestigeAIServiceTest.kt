package com.codecharlan.vestige.logic

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.Assert

class VestigeAIServiceTest : BasePlatformTestCase() {

    fun testSummarizeDiff() {
        val aiService = project.getService(VestigeAIService::class.java)
        val summary = aiService.summarizeDiff("fake diff content")
        Assert.assertTrue("Summary should contain simulated content", summary.contains("Simulated"))
    }

    fun testPredictStabilityImpact() {
        val aiService = project.getService(VestigeAIService::class.java)
        val prediction = aiService.predictStabilityImpact("Test.kt", "Rename function to clearName")
        Assert.assertTrue("Prediction should contain 'ROI'", prediction.contains("ROI"))
    }
}
