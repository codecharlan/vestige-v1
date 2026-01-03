plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.10"
    id("org.jetbrains.intellij") version "1.15.0"
    id("com.github.johnrengelman.shadow") version "7.1.2"
}

// Set the platform version for dependencies
val platformVersion = "2023.2.1"

// Plugin version
val pluginVersion = "1.0.6.1"

group = "com.codecharlan"
version = pluginVersion

repositories {
    mavenCentral()
}

dependencies {
    // Kotlin dependencies - provided by IDE Platform
    compileOnly(kotlin("stdlib"))
    compileOnly("org.jetbrains.kotlin:kotlin-reflect")
    
    // Coroutines - exclude stdlib to use platform's
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3") {
        exclude(group = "org.jetbrains.kotlin")
    }
    
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
    
    // Sandbox configuration
    sandboxDir.set("${'$'}{rootProject.rootDir}/.sandbox")
    
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
    }

    patchPluginXml {
        sinceBuild.set("232")
        untilBuild.set("252.*")
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
