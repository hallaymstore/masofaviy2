package uz.hallaym.edu

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/** Home-screen widget: talk to the assistant, open my books, join the current lesson, hear today's schedule. */
class HallaymWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val views = RemoteViews(context.packageName, R.layout.widget)
        val listen = PendingIntent.getForegroundService(context, 10, Intent(context, VoiceService::class.java).setAction(VoiceService.ACTION_LISTEN_NOW), PendingIntent.FLAG_IMMUTABLE)
        views.setOnClickPendingIntent(R.id.w_mic, listen)
        views.setOnClickPendingIntent(R.id.w_books, open(context, 11, path = "/?go=myBooks", command = null))
        views.setOnClickPendingIntent(R.id.w_live, open(context, 12, path = null, command = "hozirgi darsni och"))
        views.setOnClickPendingIntent(R.id.w_today, open(context, 13, path = null, command = "bugungi jadval qanaqa"))
        ids.forEach { manager.updateAppWidget(it, views) }
    }

    private fun open(context: Context, code: Int, path: String?, command: String?): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (path != null) intent.putExtra(MainActivity.EXTRA_PATH, path)
        if (command != null) intent.putExtra(MainActivity.EXTRA_COMMAND, command)
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
}
