package uz.hallaym.edu

import android.os.Handler
import android.os.Looper

/**
 * In-process link between the voice service and the visible app window.
 * The service publishes recognised speech; the activity forwards it to the web assistant.
 */
object VoiceBus {
    interface Listener {
        /** Continuous listening while the app is open: every phrase goes to the web assistant as-is. */
        fun onPhrase(alternatives: List<String>)
        /** A command said after the wake word (the app may have been in the background). */
        fun onCommand(text: String)
        fun onState(state: String, message: String)
        fun onExitRequested()
    }

    private val main = Handler(Looper.getMainLooper())
    @Volatile var listener: Listener? = null
    @Volatile var activityVisible = false
    /** The web assistant wants the microphone (its «Ovozli boshqaruv» is on). */
    @Volatile var webListening = false
    /** The page is speaking: never listen, or «Madina» in our own answer would wake us. */
    @Volatile var speaking = false
        set(v) { field = v; speakingAt = if (v) System.currentTimeMillis() else 0L }
    /** When the page started speaking; a page that never says «done» must not keep the microphone off for ever. */
    @Volatile var speakingAt = 0L
    fun reallySpeaking() = speaking && System.currentTimeMillis() - speakingAt < 25_000
    /** A live lesson uses the microphone through WebRTC. */
    @Volatile var micBusy = false
    /** Command waiting for the window to open (said while the app was in the background). */
    @Volatile var pendingCommand: String? = null

    fun phrase(alternatives: List<String>) = main.post { listener?.onPhrase(alternatives) }
    fun command(text: String) = main.post { val l = listener; if (l != null && activityVisible) l.onCommand(text) else pendingCommand = text }
    fun state(state: String, message: String = "") = main.post { listener?.onState(state, message) }
    fun exit() = main.post { listener?.onExitRequested() }
}
