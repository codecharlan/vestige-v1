package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.codecharlan.vestige.logic.VestigeSmartNotifications

@Service(Service.Level.PROJECT)
class OracleService(private val project: Project) {

    fun checkSemanticDrift(file: VirtualFile) {
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)
        val coupledFiles = analyzer.getCoupledFiles(file)
        
        if (coupledFiles.isEmpty()) return

        // Filter for files with high coupling (> 60%)
        val highlyCoupled = coupledFiles.filter { it.frequency > 60 }
        
        if (highlyCoupled.isNotEmpty()) {
            val notifications = project.getService(VestigeSmartNotifications::class.java)
            val fileNames = highlyCoupled.joinToString(", ") { it.file.substringAfterLast("/") }
            
            notifications.showInfo(
                "Oracle Prediction: Semantic Drift",
                "Modification detected. Highly coupled files ($fileNames) haven't changed in the last 3 epochs. Possible architectural drift."
            )
        }
    }
}
