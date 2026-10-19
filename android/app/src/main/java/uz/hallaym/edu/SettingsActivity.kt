package uz.hallaym.edu

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.util.TypedValue
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** Large, screen-reader friendly settings: wake word, recognition engine, background listening and the permissions it needs. */
class SettingsActivity : AppCompatActivity() {
    private lateinit var prefs: Prefs
    private lateinit var status: TextView

    @SuppressLint("UseSwitchCompatOrMaterialCode", "SetTextI18n")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        val pad = dp(20)
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad, pad, pad); setBackgroundColor(Color.parseColor("#081A38")) }
        fun text(t: String, size: Float = 17f, bold: Boolean = false) = TextView(this).apply {
            text = t; setTextColor(Color.WHITE); setTextSize(TypedValue.COMPLEX_UNIT_SP, size); if (bold) setTypeface(typeface, Typeface.BOLD); setPadding(0, dp(10), 0, dp(6))
        }
        fun button(t: String, onClick: () -> Unit) = Button(this).apply { text = t; minHeight = dp(56); setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f); isAllCaps = false; setOnClickListener { onClick() } }

        col.addView(text("Ovozli yordamchi", 24f, true))
        col.addView(text("Telefon «Madina» deganingizni ilova yopiq yoki ekran o‘chiq bo‘lsa ham eshitadi. Keyin buyruqni ayting: «kutubxonani och», «hozirgi darsga kir», «ertangi jadval qanaqa».", 15f))

        val bg = Switch(this).apply { text = "Orqa fonda uyg‘otuvchi so‘zni tinglash"; setTextColor(Color.WHITE); textSize = 18f; minHeight = dp(56); isChecked = prefs.background }
        col.addView(bg)

        col.addView(text("Uyg‘otuvchi so‘z (vergul bilan bir nechta)"))
        val wake = EditText(this).apply { setText(prefs.wakeWords.joinToString(", ")); setTextColor(Color.WHITE); textSize = 18f; inputType = InputType.TYPE_CLASS_TEXT }
        col.addView(wake)
        col.addView(text("Masalan: madina, yordamchi. So‘z o‘zbekcha lug‘atda bo‘lishi kerak; ism yoki oddiy so‘z eng yaxshi ishlaydi.", 13f))

        col.addView(text("Ovozni tanish"))
        val engine = RadioGroup(this)
        val google = RadioButton(this).apply { id = 1; text = "Google (aniqroq, sheva va talaffuzni yaxshi tushunadi, internet kerak)"; setTextColor(Color.WHITE); textSize = 16f }
        val vosk = RadioButton(this).apply { id = 2; text = "Oflayn (internetsiz, ovoz signalisiz, aniqligi pastroq)"; setTextColor(Color.WHITE); textSize = 16f }
        engine.addView(google); engine.addView(vosk); engine.check(if (prefs.engine == "vosk") 2 else 1)
        col.addView(engine)

        col.addView(text("Platforma manzili"))
        val url = EditText(this).apply { setText(prefs.url); setTextColor(Color.WHITE); textSize = 16f; inputType = InputType.TYPE_TEXT_VARIATION_URI }
        col.addView(url)

        status = text("", 15f)
        col.addView(status)

        col.addView(button("Ustidan ochishga ruxsat («Madina» deganda ilova o‘zi ochiladi)") {
            if (Build.VERSION.SDK_INT >= 23) startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        })
        col.addView(button("Batareya tejash cheklovini o‘chirish (orqa fonda uzilmasligi uchun)") {
            try { startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))) }
            catch (_: Exception) { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
        })
        col.addView(button("O‘zbekcha oflayn ovoz modelini yuklash (≈50 MB)") { downloadModel() })
        col.addView(button("Saqlash") {
            prefs.background = bg.isChecked
            prefs.wakeWords = wake.text.toString().split(',').map { it.trim().lowercase() }.filter { it.isNotEmpty() }
            prefs.engine = if (engine.checkedRadioButtonId == 2) "vosk" else "google"
            if (url.text.toString().startsWith("https://")) prefs.url = url.text.toString()
            VoiceService.refresh(this)
            status.text = "Saqlandi."
            status.announceForAccessibility("Saqlandi")
        })

        setContentView(ScrollView(this).apply { addView(col, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)); setBackgroundColor(Color.parseColor("#081A38")) })
        refreshStatus()
    }

    override fun onResume() { super.onResume(); refreshStatus() }

    @SuppressLint("SetTextI18n")
    private fun refreshStatus() {
        if (!::status.isInitialized) return
        val overlay = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this)
        val battery = getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(packageName) == true
        status.text = listOf(
            (if (ModelManager.isReady(this)) "✅" else "⬜") + " Oflayn ovoz modeli",
            (if (overlay) "✅" else "⬜") + " Ustidan ochish ruxsati",
            (if (battery) "✅" else "⬜") + " Batareya cheklovi o‘chirilgan"
        ).joinToString("\n")
    }

    @SuppressLint("SetTextI18n")
    private fun downloadModel() {
        status.text = "Yuklanmoqda…"
        ModelManager.ensure(this, progress = { p -> runOnUiThread { status.text = "Yuklanmoqda: $p%" } }) { dir, error ->
            runOnUiThread { status.text = error ?: "Model tayyor."; refreshStatus(); if (dir != null) VoiceService.refresh(this) }
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}
