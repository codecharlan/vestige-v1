package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import java.util.*

@Service(Service.Level.PROJECT)
class VestigeButterflyEffectAnalyzer(private val project: Project) {

    data class ImpactNode(
        val filePath: String,
        val probability: Double,
        val risk: String
    )

    fun predictImpact(file: VirtualFile): List<ImpactNode> {
        val analyzer = project.getService(VestigeGitAnalyzer::class.java)
        val coupled = analyzer.getCoupledFiles(file)
        
        return coupled.map { info ->
            val probability = info.frequency / 100.0
            val risk = when {
                probability > 0.7 -> "Critical"
                probability > 0.4 -> "High"
                else -> "Moderate"
            }
            ImpactNode(info.file, probability, risk)
        }
    }
}
