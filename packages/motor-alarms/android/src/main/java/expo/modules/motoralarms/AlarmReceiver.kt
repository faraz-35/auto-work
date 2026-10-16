package expo.modules.motoralarms

import android.app.Notification
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** Fires when a scheduled alarm goes off: posts the insistent notification,
 *  takes over the screen, and advances the alarm (rechain or retire). */
class AlarmReceiver : BroadcastReceiver() {

  companion object {
    const val EXTRA_ID = "id"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val EXTRA_RECHAIN = "rechain"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (!action.startsWith(AlarmScheduler.ACTION_PREFIX)) return
    val id = intent.getStringExtra(EXTRA_ID) ?: return
    AlarmScheduler.ensureChannels(context)

    val alarm = AlarmScheduler.Alarm(
      id = id,
      at = 0,
      title = intent.getStringExtra(EXTRA_TITLE) ?: "Chore due",
      body = intent.getStringExtra(EXTRA_BODY) ?: "",
      rechain = intent.getBooleanExtra(EXTRA_RECHAIN, false)
    )
    try {
      NotificationManagerCompat.from(context).notify(AlarmScheduler.notifId(id), notification(context, alarm))
    } catch (_: SecurityException) {
      // notifications not granted; the alarm itself still fired and woke the app
    }
    AlarmScheduler.onFired(context, alarm)
  }

  private fun notification(context: Context, alarm: AlarmScheduler.Alarm): Notification {
    val snooze = PendingIntent.getBroadcast(
      context, AlarmScheduler.ACTION_SNOOZE.hashCode() + alarm.id.hashCode(),
      Intent(context, AlarmActionReceiver::class.java)
        .setAction(AlarmScheduler.ACTION_SNOOZE)
        .putExtra(AlarmScheduler.EXTRA_SNOOZE_ID, alarm.id)
        .putExtra("minutes", AlarmScheduler.snoozeMinutes(context)),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(
        context, 0, it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    return NotificationCompat.Builder(context, AlarmScheduler.CHANNEL_ALARM)
      .setSmallIcon(R.drawable.ic_motor_stat)
      .setContentTitle(alarm.title)
      .setContentText(alarm.body)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setOngoing(true)
      .setAutoCancel(true)
      .setVibrate(longArrayOf(0, 400, 200, 400, 200, 400))
      .addAction(0, "Snooze ${AlarmScheduler.snoozeMinutes(context)} min", snooze)
      .setContentIntent(launch)
      .setFullScreenIntent(FullScreen.intent(context, alarm), true)
      .build()
      .apply { flags = flags or Notification.FLAG_INSISTENT }
  }
}
