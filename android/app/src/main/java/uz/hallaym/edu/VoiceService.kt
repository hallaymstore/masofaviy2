package uz.hallaym.edu

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.SpeechService

/**
 * The microphone owner. Three modes, chosen from the current situation:
 *  • CONTINUOUS — the app is open and its voice control is on: every phrase goes straight to the web assistant,
 *    the microphone restarts by itself (no taps, start beeps muted);
 *  • WAKE — the app is hidden or the screen is off: only the wake word («Madina») is listened for, offline;
 *    after it, one command is recorded and carried out (the app is brought to the front when needed);
 *  • PAUSED — the page is speaking, a live lesson owns the microphone, or listening was turned off.
 */
class VoiceService : Service() {

    companion object {
        const val ACTION_REFRESH = "uz.hallaym.edu.REFRESH"
        const val ACTION_LISTEN_NOW = "uz.hallaym.edu.LISTEN_NOW"
        const val ACTION_STOP = "uz.hallaym.edu.STOP"
        private const val CH_VOICE = "voice"
        const val CH_ALERT = "alert"
        private const val NOTE_ID = 7
        private const val SAMPLE = 16000f

        fun refresh(context: Context) = send(context, ACTION_REFRESH)
        fun listenNow(context: Context) = send(context, ACTION_LISTEN_NOW)
        private fun send(context: Context, action: String) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return
            try { ContextCompat.startForegroundService(context, Intent(context, VoiceService::class.java).setAction(action)) } catch (_: Exception) {}
        }
        fun ensureChannels(context: Context) {
            if (Build.VERSION.SDK_INT < 26) return
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CH_VOICE, context.getString(R.string.channel_voice), NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
            nm.createNotificationChannel(NotificationChannel(CH_ALERT, context.getString(R.string.channel_alert), NotificationManager.IMPORTANCE_HIGH))
        }
    }

    private enum class Mode { NONE, CONTINUOUS, WAKE, COMMAND, PAUSED }

    private val main = Handler(Looper.getMainLooper())
    private lateinit var prefs: Prefs
    private var mode = Mode.NONE
    private var model: Model? = null
    private var vosk: SpeechService? = null
    private var google: SpeechRecognizer? = null
    private var tone: ToneGenerator? = null
    private var mutedBeep = false
    private var forcedOnce = false
    private var googleFailures = 0
    private var stateText = "Tayyor"

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        ensureChannels(this)
        tone = try { ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70) } catch (_: Exception) { null }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!goForeground()) { stopSelf(); return START_NOT_STICKY }
        when (intent?.action) {
            ACTION_STOP -> { prefs.background = false; stopAll(); VoiceBus.state("idle", "Tinglash o‘chirildi"); if (!VoiceBus.activityVisible) { stopSelf(); return START_NOT_STICKY } }
            ACTION_LISTEN_NOW -> { forcedOnce = true }
        }
        loadModelThen { decide() }
        return START_STICKY
    }

    override fun onDestroy() {
        stopAll(); unmuteBeep()
        try { model?.close() } catch (_: Exception) {}
        tone?.release()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- foreground notification
    private fun goForeground(): Boolean = try {
        val type = if (Build.VERSION.SDK_INT >= 30) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0
        ServiceCompat.startForeground(this, NOTE_ID, notification(), type); true
    } catch (_: Exception) { false }

    private fun notification(): Notification {
        val open = PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val listen = PendingIntent.getService(this, 2, Intent(this, VoiceService::class.java).setAction(ACTION_LISTEN_NOW), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 3, Intent(this, VoiceService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CH_VOICE)
            .setSmallIcon(R.drawable.ic_mic)
            .setContentTitle("HALLAYM ovozli yordamchi")
            .setContentText(stateText)
            .setOngoing(true).setSilent(true)
            .setContentIntent(open)
            .addAction(0, "Gapirish", listen)
            .addAction(0, "To‘xtatish", stop)
            .build()
    }

    private fun setState(text: String, webState: String? = null) {
        stateText = text
        try { getSystemService(NotificationManager::class.java).notify(NOTE_ID, notification()) } catch (_: Exception) {}
        if (webState != null) VoiceBus.state(webState, text)
    }

    // ---------------------------------------------------------------- model
    private fun loadModelThen(next: () -> Unit) {
        if (model != null) { next(); return }
        val dir = ModelManager.modelDir(this)
        if (dir != null) {
            Thread {
                try { model = Model(dir.absolutePath) } catch (_: Exception) { model = null }
                main.post(next)
            }.start()
            return
        }
        // No offline model yet: continuous mode can still use Google; the wake word starts after the download.
        ModelManager.ensure(this, progress = { p -> main.post { setState("O‘zbekcha ovoz modeli yuklanmoqda: $p%") } }) { folder, error ->
            main.post {
                if (folder != null) loadModelThen(next) else { setState(error ?: "Model yuklanmadi"); next() }
            }
        }
        next()
    }

    // ---------------------------------------------------------------- mode selection
    /** Picks what the microphone should do now. Called on every change (window visible, page speaking, lesson…). */
    fun decide() {
        val want = when {
            VoiceBus.speaking || VoiceBus.micBusy -> Mode.PAUSED
            forcedOnce -> Mode.COMMAND
            VoiceBus.activityVisible && VoiceBus.webListening -> Mode.CONTINUOUS
            prefs.background && model != null -> Mode.WAKE
            else -> Mode.NONE
        }
        if (want == mode && want != Mode.COMMAND) return
        stopAll()
        mode = want
        when (want) {
            Mode.CONTINUOUS -> startContinuous()
            Mode.WAKE -> startWake()
            Mode.COMMAND -> { forcedOnce = false; beep(true); captureCommand() }
            Mode.PAUSED -> setState(if (VoiceBus.micBusy) "Jonli dars mikrofonni ishlatyapti" else "Javob o‘qilmoqda…")
            Mode.NONE -> { setState("Tinglash o‘chiq"); if (!VoiceBus.activityVisible && !prefs.background) stopSelf() }
        }
    }

    private fun stopAll() {
        try { vosk?.stop(); vosk?.shutdown() } catch (_: Exception) {}
        vosk = null
        try { google?.cancel(); google?.destroy() } catch (_: Exception) {}
        google = null
        main.removeCallbacksAndMessages(null)
        unmuteBeep()
    }

    // ---------------------------------------------------------------- continuous mode (app open)
    private fun startContinuous() {
        setState("Tinglayapman — buyruq ayting", "listening")
        if (useGoogle()) googleOnce { alts -> if (alts.isNotEmpty()) VoiceBus.phrase(alts); if (mode == Mode.CONTINUOUS) main.postDelayed({ if (mode == Mode.CONTINUOUS) startContinuous() }, 120) }
        else voskStream(null) { text -> VoiceBus.phrase(listOf(text)) }
    }

    // ---------------------------------------------------------------- wake word (background, offline)
    // A grammar limited to the wake word turns every phrase into «madina» (tested: 4/4 false wakes), so the full
    // Uzbek model listens and the wake word must appear as a real word. Bonus: «Madina, kutubxonani och» said in one
    // breath is carried out at once, without a second listening round.
    private fun startWake() {
        val m = model ?: return
        val words = prefs.wakeWords
        setState("«${words.first().replaceFirstChar { it.uppercase() }}» deyishingizni kutyapman")
        try {
            val rec = Recognizer(m, SAMPLE)
            vosk = SpeechService(rec, SAMPLE).also {
                it.startListening(object : org.vosk.android.RecognitionListener {
                    override fun onPartialResult(hypothesis: String?) {}
                    override fun onResult(hypothesis: String?) { wakeFrom(text(hypothesis, "text")) }
                    override fun onFinalResult(hypothesis: String?) {}
                    override fun onError(e: Exception?) { setState("Mikrofon xatosi: ${e?.message ?: ""}"); main.postDelayed({ mode = Mode.NONE; decide() }, 3000) }
                    override fun onTimeout() {}
                })
            }
        } catch (e: Exception) { setState("Uyg‘otuvchi so‘z ishlamadi: ${e.message}") }
    }

    private fun text(json: String?, key: String): String = try { JSONObject(json ?: "{}").optString(key) } catch (_: Exception) { "" }

    /** Words after the wake word, or null when the phrase has no wake word. */
    fun afterWake(phrase: String, wakeWords: List<String>): String? {
        val ws = phrase.trim().split(' ').filter { it.isNotEmpty() }
        val i = ws.indexOfFirst { it in wakeWords }
        return if (i < 0) null else ws.drop(i + 1).joinToString(" ")
    }

    private fun wakeFrom(phrase: String) {
        if (mode != Mode.WAKE) return
        val rest = afterWake(phrase, prefs.wakeWords) ?: return
        mode = Mode.COMMAND
        stopAll(); vibrate(); beep(true)
        if (rest.split(' ').size >= 2) route(rest, listOf(rest)) else captureCommand()
    }

    // ---------------------------------------------------------------- one command after the wake word / widget tap
    private fun captureCommand() {
        setState("Eshityapman…", "listening")
        val handle: (List<String>) -> Unit = { alts ->
            val text = alts.firstOrNull()?.let { AppCommands.stripWake(it, prefs.wakeWords) }.orEmpty()
            if (text.isBlank()) { beep(false); afterCommand() } else route(text, alts.map { AppCommands.stripWake(it, prefs.wakeWords) })
        }
        if (useGoogle()) googleOnce(handle) else voskStream(8000, single = true) { handle(listOf(it)) }
    }

    private fun route(text: String, alternatives: List<String>) {
        when (AppCommands.classify(text)) {
            AppCommands.Kind.OPEN_APP -> openApp(null)
            AppCommands.Kind.EXIT_APP -> { VoiceBus.exit() }
            AppCommands.Kind.SLEEP -> { prefs.background = false; setState("Tinglash o‘chirildi. Qayta yoqish uchun vidjetdagi tugmani bosing."); stopAll(); mode = Mode.NONE; return }
            AppCommands.Kind.NONE -> {
                if (VoiceBus.activityVisible && VoiceBus.webListening) VoiceBus.phrase(alternatives)
                else { VoiceBus.command(text); if (!VoiceBus.activityVisible) openApp(text) }
            }
        }
        afterCommand()
    }

    private fun afterCommand() { mode = Mode.NONE; main.postDelayed({ decide() }, 400) }

    /** Brings the app to the front. Android allows it from the background when «display over other apps» is granted. */
    private fun openApp(command: String?) {
        val intent = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            .putExtra(MainActivity.EXTRA_FROM_WAKE, true)
        if (command != null) intent.putExtra(MainActivity.EXTRA_COMMAND, command)
        val canStart = Build.VERSION.SDK_INT < 29 || Settings.canDrawOverlays(this)
        if (canStart) { try { startActivity(intent); return } catch (_: Exception) {} }
        // Fallback: a heads-up notification that opens the app (and goes full screen on a locked phone).
        val pi = PendingIntent.getActivity(this, 5, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(this, CH_ALERT).setSmallIcon(R.drawable.ic_mic)
            .setContentTitle("Buyruq qabul qilindi").setContentText(command ?: "Ilovani ochish uchun bosing")
            .setPriority(NotificationCompat.PRIORITY_HIGH).setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true).setContentIntent(pi).setFullScreenIntent(pi, true).build()
        try { getSystemService(NotificationManager::class.java).notify(8, n) } catch (_: Exception) {}
    }

    // ---------------------------------------------------------------- engines
    private fun useGoogle(): Boolean = prefs.engine == "google" && googleFailures < 3 && SpeechRecognizer.isRecognitionAvailable(this) || model == null

    /** One utterance with the Android speech service (Google), uz-UZ, up to 5 alternatives. */
    private fun googleOnce(onDone: (List<String>) -> Unit) {
        val sr = try { SpeechRecognizer.createSpeechRecognizer(this) } catch (_: Exception) { null }
        if (sr == null) { googleFailures = 3; main.post { onDone(emptyList()) }; return }
        google = sr
        var finished = false
        val finish = { list: List<String> -> if (!finished) { finished = true; unmuteBeep(); try { sr.destroy() } catch (_: Exception) {}; if (google === sr) google = null; onDone(list) } }
        sr.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { main.postDelayed({ unmuteBeep() }, 350) }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onResults(results: Bundle?) { googleFailures = 0; finish(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()) }
            override fun onError(error: Int) {
                when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> finish(emptyList())
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> { setState("Mikrofonga ruxsat kerak", "error"); finish(emptyList()) }
                    else -> { googleFailures++; if (googleFailures >= 3 && model != null) setState("Internet ovoz xizmati ishlamadi — oflayn rejimga o‘tildi"); finish(emptyList()) }
                }
            }
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "uz-UZ")
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "uz-UZ")
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
            .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 900L)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 700L)
        muteBeep()
        try { sr.startListening(intent) } catch (_: Exception) { finish(emptyList()) }
        main.postDelayed({ if (!finished) { try { sr.stopListening() } catch (_: Exception) {} } }, 12000)
    }

    /** Offline Vosk recognition: continuous stream, or a single phrase with a timeout. */
    private fun voskStream(timeoutMs: Int?, single: Boolean = false, onText: (String) -> Unit) {
        val m = model ?: return
        try {
            val rec = Recognizer(m, SAMPLE)
            var done = false
            vosk = SpeechService(rec, SAMPLE).also { svc ->
                svc.startListening(object : org.vosk.android.RecognitionListener {
                    override fun onPartialResult(hypothesis: String?) {}
                    override fun onResult(hypothesis: String?) {
                        val text = try { JSONObject(hypothesis ?: "{}").optString("text") } catch (_: Exception) { "" }
                        if (text.isBlank() || done) return
                        if (single) { done = true; stopAll() }
                        onText(text)
                    }
                    override fun onFinalResult(hypothesis: String?) {}
                    override fun onError(e: Exception?) { setState("Mikrofon xatosi", "error") }
                    override fun onTimeout() { if (single && !done) { done = true; stopAll(); beep(false); afterCommand() } }
                }, timeoutMs ?: -1)
            }
        } catch (e: Exception) { setState("Oflayn tanish ishlamadi: ${e.message}") }
    }

    // ---------------------------------------------------------------- sound helpers
    /** Android's speech service plays a start beep on every restart; muted for a moment so continuous listening is quiet. */
    private fun muteBeep() {
        val am = getSystemService(AudioManager::class.java) ?: return
        try { am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_MUTE, 0); am.adjustStreamVolume(AudioManager.STREAM_SYSTEM, AudioManager.ADJUST_MUTE, 0); mutedBeep = true } catch (_: Exception) {}
    }
    private fun unmuteBeep() {
        if (!mutedBeep) return
        val am = getSystemService(AudioManager::class.java) ?: return
        try { am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, 0); am.adjustStreamVolume(AudioManager.STREAM_SYSTEM, AudioManager.ADJUST_UNMUTE, 0) } catch (_: Exception) {}
        mutedBeep = false
    }
    private fun beep(up: Boolean) { try { tone?.startTone(if (up) ToneGenerator.TONE_PROP_ACK else ToneGenerator.TONE_PROP_NACK, 150) } catch (_: Exception) {} }
    private fun vibrate() {
        try {
            val v = getSystemService(Vibrator::class.java)
            if (Build.VERSION.SDK_INT >= 26) v?.vibrate(VibrationEffect.createOneShot(60, VibrationEffect.DEFAULT_AMPLITUDE)) else @Suppress("DEPRECATION") v?.vibrate(60)
        } catch (_: Exception) {}
    }
}

/** Lets other components ask the running service to re-evaluate (visibility, speaking, lesson). */
object VoiceControl {
    fun changed(context: Context) = VoiceService.refresh(context)
}

