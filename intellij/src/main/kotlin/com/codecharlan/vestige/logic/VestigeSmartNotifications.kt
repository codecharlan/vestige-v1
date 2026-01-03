package com.codecharlan.vestige.logic

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

/**
 * Smart notification system that provides contextual, non-intrusive hints
 * to developers about their code without requiring any manual actions.
 */
@Service(Service.Level.PROJECT)
class VestigeSmartNotifications(private val project: Project) {
    
    private val notificationGroup = NotificationGroupManager.getInstance()
        .getNotificationGroup("VestigeNotifications")
    
    private var lastNotificationTime = mutableMapOf<String, Long>()
    private val notificationCooldown = 30000L // 30 seconds between similar notifications
    
    /**
     * Show contextual notification based on file analysis
     */
    fun showContextualHint(file: VirtualFile, analysis: VestigeService.AnalysisResult) {
        val key = file.path
        val now = System.currentTimeMillis()
        
        // Check cooldown
        if (lastNotificationTime[key] != null && now - lastNotificationTime[key]!! < notificationCooldown) {
            return
        }
        
        val message = buildContextualMessage(file, analysis)
        if (message != null) {
            notificationGroup.createNotification(
                "Vestige Insight",
                message,
                NotificationType.INFORMATION
            ).notify(project)
            lastNotificationTime[key] = now
        }
    }
    
    private fun buildContextualMessage(
        file: VirtualFile,
        analysis: VestigeService.AnalysisResult
    ): String? {
        val realTime = analysis.realTimeStats
        val stats = analysis.stats
        
        return when {
            // New file detected
            realTime?.isNewFile == true -> {
                "✨ New file detected! This file isn't in git yet. Consider committing it soon."
            }
            
            // High complexity detected
            realTime != null && realTime.complexity > 50 -> {
                "⚙️ High complexity detected (${realTime.complexity}). Consider refactoring for better maintainability."
            }
            
            // Large file detected
            realTime != null && realTime.lineCount > 500 -> {
                "📄 Large file detected (${realTime.lineCount} lines). Consider splitting into smaller modules."
            }
            
            // High churn file
            stats != null && stats.commits > 20 -> {
                "🔥 High churn file (${stats.commits} commits). This file changes frequently - might need attention."
            }
            
            // Fossil code
            stats != null && stats.ageDays > 365 -> {
                "🗿 Fossil code detected (${stats.ageDays} days old). Consider reviewing for modernization."
            }
            
            // Low bus factor
            analysis.busFactor?.risk == "critical" -> {
                "⚠️ Low bus factor detected. Only ${analysis.busFactor?.busFactor ?: 1} contributor(s) know this code well."
            }
            
            // High technical debt
            analysis.debt > 50.0 -> {
                "📈 High technical debt detected (${String.format("%.1f", analysis.debt)}). Consider addressing technical debt."
            }
            
            // Healthy file
            realTime?.codeHealth == "Healthy" && stats != null -> {
                null // Don't notify for healthy files
            }
            
            else -> null
        }
    }
    
    /**
     * Show achievement-style notification for positive actions
     */
    fun showAchievement(message: String, icon: String = "🎉") {
        notificationGroup.createNotification(
            "$icon Vestige Achievement",
            message,
            NotificationType.INFORMATION
        ).notify(project)
    }
    
    /**
     * Show info notification
     */
    fun showInfo(title: String, message: String) {
        notificationGroup.createNotification(
            title,
            message,
            NotificationType.INFORMATION
        ).notify(project)
    }
    
    /**
     * Show helpful tip about Vestige features
     */
    fun showTip() {
        val tips = listOf(
            "💡 Tip: Press Ctrl+Alt+V to open the Vestige command palette",
            "💡 Tip: Vestige works with unsaved files - no commits needed!",
            "💡 Tip: Check the status bar for real-time file statistics",
            "💡 Tip: Use the Timeline tab to explore file history",
            "💡 Tip: Files are automatically analyzed as you code"
        )
        
        val randomTip = tips.random()
        notificationGroup.createNotification(
            "Vestige Tip",
            randomTip,
            NotificationType.INFORMATION
        ).notify(project)
    }
}

