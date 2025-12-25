package com.codecharlan.vestige.logic

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.Assert

class IntegrationServicesTest : BasePlatformTestCase() {

    fun testCreateJiraTicket() {
        val jiraBridge = project.getService(VestigeJiraBridge::class.java)
        // Verify method exists and runs without error in test environment
        jiraBridge.createTicket("Test.kt", "Debt interest too high")
    }

    fun testNotifySlack() {
        val loreBridge = project.getService(VestigeLoreBridge::class.java)
        // Verify Slack notification logic (simulated)
        loreBridge.notifySlack("Centurion Status: All modules verified.")
    }
}
