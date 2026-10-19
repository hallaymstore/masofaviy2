package uz.hallaym.edu

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

/**
 * After a phone restart. Android 14+ forbids starting a microphone service from boot, so there a single tap on a
 * notification turns listening back on; older Android versions start listening directly.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val prefs = Prefs(context)
        if (!prefs.background) return
        if (Build.VERSION.SDK_INT < 34) { VoiceService.refresh(context); return }
        VoiceService.ensureChannels(context)
        val pi = PendingIntent.getActivity(context, 20, Intent(context, MainActivity::class.java).setAction(MainActivity.ACTION_LISTEN).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(context, VoiceService.CH_ALERT).setSmallIcon(R.drawable.ic_mic)
            .setContentTitle("Ovozli yordamchini yoqish").setContentText("Telefon qayta yondi. «Madina»ni tinglash uchun bosing.")
            .setAutoCancel(true).setContentIntent(pi).build()
        try { context.getSystemService(NotificationManager::class.java).notify(21, n) } catch (_: Exception) {}
    }
}
