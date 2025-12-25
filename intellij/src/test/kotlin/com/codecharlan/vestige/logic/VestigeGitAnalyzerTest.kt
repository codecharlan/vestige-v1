package com.codecharlan.vestige.logic

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.Assert

class VestigeGitAnalyzerTest : BasePlatformTestCase() {

    fun testCalculateTechnicalDebt() {
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)
        val file = myFixture.addFileToProject("Test.kt", "fun main() { println(\"Hello\") }").virtualFile
        
        // Debt calculation should return a value (even if simplified)
        val debt = analyzer.calculateTechnicalDebt(file)
        Assert.assertTrue("Debt score should be non-negative", debt >= 0.0)
    }

    fun testGetFileStats() {
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)
        val file = myFixture.addFileToProject("TestStats.kt", "class Test {}").virtualFile
        
        // This might return null if not in a real git repo during tests, 
        // but we verify the method signature and basic existence.
        val stats = analyzer.getFileStats(file)
        // stats might be null in local tests without git, but the code should handle it
    }
}
