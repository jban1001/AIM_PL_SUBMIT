import java.net.URI
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import javax.inject.Inject
import org.gradle.api.file.ArchiveOperations
import org.gradle.api.file.FileSystemOperations
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

abstract class BundleKoreanModel @Inject constructor(
    private val archives: ArchiveOperations,
    private val files: FileSystemOperations,
) : DefaultTask() {
    @get:Internal
    abstract val cacheDirectory: DirectoryProperty

    @get:OutputDirectory
    abstract val assetsDirectory: DirectoryProperty

    @TaskAction
    fun bundle() {
        val model = "vosk-model-small-ko-0.22"
        val checksum = "eea36124087fed26c59996a4761519458e3bd185e8ea9d9865ad8760c4a1d989"
        val archive = cacheDirectory.get().file("$model.zip").asFile
        if (!archive.isFile) {
            archive.parentFile.mkdirs()
            val pending = temporaryDir.resolve("$model.zip.part")
            URI("https://alphacephei.com/vosk/models/$model.zip").toURL().openConnection().apply {
                connectTimeout = 15_000
                readTimeout = 30_000
            }.getInputStream().use { input ->
                Files.copy(input, pending.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
            check(sha256(pending) == checksum) { "Unexpected Korean speech model checksum." }
            Files.move(pending.toPath(), archive.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
        check(sha256(archive) == checksum) { "Unexpected Korean speech model checksum." }
        files.sync {
            from(archives.zipTree(archive))
            into(assetsDirectory.get().asFile)
        }
        assetsDirectory.get().file("$model/uuid").asFile.writeText(checksum)
    }

    private fun sha256(file: File): String =
        MessageDigest.getInstance("SHA-256").digest(file.readBytes()).joinToString("") { "%02x".format(it) }
}

val bundleKoreanModel by tasks.registering(BundleKoreanModel::class) {
    cacheDirectory.set(rootProject.layout.projectDirectory.dir(".gradle/gazee-voice"))
    assetsDirectory.set(layout.buildDirectory.dir("generated/koreanModelAssets"))
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

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

androidComponents.onVariants { variant ->
    variant.sources.assets?.addGeneratedSourceDirectory(bundleWeb, BundleWeb::assetsDirectory)
    variant.sources.assets?.addGeneratedSourceDirectory(bundleKoreanModel, BundleKoreanModel::assetsDirectory)
}

dependencies {
    constraints {
        implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.6.4")
        implementation("androidx.lifecycle:lifecycle-runtime:2.6.1")
        implementation("androidx.arch.core:core-common:2.2.0")
        implementation("androidx.collection:collection:1.1.0")
    }
    implementation("androidx.core:core-ktx:1.10.1")
    implementation("ai.pleos.playground:TextToSpeech:3.3.1")
    implementation("ai.pleos.playground:SpeechToText:3.3.1")
    implementation("net.java.dev.jna:jna:5.18.1@aar")
    implementation("com.alphacephei:vosk-android:0.3.75@aar")
}
