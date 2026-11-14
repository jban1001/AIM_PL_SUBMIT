import javax.inject.Inject
import org.gradle.process.ExecOperations

plugins {
    id("com.android.application") version "9.2.1"
}

abstract class BundleWeb @Inject constructor(
    private val execOperations: ExecOperations,
) : DefaultTask() {
    @get:Internal
    abstract val webProjectDirectory: DirectoryProperty

    @get:OutputDirectory
    abstract val assetsDirectory: DirectoryProperty

    @TaskAction
    fun bundle() {
        execOperations.exec {
            workingDir(webProjectDirectory.get().asFile)
            commandLine(
                "node", "node_modules/vite/bin/vite.js", "build",
                "--base", "/assets/web/",
                "--outDir", assetsDirectory.get().dir("web").asFile.absolutePath,
                "--emptyOutDir",
            )
        }
    }
}

val webProject = rootProject.projectDir.parentFile
val bundleWeb by tasks.registering(BundleWeb::class) {
    webProjectDirectory.set(webProject)
    assetsDirectory.set(layout.buildDirectory.dir("generated/webAssets"))
    inputs.files(
        webProject.resolve("src"),
        webProject.resolve("public"),
        webProject.resolve("index.html"),
        webProject.resolve("vite.config.ts"),
        webProject.resolve("package.json"),
        webProject.resolve("pnpm-lock.yaml"),
    )
}

android {
    namespace = "com.aim.gazee"
    useLibrary("android.car")
    compileSdk {
        version = release(36) { minorApiLevel = 1 }
    }

    defaultConfig {
        applicationId = "com.aim.gazee"
        minSdk = 28
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            // Contest submission: an installable release APK that keeps the
            // emulator demo mode (gated on FLAG_DEBUGGABLE in MainActivity).
            signingConfig = signingConfigs.getByName("debug")
            isDebuggable = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

androidComponents.onVariants { variant ->
    variant.sources.assets?.addGeneratedSourceDirectory(bundleWeb, BundleWeb::assetsDirectory)
}

dependencies {
    constraints {
        implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.6.4")
        implementation("androidx.lifecycle:lifecycle-runtime:2.6.1")
        implementation("androidx.arch.core:core-common:2.2.0")
        implementation("androidx.collection:collection:1.1.0")
        implementation("ai.pleos.playground:TextToSpeech:3.3.1")
        implementation("ai.pleos.playground:SpeechToText:3.3.1")
    }
    implementation("androidx.core:core-ktx:1.10.1")
    implementation("ai.pleos.playground:TextToSpeech:3.3.1")
    implementation("ai.pleos.playground:SpeechToText:3.3.1")
}
