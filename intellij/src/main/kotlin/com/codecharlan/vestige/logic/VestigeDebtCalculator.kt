package com.codecharlan.vestige.logic

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Computes the relative technical-debt score for a file.
 *
 * The score is **unitless and only comparable within this repository**. It used
 * to also report a `cost` field of `score * 50` — a made-up hourly rate times an
 * already-arbitrary score, presented to the user as money. Nothing in the plugin
 * knows anyone's rate, how long a remediation would take, or whether the debt is
 * worth paying down at all, so no currency or hour figure can be derived here.
 * The score is kept as a ranking signal and is reported alongside the three
 * inputs that produced it, so a reader can judge the number instead of trusting
 * it.
 */
@Service(Service.Level.PROJECT)
class VestigeDebtCalculator(private val project: Project) {

    private val gitAnalyzer: VestigeGitAnalyzer by lazy { project.getService(VestigeGitAnalyzer::class.java) }

    /**
     * A projected debt score plus the inputs it was derived from.
     *
     * @param score projected relative score at the end of the horizon
     * @param currentScore relative score as of today, for comparison
     * @param increasePercent change from [currentScore] to [score]
     * @param horizonDays how far ahead the projection runs
     * @param commits commits observed so far (churn input)
     * @param projectedCommits commits expected by the end of the horizon
     * @param lineCount file size input
     * @param ageDays age input, in days, as of today
     */
    data class DebtForecast(
        val score: Double,
        val currentScore: Double,
        val increasePercent: Int,
        val horizonDays: Int,
        val commits: Int,
        val projectedCommits: Int,
        val lineCount: Int,
        val ageDays: Int
    ) {
        /**
         * States the score and the churn/size/age inputs behind it. Deliberately
         * carries no unit: this is a within-repo ranking signal, not a quantity
         * of money or time.
         */
        fun describe(): String = String.format(
            "Score %.1f (relative, this repo only) — from %d commits over %d days across %d lines",
            score, projectedCommits, ageDays + horizonDays, lineCount
        )
    }

    fun calculateDebt(file: VirtualFile): Double {
        return gitAnalyzer.calculateTechnicalDebt(file)
    }

    fun forecastDebtHorizon(file: VirtualFile, days: Int = 180): DebtForecast? {
        val stats = gitAnalyzer.getFileStats(file) ?: return null
        val currentDebtScore = calculateDebt(file)

        val velocity = stats.commits.toDouble() / max(1.0, stats.ageDays.toDouble())
        val predictedChurn = stats.commits + (velocity * days)

        val lineCount = try { String(file.contentsToByteArray()).lines().size } catch (e: Exception) { 100 }
        val complexityFactor = lineCount / 100.0
        val churnFactor = max(1.0, predictedChurn / 5.0)
        val ageFactor = max(1.0, (stats.ageDays + days) / 30.0)

        val predictedScore = complexityFactor * churnFactor * ln(ageFactor + 1.0)
        val increasePercent = if (currentDebtScore > 0) {
            (((predictedScore - currentDebtScore) / currentDebtScore) * 100).toInt()
        } else 0

        return DebtForecast(
            score = predictedScore,
            currentScore = currentDebtScore,
            increasePercent = increasePercent,
            horizonDays = days,
            commits = stats.commits,
            projectedCommits = predictedChurn.roundToInt(),
            lineCount = lineCount,
            ageDays = stats.ageDays
        )
    }
}
