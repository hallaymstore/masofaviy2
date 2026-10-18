package uz.hallaym.edu

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream
import kotlin.concurrent.thread

/**
 * The offline Uzbek speech model (Vosk, ~50 MB) is downloaded once on first use and unpacked into app storage.
 * It powers the background wake word and the offline engine; nothing is sent to the internet while it listens.
 */
object ModelManager {
    private const val DIR = "vosk-uz"
    @Volatile private var downloading = false

    fun modelDir(context: Context): File? {
        val root = File(context.filesDir, DIR)
        val dir = root.listFiles()?.firstOrNull { it.isDirectory && File(it, "conf").exists() } ?: return null
        return if (File(root, ".ready").exists()) dir else null
    }

    fun isReady(context: Context) = modelDir(context) != null

    /** Downloads in a background thread. [progress] gets 0..100, [done] gets the model folder or an error message. */
    fun ensure(context: Context, progress: (Int) -> Unit, done: (File?, String?) -> Unit) {
        modelDir(context)?.let { done(it, null); return }
        if (downloading) return
        downloading = true
        thread(name = "vosk-model") {
            val root = File(context.filesDir, DIR)
            val tmp = File(context.cacheDir, "vosk-uz.zip")
            try {
                root.deleteRecursively(); root.mkdirs()
                val conn = (URL(BuildConfig.VOSK_MODEL_URL).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20000; readTimeout = 30000; instanceFollowRedirects = true
                }
                val total = conn.contentLengthLong.takeIf { it > 0 } ?: 51_000_000L
                conn.inputStream.use { input ->
                    FileOutputStream(tmp).use { out ->
                        val buf = ByteArray(64 * 1024); var read: Int; var sum = 0L; var last = -1
                        while (input.read(buf).also { read = it } >= 0) {
                            out.write(buf, 0, read); sum += read
                            val pct = (sum * 100 / total).toInt().coerceIn(0, 99)
                            if (pct != last) { last = pct; progress(pct) }
                        }
                    }
                }
                ZipInputStream(tmp.inputStream().buffered()).use { zip ->
                    var entry = zip.nextEntry
                    while (entry != null) {
                        val target = File(root, entry.name).canonicalFile
                        if (!target.path.startsWith(root.canonicalPath)) throw SecurityException("zip path")
                        if (entry.isDirectory) target.mkdirs() else { target.parentFile?.mkdirs(); FileOutputStream(target).use { zip.copyTo(it) } }
                        entry = zip.nextEntry
                    }
                }
                File(root, ".ready").writeText("ok")
                progress(100)
                done(modelDir(context), null)
            } catch (e: Exception) {
                root.deleteRecursively()
                done(null, "Ovoz modelini yuklab bo‘lmadi: " + (e.message ?: e.javaClass.simpleName))
            } finally {
                tmp.delete(); downloading = false
            }
        }
    }
}
