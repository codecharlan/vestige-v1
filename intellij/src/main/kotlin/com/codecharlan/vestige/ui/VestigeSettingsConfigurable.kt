package com.codecharlan.vestige.ui

import com.codecharlan.vestige.logic.VestigeAIService
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.options.Configurable
import com.intellij.ui.components.JBPasswordField
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.COLUMNS_LARGE
import com.intellij.ui.dsl.builder.COLUMNS_SHORT
import com.intellij.ui.dsl.builder.columns
import com.intellij.ui.dsl.builder.panel
import javax.swing.JCheckBox
import javax.swing.JComponent

/**
 * Vestige settings page.
 *
 * The previous layout was a `GridLayout(5, 2)` of bare labels and fields: every
 * row the same height, no grouping, no explanation of what any value did, and
 * one empty `JLabel("")` used as a spacer to keep the checkbox in the right
 * cell. It is now built with the platform's Kotlin UI DSL, so it picks up the
 * same label alignment, gaps and comment styling as every other settings page
 * in the IDE — and each field says what it affects.
 *
 * The stored keys, defaults and read/write behaviour are unchanged.
 */
class VestigeSettingsConfigurable : Configurable {

    private val openaiApiKeyField = JBPasswordField()
    private val enabledCheckbox = JCheckBox("Show Vestige annotations in the editor", true)
    private val churnThresholdField = JBTextField("10")
    private val fossilThresholdField = JBTextField("365")
    private val collabWebhookUrlField = JBTextField()

    override fun createComponent(): JComponent {
        val component = panel {
            group("General") {
                row {
                    cell(enabledCheckbox)
                        .comment("Inline history hints and gutter markers. Turn off to keep analysis without the editor decorations.")
                }
            }

            group("Thresholds") {
                row("Flag a file as high churn at:") {
                    cell(churnThresholdField)
                        .columns(COLUMNS_SHORT)
                        .comment("Number of commits before a file is treated as frequently changed.")
                }
                row("Treat code as stale after:") {
                    cell(fossilThresholdField)
                        .columns(COLUMNS_SHORT)
                        .comment("Age in days with no changes before code is marked stale. 365 is one year.")
                }
            }

            group("Integrations") {
                row("OpenAI API key:") {
                    cell(openaiApiKeyField)
                        .columns(COLUMNS_LARGE)
                        .comment("Optional. Enables the written file summaries. Stored in the IDE password safe, not in plain text.")
                }
                row("Webhook URL:") {
                    cell(collabWebhookUrlField)
                        .align(AlignX.FILL)
                        .comment("Optional. Where \"Share findings with the team\" posts. Leave empty to disable sharing.")
                }
            }
        }

        loadSettings()
        return component
    }

    override fun reset() {
        loadSettings()
    }

    private fun loadSettings() {
        val props = PropertiesComponent.getInstance()
        // API key lives in PasswordSafe (with transparent migration from the old
        // plain-text PropertiesComponent storage inside getApiKey()).
        openaiApiKeyField.text = VestigeAIService.getApiKey() ?: ""
        collabWebhookUrlField.text = props.getValue("vestige.collabWebhookUrl", "")
        enabledCheckbox.isSelected = props.getBoolean("vestige.enabled", true)
        churnThresholdField.text = props.getValue("vestige.churnThreshold", "10")
        fossilThresholdField.text = props.getValue("vestige.fossilThreshold", "365")
    }

    override fun isModified(): Boolean {
        val props = PropertiesComponent.getInstance()
        return String(openaiApiKeyField.password) != (VestigeAIService.getApiKey() ?: "") ||
               collabWebhookUrlField.text != props.getValue("vestige.collabWebhookUrl", "") ||
               enabledCheckbox.isSelected != props.getBoolean("vestige.enabled", true) ||
               churnThresholdField.text != props.getValue("vestige.churnThreshold", "10") ||
               fossilThresholdField.text != props.getValue("vestige.fossilThreshold", "365")
    }

    override fun apply() {
        val props = PropertiesComponent.getInstance()
        VestigeAIService.setApiKey(String(openaiApiKeyField.password))
        props.setValue("vestige.collabWebhookUrl", collabWebhookUrlField.text)
        props.setValue("vestige.enabled", enabledCheckbox.isSelected.toString())
        props.setValue("vestige.churnThreshold", churnThresholdField.text)
        props.setValue("vestige.fossilThreshold", fossilThresholdField.text)
    }

    override fun getDisplayName(): String = "Vestige"
}
