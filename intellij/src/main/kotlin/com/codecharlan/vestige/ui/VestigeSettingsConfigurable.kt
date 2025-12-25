package com.codecharlan.vestige.ui

import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.options.Configurable
import javax.swing.*
import java.awt.*

class VestigeSettingsConfigurable : Configurable {
    private var openaiApiKeyField = JTextField()
    private var enabledCheckbox = JCheckBox("Enable Vestige Annotations", true)
    private var churnThresholdField = JTextField("10")
    private var fossilThresholdField = JTextField("365")
    private var collabWebhookUrlField = JTextField()

    override fun createComponent(): JComponent {
        val panel = JPanel(GridLayout(5, 2))
        panel.add(JLabel("OpenAI API Key:"))
        panel.add(openaiApiKeyField)
        panel.add(JLabel("Collab Webhook URL:"))
        panel.add(collabWebhookUrlField)
        panel.add(JLabel(""))
        panel.add(enabledCheckbox)
        panel.add(JLabel("High Churn Threshold:"))
        panel.add(churnThresholdField)
        panel.add(JLabel("Fossil Age (Days):"))
        panel.add(fossilThresholdField)
        
        loadSettings()
        return panel
    }

    private fun loadSettings() {
        val props = PropertiesComponent.getInstance()
        openaiApiKeyField.text = props.getValue("vestige.openaiApiKey", "")
        collabWebhookUrlField.text = props.getValue("vestige.collabWebhookUrl", "")
        enabledCheckbox.isSelected = props.getBoolean("vestige.enabled", true)
        churnThresholdField.text = props.getValue("vestige.churnThreshold", "10")
        fossilThresholdField.text = props.getValue("vestige.fossilThreshold", "365")
    }

    override fun isModified(): Boolean {
        val props = PropertiesComponent.getInstance()
        return openaiApiKeyField.text != props.getValue("vestige.openaiApiKey", "") ||
               collabWebhookUrlField.text != props.getValue("vestige.collabWebhookUrl", "") ||
               enabledCheckbox.isSelected != props.getBoolean("vestige.enabled", true) ||
               churnThresholdField.text != props.getValue("vestige.churnThreshold", "10") ||
               fossilThresholdField.text != props.getValue("vestige.fossilThreshold", "365")
    }

    override fun apply() {
        val props = PropertiesComponent.getInstance()
        props.setValue("vestige.openaiApiKey", openaiApiKeyField.text)
        props.setValue("vestige.collabWebhookUrl", collabWebhookUrlField.text)
        props.setValue("vestige.enabled", enabledCheckbox.isSelected.toString())
        props.setValue("vestige.churnThreshold", churnThresholdField.text)
        props.setValue("vestige.fossilThreshold", fossilThresholdField.text)
    }

    override fun getDisplayName(): String = "Vestige"
}
