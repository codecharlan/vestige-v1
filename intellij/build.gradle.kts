plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.10"
    id("org.jetbrains.intellij") version "1.15.0"
    id("com.github.johnrengelman.shadow") version "7.1.2"
}

// Set the platform version for dependencies
val platformVersion = "2023.2.1"

// Plugin version
val pluginVersion = "1.1.1"

group = "com.codecharlan"
version = pluginVersion

repositories {
    mavenCentral()
}

dependencies {
    // Kotlin dependencies - provided by IDE Platform
    compileOnly(kotlin("stdlib"))
    compileOnly("org.jetbrains.kotlin:kotlin-reflect")
    
    // Coroutines - compileOnly: the IntelliJ Platform provides (patched) coroutines,
    // and JetBrains forbids plugins from bundling their own copy.
    compileOnly("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    
    // JGit for Git operations
    implementation("org.eclipse.jgit:org.eclipse.jgit:6.5.0.202303070854-r") {
        exclude(group = "org.slf4j")
        exclude(group = "log4j")
    }
    
    // Test dependencies
    testImplementation("org.junit.jupiter:junit-jupiter:5.8.2")
    testImplementation("org.mockito.kotlin:mockito-kotlin:4.0.0")
}



// Configure Gradle IntelliJ Plugin
// Read more: https://github.com/JetBrains/gradle-intellij-plugin
intellij {
    version.set(platformVersion)
    type.set("IC") // Target IDE Platform
    
    // Only specify plugins that are not part of the platform
    plugins.set(listOf("java", "Git4Idea"))
    
    // Plugin configuration
    pluginName.set("Vestige")
    
    // Version control
    updateSinceUntilBuild.set(true)
    
    // Download sources
    downloadSources.set(true)
    
    // Sandbox configuration (under the build directory)
    sandboxDir.set(layout.buildDirectory.dir("idea-sandbox").get().asFile.absolutePath)
    
    // Repositories
    repositories {
        mavenCentral()
        maven("https://www.jetbrains.com/intellij-repository/releases")
    }
    
    instrumentCode.set(false)
}

tasks {
    buildSearchableOptions {
        enabled = false
    }

    // Set the JVM compatibility versions
    withType<JavaCompile> {
        sourceCompatibility = "17"
        targetCompatibility = "17"
    }
    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        kotlinOptions.jvmTarget = "17"
    }

    shadowJar {
        archiveClassifier.set("")
        relocate("org.eclipse.jgit", "com.codecharlan.vestige.shaded.jgit")
    }

    prepareSandbox {
        pluginJar.set(shadowJar.flatMap { it.archiveFile })
        // The shadow jar already contains (relocated) JGit; do not also ship the
        // unshaded runtime libraries (jgit, coroutines, ...) alongside it.
        exclude { element ->
            element.name.startsWith("org.eclipse.jgit") ||
                element.name.startsWith("kotlinx-coroutines")
        }
    }

    // Binary-compatibility check against the IDE range this plugin claims to
    // support. The declared range (232 -> 252.*) is far wider than the platform
    // it compiles against, so this is the check that catches a broken release
    // before the Marketplace does. Override with -PverifyIdes=IC-2024.3,IC-2025.2
    runPluginVerifier {
        val requested = (project.findProperty("verifyIdes") as String?)
            ?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }
        ideVersions.set(requested ?: listOf("IC-2023.2.1"))
        failureLevel.set(
            listOf(
                org.jetbrains.intellij.tasks.RunPluginVerifierTask.FailureLevel.COMPATIBILITY_PROBLEMS,
                org.jetbrains.intellij.tasks.RunPluginVerifierTask.FailureLevel.INVALID_PLUGIN
            )
        )
    }

    patchPluginXml {
        sinceBuild.set("232")

        // No upper bound, deliberately.
        //
        // 1.1.0 declared `untilBuild = "252.*"` and IntelliJ 2025.3 (build 253)
        // therefore refused to install it — users saw "Not compatible with the
        // version of your running IDE" for a plugin that in fact works fine on
        // it. An upper bound is only protection if it tracks reality, and a
        // hardcoded one silently becomes a wall on every IDE release.
        //
        // The Plugin Verifier reports no internal, experimental,
        // non-extendable or override-only platform API usage anywhere in this
        // plugin — it is entirely on stable public API — which is the condition
        // under which JetBrains recommends omitting the upper bound. Verified
        // Compatible against 232, 252 and 253.
        //
        // If a future platform release does break something, pin this again
        // rather than leaving users with runtime exceptions.
        untilBuild.set(provider { null })
    }

    signPlugin {
        certificateChain.set(System.getenv("CERTIFICATE_CHAIN"))
        privateKey.set(System.getenv("PRIVATE_KEY"))
        password.set(System.getenv("PRIVATE_KEY_PASSWORD"))
    }

    publishPlugin {
        token.set(System.getenv("PUBLISH_TOKEN"))
    }
}
