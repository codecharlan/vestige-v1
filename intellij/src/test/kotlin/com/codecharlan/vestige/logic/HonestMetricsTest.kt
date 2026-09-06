package com.codecharlan.vestige.logic

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.Assert

/**
 * Guards the product decision that Vestige never shows the user a number it
 * did not derive from their repository.
 *
 * The plugin previously shipped an "estimated remediation cost" (an arbitrary
 * score multiplied by a hardcoded hourly rate), a "Temporal Churn" percentage
 * computed as `debtScore * 10`, a six-bar activity chart with hardcoded bar
 * heights, the literals 94/100 and 82% presented as measurements, and a timer
 * that asserted "I've detected a significant ownership transition in the core
 * logic" three seconds after the panel opened, on any repository.
 */
class HonestMetricsTest : BasePlatformTestCase() {

    private fun auraDashboardHtml(): String =
        javaClass.getResourceAsStream("/webview/aura_dashboard.html")
            ?.bufferedReader()?.use { it.readText() }
            ?: Assert.fail("aura_dashboard.html is missing from resources").let { "" }

    fun testDashboardShipsNoFabricatedMetrics() {
        val html = auraDashboardHtml()

        // Strip HTML comments: the removals are documented in comments that
        // legitimately mention the old values.
        val live = html.replace(Regex("<!--[\\s\\S]*?-->"), "")

        listOf("12.4%", "2.1% from last week", "94/100", "82%", "Lore Capture Rate")
            .forEach { literal ->
                Assert.assertFalse(
                    "Fabricated value '$literal' must not appear in the dashboard",
                    live.contains(literal)
                )
            }
    }

    fun testDashboardDoesNotInventAnInsight() {
        val live = auraDashboardHtml().replace(Regex("<!--[\\s\\S]*?-->"), "")
        Assert.assertFalse(
            "The dashboard must not inject a canned 'insight' on a timer",
            live.contains("I've detected a significant ownership transition")
        )
        Assert.assertFalse(
            "No simulated loading — values arrive from real analysis only",
            live.contains("Simulate initial loading")
        )
    }

    fun testDebtForecastCarriesNoCurrency() {
        val calculator = project.getService(VestigeDebtCalculator::class.java)
        Assert.assertNotNull("VestigeDebtCalculator must be available", calculator)

        // The forecast type must not expose a monetary field. Reflection keeps
        // this honest even if the class is refactored.
        val forecastFields = VestigeDebtCalculator.DebtForecast::class.java.declaredFields
            .map { it.name.lowercase() }
        listOf("cost", "dollars", "money", "usd", "hours").forEach { banned ->
            Assert.assertFalse(
                "DebtForecast must not carry a '$banned' field — the score is a relative ranking, not a price",
                forecastFields.contains(banned)
            )
        }
    }
}
