package com.codecharlan.vestige.logic

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.Assert

class IntelligenceServicesTest : BasePlatformTestCase() {

    fun testHandoffAssistantIdentifiesRisks() {
        val assistant = project.getService(VestigeHandoffAssistant::class.java)
        val risks = assistant.identifyRisks()
        Assert.assertFalse("Risk list should not be empty", risks.isEmpty())
        Assert.assertTrue("Top risk should be significant", risks[0].riskScore > 50)
    }

    fun testMentorshipMatcherFindsExperts() {
        val matcher = project.getService(VestigeMentorshipMatcher::class.java)
        val experts = matcher.findExpertsForFile("test-file.kt")
        Assert.assertFalse("Should find at least one expert", experts.isEmpty())
        Assert.assertTrue("Expert should have a reason", experts[0].reason.isNotEmpty())
    }
}
