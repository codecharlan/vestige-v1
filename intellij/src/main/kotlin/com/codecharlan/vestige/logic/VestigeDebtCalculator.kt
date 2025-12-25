package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.vfs.VirtualFile
import kotlin.math.ln
import kotlin.math.max

@Service(Service.Level.PROJECT)
class VestigeDebtCalculator(private val gitAnalyzer: VestigeGitAnalyzer) {

    data class DebtForecast(
        val score: Double,
        val cost: Int,
        val increasePercent: Int
    )

    fun calculateDebt(file: VirtualFile): Double {
        return gitAnalyzer.calculateTechnicalDebt(file)
    }

    fun forecastDebtHorizon(file: VirtualFile, days: Int = 180): DebtForecast? {
        val stats = gitAnalyzer.getFileStats(file) ?: return null
        val currentDebtScore = calculateDebt(file)
        
        val velocity = stats.commits.toDouble() / max(1.0, stats.ageDays.toDouble())
        val predictedChurn = stats.commits + (velocity * days)

        // Ported heuristic logic
        val lineCount = try { String(file.contentsToByteArray()).lines().size } catch (e: Exception) { 100 }
        val complexityFactor = lineCount / 100.0
        val churnFactor = max(1.0, predictedChurn / 5.0)
        val ageFactor = max(1.0, (stats.ageDays + days) / 30.0)

        val predictedScore = complexityFactor * churnFactor * ln(ageFactor + 1.0)
        val predictedCost = (predictedScore * 50).toInt()
        val increasePercent = if (currentDebtScore > 0) {
            (((predictedScore - currentDebtScore) / currentDebtScore) * 100).toInt()
        } else 0

        return DebtForecast(
            score = predictedScore,
            cost = predictedCost,
            increasePercent = increasePercent
        )
    }
}
