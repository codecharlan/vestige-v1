package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.codecharlan.vestige.logic.VestigeService
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import java.awt.BorderLayout
import javax.swing.JPanel
import com.google.gson.Gson

class VestigeAuraPanel(private val project: Project) : JPanel(BorderLayout()), VestigeService.AnalysisListener, Disposable {
    private val browser = JBCefBrowser()
    private val gson = Gson()
    
    init {
        add(browser.component, BorderLayout.CENTER)
        project.getService(VestigeService::class.java).addListener(this)
        Disposer.register(project, this)
        
        // Load the main dashboard from resources
        val htmlResource = javaClass.getResource("/webview/aura_dashboard.html")
        if (htmlResource != null) {
            browser.loadURL(htmlResource.toExternalForm())
        }
    }

    override fun onAnalysisUpdated(file: VirtualFile, result: VestigeService.AnalysisResult) {
        val stats = mapOf(
            "churn" to "${(result.debt * 10).toInt()}%",
            "fossils" to (result.stats?.let { if (it.ageDays > 365) 1 else 0 } ?: 0),
            "insight" to (result.onboardingNarrative ?: "The code archeology is revealing new patterns."),
            "pet" to "🦉" // Could be dynamic based on health
        )
        updateStats(gson.toJson(stats))
    }
    
    fun updateStats(statsJson: String) {
        browser.cefBrowser.executeJavaScript("window.updateStats($statsJson)", "", 0)
    }

    override fun dispose() {
        project.getService(VestigeService::class.java).removeListener(this)
        browser.dispose()
    }
}
