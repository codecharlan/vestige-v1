package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeService
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import java.awt.BorderLayout
import javax.swing.JPanel
import com.google.gson.Gson

/**
 * The HTML overview dashboard, rendered in an embedded browser.
 *
 * Only two things changed here: the "JCEF unavailable" fallback is now a
 * proper [VestigeUI.emptyState] instead of a bare centred label, and the
 * default insight text no longer reads "The code archeology is revealing new
 * patterns" — which told the user nothing — but says what is actually true.
 *
 * Browser creation, the message wiring and disposal are untouched.
 */
class VestigeAuraPanel(private val project: Project) :
    JPanel(BorderLayout()), VestigeService.AnalysisListener, Disposable {

    private val browser: JBCefBrowser? = if (JBCefApp.isSupported()) JBCefBrowser() else null
    private val gson = Gson()

    init {
        background = VestigeUI.Surface
        isOpaque = true

        if (browser != null) {
            add(browser.component, BorderLayout.CENTER)

            // Load the dashboard by reading the resource text: JCEF cannot load jar: URLs,
            // so the HTML is passed directly via loadHTML.
            val html = javaClass.getResourceAsStream("/webview/aura_dashboard.html")
                ?.use { stream -> stream.readBytes().toString(Charsets.UTF_8) }
            if (html != null) {
                browser.loadHTML(html)
            } else {
                add(
                    VestigeUI.emptyState(
                        "Overview could not be loaded",
                        "The dashboard resource is missing from the plugin build."
                    ),
                    BorderLayout.CENTER
                )
            }
        } else {
            add(
                VestigeUI.emptyState(
                    "Overview needs an embedded browser",
                    "This IDE runtime has no JCEF support. The other tabs work as normal."
                ),
                BorderLayout.CENTER
            )
        }

        project.getService(VestigeService::class.java).addListener(this)
        Disposer.register(project, this)
    }

    /** Called on the EDT by the service when a background analysis completes. */
    override fun onAnalysisUpdated(file: VirtualFile, result: VestigeService.AnalysisResult) {
        // Churn is the file's commit count — a real, countable number.
        // This previously rendered `(debt * 10)%`: the debt score is an
        // unbounded relative ranking value (churn × size × log(age)), so
        // scaling it by ten and appending a percent sign produced a figure
        // that measured nothing and could exceed 100%.
        val stats = mapOf(
            "churn" to (result.stats?.commits?.toString() ?: "—"),
            "fossils" to (result.stats?.let { if (it.ageDays > 365) 1 else 0 } ?: 0),
            "stability" to "${result.stability}",
            "busFactor" to (result.busFactor?.busFactor?.toString() ?: "—"),
            "owner" to (result.busFactor?.contributors?.firstOrNull()
                ?.let { "${it.name} (${it.percent}%)" } ?: "—"),
            "insight" to (result.onboardingNarrative
                ?: "No written summary for ${file.name} yet."),
            "pet" to "🦉"
        )
        updateStats(gson.toJson(stats))
    }

    fun updateStats(statsJson: String) {
        browser?.cefBrowser?.executeJavaScript("window.updateStats($statsJson)", "", 0)
    }

    override fun dispose() {
        project.getService(VestigeService::class.java).removeListener(this)
        browser?.dispose()
    }
}
