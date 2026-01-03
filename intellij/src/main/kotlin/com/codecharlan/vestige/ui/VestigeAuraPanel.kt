package com.codecharlan.vestige.ui

import com.intellij.openapi.project.Project
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import java.awt.BorderLayout
import javax.swing.JPanel
import com.google.gson.Gson

class VestigeAuraPanel(private val project: Project) : JPanel(BorderLayout()) {
    private val browser = JBCefBrowser()
    private val gson = Gson()
    
    init {
        add(browser.component, BorderLayout.CENTER)
        
        // Load the main dashboard from resources
        val htmlResource = javaClass.getResource("/webview/aura_dashboard.html")
        if (htmlResource != null) {
            browser.loadURL(htmlResource.toExternalForm())
        } else {
            // Fallback if resource not found
            browser.loadHTML("<html><body><h1>Aura Resource Not Found</h1></body></html>")
        }
    }
    
    fun updateStats(statsJson: String) {
        browser.cefBrowser.executeJavaScript("window.updateStats($statsJson)", "", 0)
    }
}
