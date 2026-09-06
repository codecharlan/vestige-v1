package com.codecharlan.vestige.logic

import com.intellij.ide.util.PropertiesComponent
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project

@Service(Service.Level.PROJECT)
class VestigeAchievementService(private val project: Project) {

    enum class Achievement(
        val id: String,
        val displayName: String,
        val description: String,
        val requirement: Int
    ) {
        FOSSIL_HUNTER("fossil_hunter", "🗿 Fossil Hunter", "View a file older than 5 years", 1),
        TIME_TRAVELER("time_traveler", "🎬 Time Traveler", "Use the evolution slider 10 times", 10),
        GRAVEDIGGER("gravedigger", "💀 Gravedigger", "View a deleted file in the graveyard", 1),
        TEAM_PLAYER("team_player", "👥 Team Player", "Edit a file with Bus Factor of 1", 1),
        DATA_SCIENTIST("data_scientist", "📊 Data Scientist", "View the dashboard 5 times", 5);
    }

    private val properties = PropertiesComponent.getInstance(project)

    fun trackAction(id: String, value: Int = 1) {
        val current = properties.getInt("vestige.stats.$id", 0)
        val newValue = current + value
        properties.setValue("vestige.stats.$id", newValue, 0)
        
        addCredits(value * 10)
        checkAchievements(id, newValue)
    }

    private fun addCredits(amount: Int) {
        val current = getCredits()
        properties.setValue("vestige.credits", current + amount, 0)
    }

    fun getCredits(): Int = properties.getInt("vestige.credits", 0)

    private fun checkAchievements(id: String, count: Int) {
        val unlocked = properties.getList("vestige.unlocked")?.toMutableList() ?: mutableListOf()
        
        Achievement.values().forEach { achievement ->
            if (achievement.id == id && count >= achievement.requirement && !unlocked.contains(achievement.id)) {
                unlocked.add(achievement.id)
                properties.setList("vestige.unlocked", unlocked)
                notifyUnlocked(achievement)
            }
        }
    }

    /**
     * Shows a non-modal balloon notification, always on the EDT (this service can be
     * called from background analysis threads).
     */
    private fun notifyUnlocked(achievement: Achievement) {
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed) return@invokeLater
            NotificationGroupManager.getInstance()
                .getNotificationGroup("VestigeNotifications")
                .createNotification(
                    "Vestige",
                    "🎉 Achievement Unlocked: ${achievement.displayName}",
                    NotificationType.INFORMATION
                )
                .notify(project)
        }
    }

    fun isFeatureUnlocked(featureId: String): Boolean {
        val unlocked = properties.getList("vestige.unlocked") ?: emptyList<String>()
        val credits = getCredits()
        
        return when (featureId) {
            "aiArchaeologist" -> credits >= 1000
            "timeMachine" -> unlocked.contains("time_traveler")
            else -> true
        }
    }
}
