package expo.modules.motoralarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

/** Fires when a scheduled quiet reminder goes off: posts the alert and
 *  retires the entry (JS re-arms future occurrences on every sync). */
class ReminderReceiver : BroadcastReceiver() {

  companion object {
    const val EXTRA_ID = "id"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (!action.startsWith(AlarmScheduler.ACTION_REMINDER_PREFIX)) return
    val id = intent.getStringExtra(EXTRA_ID) ?: return
    AlarmScheduler.onReminderFired(context, id)
    try {
      NotificationManagerCompat.from(context).notify(
        AlarmScheduler.alertNotifId(id),
        AlarmScheduler.alertNotification(
          context,
          intent.getStringExtra(EXTRA_TITLE) ?: "Task reminder",
          intent.getStringExtra(EXTRA_BODY) ?: ""
        )
      )
    } catch (_: SecurityException) {
      // notifications not granted; nothing to post
    }
  }
}
