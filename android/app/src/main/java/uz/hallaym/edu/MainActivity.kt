package uz.hallaym.edu

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * The platform in a WebView. The page's own voice assistant stays the brain; this window only gives it a microphone that
 * never switches off, a wake word, lock-screen use, the widget and app shortcuts.
 */
class MainActivity : AppCompatActivity(), VoiceBus.Listener {

    companion object {
        const val EXTRA_COMMAND = "command"
        const val EXTRA_PATH = "path"
        const val EXTRA_FROM_WAKE = "fromWake"
        const val ACTION_LISTEN = "uz.hallaym.edu.LISTEN"
    }

    private lateinit var web: WebView
    private lateinit var prefs: Prefs
    private val main = Handler(Looper.getMainLooper())
    private var pageReady = false
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingWebPermission: PermissionRequest? = null

    private val askPermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        pendingWebPermission?.let { req ->
            val granted = req.resources.filter { r ->
                (r == PermissionRequest.RESOURCE_AUDIO_CAPTURE && result[Manifest.permission.RECORD_AUDIO] != false && has(Manifest.permission.RECORD_AUDIO)) ||
                    (r == PermissionRequest.RESOURCE_VIDEO_CAPTURE && has(Manifest.permission.CAMERA))
            }
            if (granted.isEmpty()) req.deny() else req.grant(granted.toTypedArray())
            pendingWebPermission = null
        }
        if (has(Manifest.permission.RECORD_AUDIO)) VoiceService.refresh(this)
    }
    private val pickFile = registerForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        fileCallback?.onReceiveValue(uris.toTypedArray()); fileCallback = null
    }

    private fun has(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        VoiceService.ensureChannels(this)
        web = WebView(this)
        setContentView(web)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false // the assistant's Uzbek voice must play without a tap
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = "$userAgentString HallaymApp/${BuildConfig.VERSION_NAME}"
            textZoom = 100
        }
        web.addJavascriptInterface(Bridge(), "HallaymNative")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                val home = Uri.parse(prefs.url)
                if (url.host == home.host) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, url)) } catch (_: Exception) {}
                return true
            }
            override fun onPageFinished(view: WebView, url: String) { pageReady = true; deliverPendingSoon() }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                main.post {
                    // A live lesson takes the microphone: the voice service steps aside until the lesson ends.
                    if (request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) { VoiceBus.micBusy = true; VoiceService.refresh(this@MainActivity) }
                    val need = mutableListOf<String>()
                    if (request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) && !has(Manifest.permission.RECORD_AUDIO)) need += Manifest.permission.RECORD_AUDIO
                    if (request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE) && !has(Manifest.permission.CAMERA)) need += Manifest.permission.CAMERA
                    if (need.isEmpty()) request.grant(request.resources) else { pendingWebPermission = request; askPermissions.launch(need.toTypedArray()) }
                }
            }
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null); fileCallback = callback
                val type = params.acceptTypes.firstOrNull { it.contains('/') } ?: "*/*"
                pickFile.launch(type); return true
            }
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else moveTaskToBack(true) }
        })
        handleIntent(intent, first = true)
        if (!prefs.onboarded) {
            prefs.onboarded = true
            val need = mutableListOf(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= 33) need += Manifest.permission.POST_NOTIFICATIONS
            askPermissions.launch(need.toTypedArray())
        }
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); handleIntent(intent, first = false) }

    private fun handleIntent(intent: Intent?, first: Boolean) {
        if (intent?.getBooleanExtra(EXTRA_FROM_WAKE, false) == true && Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
        val path = intent?.getStringExtra(EXTRA_PATH)
        val data = intent?.data
        val target = when {
            data != null && data.host == Uri.parse(prefs.url).host -> data.toString()
            path != null -> prefs.url + path
            first -> prefs.url + "/"
            else -> null
        }
        if (target != null) { pageReady = false; web.loadUrl(target) }
        intent?.getStringExtra(EXTRA_COMMAND)?.let { VoiceBus.pendingCommand = it; deliverPendingSoon() }
        if (intent?.action == ACTION_LISTEN) VoiceService.listenNow(this)
    }

    override fun onResume() {
        super.onResume()
        VoiceBus.listener = this; VoiceBus.activityVisible = true
        if (has(Manifest.permission.RECORD_AUDIO)) VoiceService.refresh(this)
        deliverPendingSoon()
    }

    override fun onPause() {
        VoiceBus.activityVisible = false
        if (has(Manifest.permission.RECORD_AUDIO)) VoiceService.refresh(this)
        super.onPause() // WebView timers keep running so the Uzbek voice finishes its sentence.
    }

    override fun onDestroy() { if (VoiceBus.listener === this) VoiceBus.listener = null; web.destroy(); super.onDestroy() }

    // ---------------------------------------------------------------- service → page
    private fun js(code: String) = main.post { web.evaluateJavascript(code, null) }

    override fun onPhrase(alternatives: List<String>) { js("window.HxNative&&HxNative.result(" + JSONArray(alternatives) + ")") }
    override fun onCommand(text: String) { VoiceBus.pendingCommand = text; deliverPendingSoon() }
    override fun onState(state: String, message: String) { js("window.HxNative&&HxNative.state(" + JSONObject.quote(state) + "," + JSONObject.quote(message) + ")") }
    override fun onExitRequested() { moveTaskToBack(true) }

    /** Waits until the page and its assistant are loaded, then hands over a command said in the background. */
    private fun deliverPendingSoon(attempt: Int = 0) {
        val cmd = VoiceBus.pendingCommand ?: return
        if (!pageReady || !VoiceBus.activityVisible) return
        web.evaluateJavascript("Boolean(window.HxVoiceAssistant&&window.HxVoiceAssistant.execute)") { ready ->
            if (ready == "true") { VoiceBus.pendingCommand = null; web.evaluateJavascript("window.HxNative.command(" + JSONObject.quote(cmd) + ")", null) }
            else if (attempt < 40) main.postDelayed({ deliverPendingSoon(attempt + 1) }, 250)
        }
    }

    // ---------------------------------------------------------------- page → app
    inner class Bridge {
        @JavascriptInterface fun setWebListening(on: Boolean) { VoiceBus.webListening = on; refresh() }
        @JavascriptInterface fun setSpeaking(on: Boolean) { VoiceBus.speaking = on; refresh() }
        @JavascriptInterface fun setMicBusy(on: Boolean) { VoiceBus.micBusy = on; refresh() }
        @JavascriptInterface fun listenNow() { main.post { VoiceService.listenNow(this@MainActivity) } }
        @JavascriptInterface fun openSettings() { main.post { startActivity(Intent(this@MainActivity, SettingsActivity::class.java)) } }
        @JavascriptInterface fun info(): String = JSONObject()
            .put("version", BuildConfig.VERSION_NAME)
            .put("wakeWord", prefs.wakeWords.first())
            .put("background", prefs.background)
            .put("engine", prefs.engine)
            .put("modelReady", ModelManager.isReady(this@MainActivity)).toString()
        private fun refresh() = main.post { if (has(Manifest.permission.RECORD_AUDIO)) VoiceService.refresh(this@MainActivity) }
    }

    @Suppress("unused") private fun hide(v: View) { v.visibility = View.GONE }
}
