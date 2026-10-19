package uz.hallaym.edu

import android.content.Context

/** App settings kept on the phone. */
class Prefs(context: Context) {
    private val p = context.applicationContext.getSharedPreferences("hallaym", Context.MODE_PRIVATE)

    var url: String
        get() = p.getString("url", BuildConfig.DEFAULT_URL)!!.trimEnd('/')
        set(v) = p.edit().putString("url", v.trim().trimEnd('/')).apply()

    /** Listen for the wake word while the app is in the background (foreground service with a notification). */
    var background: Boolean
        get() = p.getBoolean("background", true)
        set(v) = p.edit().putBoolean("background", v).apply()

    /** Words that wake the assistant, lower case, comma separated. */
    var wakeWords: List<String>
        get() = p.getString("wake", "madina")!!.split(',').map { it.trim().lowercase() }.filter { it.isNotEmpty() }.ifEmpty { listOf("madina") }
        set(v) = p.edit().putString("wake", v.joinToString(",")).apply()

    /** "google": Android speech service (more accurate, needs internet); "vosk": offline, no start beeps. */
    var engine: String
        get() = p.getString("engine", "google")!!
        set(v) = p.edit().putString("engine", v).apply()

    var onboarded: Boolean
        get() = p.getBoolean("onboarded", false)
        set(v) = p.edit().putBoolean("onboarded", v).apply()
}
