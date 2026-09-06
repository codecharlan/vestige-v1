package com.codecharlan.vestige.perf

import com.codecharlan.vestige.logic.VestigeGitAnalyzer
import com.codecharlan.vestige.logic.VestigeSimilarityRadar
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.util.ProgressIndicatorBase
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.Assert
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Guards the fix for the IDE freezes.
 *
 * The freeze was never "analysis is slow" on its own — it was that the analysis
 * held the read lock and could not be interrupted. A keystroke needs the write
 * lock, and the write lock waits for every read action to *release*, which only
 * happens when the work returns or throws at a cancellation check. The plugin
 * had three such checks, and several `catch` blocks swallowed
 * `ProcessCanceledException`, so a multi-second analysis blocked typing for its
 * entire duration.
 *
 * The load-bearing assertions here are therefore not stopwatches: they check
 * that the heavy paths *abort* when the progress indicator is cancelled. Remove
 * the `checkCanceled()` calls, or put a broad `catch (e: Exception)` ahead of
 * the PCE rethrow, and these fail — even though the code still compiles and
 * still returns correct results.
 *
 * The timing assertions are deliberately loose. They exist to catch a return to
 * per-commit tree diffs (the old `generateOnboardingTour` ran a full diff for
 * every commit pair, on every tab switch and every save), not to police small
 * regressions on shared hardware.
 *
 * The analyzer only resolves repositories inside `project.basePath`, so the
 * fixture builds its history there. The history is built once for the class and
 * copied per test, because spawning two git processes per commit per test
 * dominates the runtime otherwise.
 */
class AnalysisResponsivenessTest : BasePlatformTestCase() {

    companion object {
        /** Deep enough that an O(commits) tree-diff regression is unmistakable. */
        private const val COMMIT_COUNT = 60

        /** Built once, copied into each test's project directory. */
        private val template: File by lazy { buildTemplateRepository() }

        private fun git(dir: File, vararg command: String) {
            val process = ProcessBuilder(*command)
                .directory(dir)
                .redirectErrorStream(true)
                .start()
            if (!process.waitFor(60, TimeUnit.SECONDS)) {
                process.destroyForcibly()
                error("git timed out: ${command.joinToString(" ")}")
            }
            check(process.exitValue() == 0) {
                "git failed: ${command.joinToString(" ")}\n" +
                    process.inputStream.bufferedReader().readText()
            }
        }

        /**
         * Real depth and real co-change: auth.kt and its test move together,
         * while an unrelated file churns on its own schedule.
         */
        private fun buildTemplateRepository(): File {
            val dir = java.nio.file.Files.createTempDirectory("vestige-perf-template").toFile()
            File(dir, "src").mkdirs()
            git(dir, "git", "init", "-q")
            git(dir, "git", "config", "user.email", "dev@example.com")
            git(dir, "git", "config", "user.name", "Dana Dev")
            git(dir, "git", "config", "commit.gpgsign", "false")

            repeat(COMMIT_COUNT) { i ->
                File(dir, "src/auth.kt").writeText(
                    (0..40).joinToString("\n") { line -> "fun auth$line() = $i + $line" }
                )
                if (i % 2 == 0) {
                    File(dir, "src/authTest.kt").writeText("fun testAuth() = check(auth0() == $i)")
                }
                if (i % 5 == 0) {
                    File(dir, "src/unrelated.kt").writeText("val unrelated = $i")
                }
                git(dir, "git", "add", "-A")
                git(dir, "git", "commit", "-q", "-m", "change $i")
            }
            Runtime.getRuntime().addShutdownHook(Thread { dir.deleteRecursively() })
            return dir
        }
    }

    private lateinit var target: VirtualFile

    override fun setUp() {
        super.setUp()
        val base = File(project.basePath ?: error("no project base path"))
        template.copyRecursively(base, overwrite = true)

        val authFile = File(base, "src/auth.kt")
        check(authFile.isFile) { "fixture repository was not copied" }
        check(File(base, ".git").isDirectory) { "fixture .git was not copied" }

        target = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(authFile)
            ?: error("could not resolve ${authFile.path} through the VFS")
    }

    private fun analyzer() = project.getService(VestigeGitAnalyzer::class.java)

