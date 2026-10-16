package expo.modules.motoralarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

/** Handles notification button presses: snooze re-arms that alarm. */
class AlarmActionReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      AlarmScheduler.ACTION_SNOOZE -> {
        val id = intent.getStringExtra(AlarmScheduler.EXTRA_SNOOZE_ID) ?: return
        NotificationManagerCompat.from(context).cancel(AlarmScheduler.notifId(id))
        AlarmScheduler.snooze(context, id, intent.getIntExtra("minutes", 5))
      }
    }
  }
}
