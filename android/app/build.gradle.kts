import java.net.HttpURLConnection
import java.net.URI
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
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

object WhisperArtifacts {
    const val MODEL_REPOSITORY =
        "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-base/resolve/bb53ee204431c90d314c1cc08d28d23e5b7927cc"

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(1024 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    fun fetch(file: File, url: String, checksum: String, size: Long? = null) {
        if (file.isFile && sha256(file) == checksum) return
        file.parentFile.mkdirs()
        val pending = file.resolveSibling("${file.name}.part")
        try {
            pending.outputStream().buffered().use { output ->
                if (size == null) {
                    URI(url).toURL().openConnection().apply {
                        connectTimeout = 15_000
                        readTimeout = 30_000
                    }.getInputStream().use { it.copyTo(output) }
                } else {
                    val chunkSize = 4L * 1024 * 1024
                    var start = 0L
                    while (start < size) {
                        val end = minOf(start + chunkSize, size) - 1
                        val connection = URI("$url?download=true&gazee_range=$start").toURL()
                            .openConnection() as HttpURLConnection
                        try {
                            connection.connectTimeout = 15_000
                            connection.readTimeout = 30_000
                            connection.setRequestProperty("Range", "bytes=$start-$end")
                            check(connection.responseCode == 206
                                && connection.getHeaderField("Content-Range") == "bytes $start-$end/$size"
                            ) { "Unexpected range response for ${file.name}." }
                            val chunk = connection.inputStream.use { it.readNBytes((end - start + 1).toInt()) }
                            check(chunk.size.toLong() == end - start + 1) { "Incomplete download for ${file.name}." }
                            output.write(chunk)
                        } finally {
                            connection.disconnect()
                        }
                        start = end + 1
                    }
                }
            }
            check(sha256(pending) == checksum) { "Unexpected checksum for ${file.name}." }
            Files.move(pending.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
        } finally {
            pending.delete()
        }
    }
}

abstract class FetchWhisperRuntime : DefaultTask() {
    @get:OutputFile
    abstract val aar: RegularFileProperty

    @TaskAction
    fun fetch() {
        WhisperArtifacts.fetch(
            aar.get().asFile,
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.1/sherpa-onnx-2.0.1.aar",
            "a8d09d1d32f3eb8520482c6d3d43fae674681c5b050385967c70a3c2c9bf0ee7",
        )
    }
}

abstract class BundleKoreanModel : DefaultTask() {
    @get:Internal
    abstract val cacheDirectory: DirectoryProperty

    @get:OutputDirectory
    abstract val assetsDirectory: DirectoryProperty

    @TaskAction
    fun bundle() {
        val cache = cacheDirectory.get().asFile
        val assets = assetsDirectory.get().dir("gazee-whisper").asFile
        assets.mkdirs()

        fun add(name: String, url: String, checksum: String, size: Long? = null) {
            val file = cache.resolve(name)
            WhisperArtifacts.fetch(file, url, checksum, size)
            Files.copy(file.toPath(), assets.resolve(name).toPath(), StandardCopyOption.REPLACE_EXISTING)
        }

        add(
            "base-encoder.int8.onnx", "${WhisperArtifacts.MODEL_REPOSITORY}/base-encoder.int8.onnx",
            "0b8fb1304b6109976038efff5ace81720e00386f3ff6b54ee8c75291ca0a1e11",
        )
        add(
            "base-decoder.int8.onnx", "${WhisperArtifacts.MODEL_REPOSITORY}/base-decoder.int8.onnx",
            "9759d217388a01b3a4c7c15533201067b48ae819c4daafc8624e64b9409dc02d", 130_672_026,
        )
        add(
            "base-tokens.txt", "${WhisperArtifacts.MODEL_REPOSITORY}/base-tokens.txt",
            "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126",
        )
        add(
            "silero_vad.onnx", "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx",
            "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6",
        )
    }
}

val whisperCache = rootProject.layout.projectDirectory.dir(".gradle/gazee-whisper")
val fetchWhisperRuntime by tasks.registering(FetchWhisperRuntime::class) {
    aar.set(whisperCache.file("sherpa-onnx-2.0.1.aar"))
}
val bundleKoreanModel by tasks.registering(BundleKoreanModel::class) {
    cacheDirectory.set(whisperCache)
    assetsDirectory.set(layout.buildDirectory.dir("generated/whisperModelAssets"))
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
    implementation(files(fetchWhisperRuntime.flatMap { it.aar }).builtBy(fetchWhisperRuntime))
}