    /**
     * Runs [work] under an already-cancelled indicator and reports whether it
     * aborted.
     *
     * The warm-up call matters and is not incidental. `getGitRepo` performs its
     * own `checkCanceled()` while walking up to the repository root, but returns
     * early — before that check — once its cache is populated. Without warming,
     * every one of these assertions would pass on that single check alone, even
     * if the per-commit and per-line loops polled nothing. Warming first means a
     * `ProcessCanceledException` can only have come from the deep loops, which
     * is exactly the property that was missing when the IDE froze.
     */
    private fun abortsWhenCancelled(work: () -> Unit): Boolean {
        work() // warm the repository cache; also proves the path succeeds normally

        val indicator = ProgressIndicatorBase()
        indicator.start()
        indicator.cancel()
        return try {
            ProgressManager.getInstance().runProcess(work, indicator)
            false
        } catch (expected: ProcessCanceledException) {
            true
        }
    }

    private fun timeMillis(work: () -> Unit): Long {
        val started = System.nanoTime()
        work()
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)
    }

    // ── Correctness first: a fast wrong answer is not a fix ──────────────

    fun testAnalysisProducesResultsOnADeepHistory() {
        val stats = analyzer().analyzeFile(target, force = true)
        Assert.assertNotNull("a tracked file in a real repository must analyse", stats)
        Assert.assertTrue(
            "commit count should reflect the repository, got ${stats!!.commits}",
            stats.commits > 1
        )
    }

    fun testCoChangePartnerIsFound() {
        // authTest.kt was committed alongside auth.kt on every second commit.
        val coupled = analyzer().getCoupledFiles(target)
        Assert.assertTrue(
            "co-change must find the partner file, got ${coupled.map { it.file }}",
            coupled.any { it.file.endsWith("authTest.kt") }
        )
    }

    // ── The actual freeze guard ─────────────────────────────────────────

    fun testFileAnalysisAbortsWhenCancelled() {
        Assert.assertTrue(
            "analyzeFile must poll for cancellation — without it a keystroke waits " +
                "for the entire analysis to finish",
            abortsWhenCancelled { analyzer().analyzeFile(target, force = true) }
        )
    }

    fun testOnboardingTourAbortsWhenCancelled() {
        Assert.assertTrue(
            "generateOnboardingTour must poll for cancellation; it runs on every " +
                "tab switch and every save",
            abortsWhenCancelled { analyzer().generateOnboardingTour(target) }
        )
    }

    fun testBusFactorAbortsWhenCancelled() {
        Assert.assertTrue(
            "calculateBusFactor must poll for cancellation",
            abortsWhenCancelled { analyzer().calculateBusFactor(target) }
        )
    }

    fun testDuplicateScanAbortsWhenCancelled() {
        val radar = project.getService(VestigeSimilarityRadar::class.java)

        // This path needs its own warm-up handling: the index is cached for
        // several minutes, so a second call does no work and there would be
        // nothing to cancel. Build it once to prove it works, then invalidate
        // so the cancelled run has a real index build to abort.
        radar.duplicateWindowRatio()
        radar.invalidate()

        val indicator = ProgressIndicatorBase()
        indicator.start()
        indicator.cancel()
        val aborted = try {
            ProgressManager.getInstance().runProcess({ radar.duplicateWindowRatio() }, indicator)
            false
        } catch (expected: ProcessCanceledException) {
            true
        }

        Assert.assertTrue(
            "the duplicate-code index build must poll for cancellation — this scan " +
                "was the single largest contributor to the freeze",
            aborted
        )
    }

    // ── Loose upper bounds: catch a return to per-commit tree diffs ──────

    fun testOnboardingTourDoesNotScaleWithCommitCount() {
        val elapsed = timeMillis { analyzer().generateOnboardingTour(target) }
        Assert.assertTrue(
            "onboarding tour took ${elapsed}ms over $COMMIT_COUNT commits — that is " +
                "the signature of per-commit tree diffs returning",
            elapsed < 15_000
        )
    }

    fun testRepeatedAnalysisIsServedFromCache() {
        analyzer().analyzeFile(target, force = true)
        val cached = timeMillis { analyzer().analyzeFile(target) }
        Assert.assertTrue(
            "a second analysis of an unchanged file took ${cached}ms; it should come " +
                "from cache rather than re-walking history",
            cached < 2_000
        )
    }
}
