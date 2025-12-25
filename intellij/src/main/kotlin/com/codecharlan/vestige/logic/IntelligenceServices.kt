package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import git4idea.repo.GitRepositoryManager

@Service(Service.Level.PROJECT)
class VestigeHandoffAssistant(private val project: Project) {

    data class OrphanageRisk(
        val file: String,
        val topAuthor: String,
        val status: String, // "Active", "Inactive", "Orphaned"
        val riskScore: Int
    )

    fun identifyRisks(): List<OrphanageRisk> {
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)
        val roots = GitRepositoryManager.getInstance(project).repositories
        val risks = mutableListOf<OrphanageRisk>()

        roots.forEach { repo ->
            // In a real impl, we'd scan all files. For simulation, pick key files.
            val files = repo.root.children.filter { !it.name.startsWith(".") }.take(10)
            files.forEach { file ->
                val busInfo = analyzer.calculateBusFactor(file)
                val stats = analyzer.getFileStats(file) ?: return@forEach
                
                // Risk if top author owns > 70% and hasn't committed in > 6 months
                val score = if (stats.ownershipPercent > 70 && stats.ageDays > 180) 100 else 40
                val status = if (score > 80) "Orphaned" else "Safe"
                
                risks.add(OrphanageRisk(file.name, stats.topAuthor, status, score))
            }
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
