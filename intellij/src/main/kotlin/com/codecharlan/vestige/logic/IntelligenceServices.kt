package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.*

@Service(Service.Level.PROJECT)
class VestigeHandoffAssistant(private val project: Project) {

    data class OrphanageRisk(
        val file: String,
        val topAuthor: String,
        val status: String, // "Active", "Inactive", "Orphaned"
        val riskScore: Int
    )

    fun identifyRisks(): List<OrphanageRisk> {
        val analyzer = project.service<VestigeGitAnalyzer>()
        val risks = mutableListOf<OrphanageRisk>()
        
        // Get all files in the project (simplified - in real implementation, you'd want to filter this)
        // Get all files in the project
        val baseDir = project.basePath?.let { com.intellij.openapi.vfs.LocalFileSystem.getInstance().findFileByPath(it) }
        val files = baseDir?.children?.filter { 
            !it.name.startsWith(".") && !it.isDirectory 
        }?.take(10) ?: return emptyList()
        
        files.forEach { file ->
            val stats = analyzer.analyzeFile(file) ?: return@forEach
            
            // Calculate risk based on ownership and last modified date
            val lastModified = stats.lastModifiedDate.toInstant()
                .atZone(ZoneId.systemDefault())
                .toLocalDate()
            val monthsSinceLastUpdate = ChronoUnit.MONTHS.between(
                lastModified,
                LocalDate.now()
            )
            
            // Risk if top author owns > 70% and hasn't committed in > 6 months
            val isHighRisk = stats.ownershipPercent > 70 && monthsSinceLastUpdate > 6
            
            val status = when {
                isHighRisk -> "Orphaned"
                stats.ownershipPercent > 50 -> "At Risk"
                else -> "Active"
            }
            
            risks.add(OrphanageRisk(
                file = file.path,
                topAuthor = stats.topAuthor,
                status = status,
                riskScore = (stats.ownershipPercent * 0.7 + 
                           if (isHighRisk) 30 else 0).toInt()
            ))
        }
        return risks.sortedByDescending { it.riskScore }
    }
}

@Service(Service.Level.PROJECT)
class VestigeMentorshipMatcher(private val project: Project) {
    
    data class Match(
        val expert: String,
        val proximity: Int,
        val reason: String
    )

    fun findExpertsForFile(file: VirtualFile): List<Match> {
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)
        val busInfo = analyzer.calculateBusFactor(file)
        
        return busInfo.contributors.take(3).map { contrib ->
            Match(
                expert = contrib.name,
                proximity = contrib.percent,
                reason = "Owns ${contrib.percent}% of the historical traces in this file."
            )
        }
    }
}
