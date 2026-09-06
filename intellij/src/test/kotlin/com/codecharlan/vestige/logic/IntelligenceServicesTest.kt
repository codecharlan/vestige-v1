package com.codecharlan.vestige.logic

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.Assert

class IntelligenceServicesTest : BasePlatformTestCase() {

    /**
     * The test fixture has no git repository, so the honest answer is an empty
     * list. What matters is that it degrades cleanly instead of throwing or
     * inventing risk data.
     */
    fun testHandoffAssistantReturnsListWithoutGitRepo() {
        val assistant = project.getService(VestigeHandoffAssistant::class.java)
        val risks = assistant.identifyRisks()
        Assert.assertNotNull("identifyRisks must never return null", risks)
        // Every returned risk must carry real, self-consistent data.
        risks.forEach {
            Assert.assertTrue("risk score must be within 0..100", it.riskScore in 0..100)
            Assert.assertTrue("risk must name a file", it.file.isNotEmpty())
        }
    }

    fun testMentorshipMatcherHandlesUntrackedFile() {
        val file = myFixture.configureByText("test-file.kt", "fun main() {}").virtualFile
        val matcher = project.getService(VestigeMentorshipMatcher::class.java)
        val experts = matcher.findExpertsForFile(file)
        Assert.assertNotNull("findExpertsForFile must never return null", experts)
        experts.forEach {
            Assert.assertTrue("expert must have a reason", it.reason.isNotEmpty())
            Assert.assertTrue("expert must be named", it.expert.isNotEmpty())
        }
    }
}
