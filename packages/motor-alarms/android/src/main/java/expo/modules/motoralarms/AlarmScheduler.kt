package expo.modules.motoralarms

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.media.AudioAttributes
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

/**
 * Single source of truth for alarm state. The desired alarm set arrives from
 * JS as one JSON object (id -> {at, title, body, rechain}) and persists in
 * SharedPreferences so [BootReceiver] can re-arm everything after a reboot
 * without any JavaScript running. syncAlarms() is a full reconcile: alarms no
 * longer in the set are cancelled, so JS owns the schedule and native never
 * guesses.
 */
object AlarmScheduler {
  private const val PREFS = "motor_alarms"
  private const val KEY_ALARMS = "alarms"
  private const val KEY_REMINDERS = "reminders"
  private const val KEY_SNOOZE_MINUTES = "snooze_minutes"

  const val ACTION_PREFIX = "expo.modules.motoralarms.ALARM/"
  const val ACTION_REMINDER_PREFIX = "expo.modules.motoralarms.REMINDER/"
  const val ACTION_SNOOZE = "expo.modules.motoralarms.ACTION_SNOOZE"
  const val EXTRA_SNOOZE_ID = "snooze_id"
  const val CHANNEL_ALARM = "ghar_alarm"
  const val CHANNEL_ALERTS = "ghar_alerts"
  private const val NOTIF_BASE = 2000
  private const val ALERT_NOTIF_BASE = 1_100_000

  data class Alarm(val id: String, val at: Long, val title: String, val body: String, val rechain: Boolean)
  data class Reminder(val id: String, val at: Long, val title: String, val body: String)

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun ensureChannels(ctx: Context) {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val alarmUri = Uri.parse("android.resource://${ctx.packageName}/raw/motor_alarm")

    // channel settings are immutable once created — recreate ours every time so
    // fresh attributes (alarm sound, DND bypass) always win over old installs
    nm.deleteNotificationChannel(CHANNEL_ALARM)
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_ALARM, "Chore alarms", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Full-screen alarms for strict chore deadlines"
        setSound(alarmUri, attrs)
        enableVibration(true)
        setBypassDnd(true)
      }
    )

    // quiet alerts keep whatever the user changes, so create-if-missing only
    if (nm.getNotificationChannel(CHANNEL_ALERTS) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ALERTS, "Task alerts", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "New tasks for you and deadline reminders"
        }
      )
    }
  }

  fun notifId(id: String): Int = NOTIF_BASE + (Math.abs(id.hashCode()) % 1_000_000)

  fun alertNotifId(id: String): Int = ALERT_NOTIF_BASE + (Math.abs(id.hashCode()) % 100_000)

  private fun actionFor(id: String) = ACTION_PREFIX + id

  private fun pending(ctx: Context, id: String, alarm: Alarm?): PendingIntent {
    val intent = Intent(ctx, AlarmReceiver::class.java)
      .setAction(actionFor(id))
      .putExtra(AlarmReceiver.EXTRA_ID, id)
      .putExtra(AlarmReceiver.EXTRA_TITLE, alarm?.title ?: "")
      .putExtra(AlarmReceiver.EXTRA_BODY, alarm?.body ?: "")
      .putExtra(AlarmReceiver.EXTRA_RECHAIN, alarm?.rechain ?: false)
    return PendingIntent.getBroadcast(
      ctx, actionFor(id).hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  /** setAlarmClock is exempt from the exact-alarm permission and gets the
   *  system's alarm-grade priority (pre-Doze firing, status-bar alarm icon). */
  private fun arm(ctx: Context, id: String, alarm: Alarm, atMs: Long) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val show = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
    val showPi = PendingIntent.getActivity(
      ctx, 0, show,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    am.setAlarmClock(AlarmManager.AlarmClockInfo(atMs, showPi), pending(ctx, id, alarm))
  }

  private fun cancel(ctx: Context, id: String) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(pending(ctx, id, null))
    NotificationManagerCompat.from(ctx).cancel(notifId(id))
  }

  // ---- persisted alarm set ----

  fun alarms(ctx: Context): Map<String, Alarm> {
    val blob = prefs(ctx).getString(KEY_ALARMS, null) ?: return emptyMap()
    val out = mutableMapOf<String, Alarm>()
    val root = JSONObject(blob)
    for (id in root.keys()) {
      val o = root.getJSONObject(id)
      out[id] = Alarm(id, o.getLong("at"), o.getString("title"), o.getString("body"), o.optBoolean("rechain", false))
    }
    return out
  }

  private fun save(ctx: Context, alarms: Map<String, Alarm>) {
    val root = JSONObject()
    for ((id, a) in alarms) {
      root.put(id, JSONObject()
        .put("at", a.at)
        .put("title", a.title)
        .put("body", a.body)
        .put("rechain", a.rechain))
    }
    prefs(ctx).edit().putString(KEY_ALARMS, root.toString()).apply()
  }

  // ---- the reconcile ----

  fun syncAlarms(ctx: Context, json: String) {
    val desired = mutableMapOf<String, Alarm>()
    val root = JSONObject(json)
    val now = System.currentTimeMillis()
    for (id in root.keys()) {
      val o = root.getJSONObject(id)
      val at = o.getLong("at")
      if (at <= now) continue  // JS filters these too; stale entries never ring late
      desired[id] = Alarm(id, at, o.getString("title"), o.getString("body"), o.optBoolean("rechain", false))
    }
    for ((id, _) in alarms(ctx)) if (id !in desired) cancel(ctx, id)
    for ((id, a) in desired) arm(ctx, id, a, a.at)
    save(ctx, desired)
  }

  /** After an alarm fires: re-arm tomorrow for recurring alarms (JS corrects
   *  the exact schedule on next app open), or retire one-offs. */
  fun onFired(ctx: Context, alarm: Alarm) {
    val current = alarms(ctx).toMutableMap()
    val entry = current[alarm.id] ?: return  // removed by a sync while pending
    if (entry.rechain) {
      val next = System.currentTimeMillis() + 24 * 3600_000L
      current[alarm.id] = entry.copy(at = next)
      save(ctx, current)
      arm(ctx, alarm.id, entry, next)
    } else {
      current.remove(alarm.id)
      save(ctx, current)
    }
  }

  fun snooze(ctx: Context, id: String, minutes: Int, title: String? = null, body: String? = null) {
    val current = alarms(ctx).toMutableMap()
    val at = System.currentTimeMillis() + minutes * 60_000L
    // one-offs retire the moment they fire — the notification's snooze button
    // is the only thing left carrying them, so rebuild the entry from it
    val entry = current[id] ?: Alarm(id, at, title ?: return, body ?: "", false)
    current[id] = entry.copy(at = at)
    save(ctx, current)
    arm(ctx, id, entry, at)
  }

  /** Re-arm everything still in the future after a reboot; drop the past.
   *  Covers alarms and quiet reminders. */
  fun rearmAll(ctx: Context) {
    val now = System.currentTimeMillis()
    val keep = alarms(ctx).filterValues { it.at > now }
    for ((id, a) in keep) arm(ctx, id, a, a.at)
    save(ctx, keep)
    val reminders = reminders(ctx).filterValues { it.at > now }
    for ((id, r) in reminders) armReminder(ctx, id, r, r.at)
    saveReminders(ctx, reminders)
  }

  // ---- quiet reminders (same reconcile, no takeover) ----

  fun reminders(ctx: Context): Map<String, Reminder> {
    val blob = prefs(ctx).getString(KEY_REMINDERS, null) ?: return emptyMap()
    val out = mutableMapOf<String, Reminder>()
    val root = JSONObject(blob)
    for (id in root.keys()) {
      val o = root.getJSONObject(id)
      out[id] = Reminder(id, o.getLong("at"), o.getString("title"), o.getString("body"))
    }
    return out
  }

  private fun saveReminders(ctx: Context, set: Map<String, Reminder>) {
    val root = JSONObject()
    for ((id, r) in set) {
      root.put(id, JSONObject().put("at", r.at).put("title", r.title).put("body", r.body))
    }
    prefs(ctx).edit().putString(KEY_REMINDERS, root.toString()).apply()
  }

  fun syncReminders(ctx: Context, json: String) {
    val desired = mutableMapOf<String, Reminder>()
    val root = JSONObject(json)
    val now = System.currentTimeMillis()
    for (id in root.keys()) {
      val o = root.getJSONObject(id)
      val at = o.getLong("at")
      if (at <= now) continue
      desired[id] = Reminder(id, at, o.getString("title"), o.getString("body"))
    }
    for (id in reminders(ctx).keys) if (id !in desired) cancelReminder(ctx, id)
    for ((id, r) in desired) armReminder(ctx, id, r, r.at)
    saveReminders(ctx, desired)
  }

  private fun reminderPending(ctx: Context, r: Reminder): PendingIntent {
    val intent = Intent(ctx, ReminderReceiver::class.java)
      .setAction(ACTION_REMINDER_PREFIX + r.id)
      .putExtra(ReminderReceiver.EXTRA_ID, r.id)
      .putExtra(ReminderReceiver.EXTRA_TITLE, r.title)
      .putExtra(ReminderReceiver.EXTRA_BODY, r.body)
    return PendingIntent.getBroadcast(
      ctx, r.id.hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun armReminder(ctx: Context, id: String, r: Reminder, atMs: Long) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = reminderPending(ctx, r)
    // exact grants come from USE_EXACT_ALARM (33+) or the user toggle (31/32);
    // below 31 exact alarms need no permission
    val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
    if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
    else am.setWindow(AlarmManager.RTC_WAKEUP, atMs, 10 * 60_000L, pi)
  }

  private fun cancelReminder(ctx: Context, id: String) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(reminderPending(ctx, Reminder(id, 0, "", "")))
    NotificationManagerCompat.from(ctx).cancel(alertNotifId(id))
  }

  /** Reminders fire once; JS re-arms the next occurrences on every sync. */
  fun onReminderFired(ctx: Context, id: String) {
    val current = reminders(ctx).toMutableMap()
    if (current.remove(id) != null) saveReminders(ctx, current)
  }

  /** One quiet notification on the Task alerts channel. */
  fun postAlert(ctx: Context, id: String, title: String, body: String) {
    ensureChannels(ctx)
    try {
      NotificationManagerCompat.from(ctx).notify(alertNotifId(id), alertNotification(ctx, title, body))
    } catch (_: SecurityException) {
      // notifications not granted; nothing to post
    }
  }

  fun alertNotification(ctx: Context, title: String, body: String): Notification {
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let {
      PendingIntent.getActivity(
        ctx, 1, it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    return NotificationCompat.Builder(ctx, CHANNEL_ALERTS)
      .setSmallIcon(R.drawable.ic_motor_stat)
      .setContentTitle(title)
      .setContentText(body)
      .setAutoCancel(true)
      .setContentIntent(launch)
      .build()
  }

  fun setSnoozeMinutes(ctx: Context, minutes: Int) {
    prefs(ctx).edit().putInt(KEY_SNOOZE_MINUTES, minutes).apply()
  }

  fun snoozeMinutes(ctx: Context): Int = prefs(ctx).getInt(KEY_SNOOZE_MINUTES, 5)

  // ---- reliability surfaces ----

  fun isIgnoringBatteryOptimizations(ctx: Context): Boolean {
    val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
    return pm.isIgnoringBatteryOptimizations(ctx.packageName)
  }

  fun requestIgnoreBatteryOptimizations(ctx: Context): Boolean = try {
    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
      .setData(Uri.parse("package:${ctx.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    ctx.startActivity(intent)
    true
  } catch (_: Exception) {
    false
  }

  fun areNotificationsEnabled(ctx: Context): Boolean =
    NotificationManagerCompat.from(ctx).areNotificationsEnabled()

  fun openNotificationSettings(ctx: Context) {
    ctx.startActivity(
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
  }

  /**
   * Lands on the app's details page — the most reliable deep link into OEM
   * permission screens (MIUI "Other permissions" lives one tap from here).
   */
  fun openAppDetails(ctx: Context) {
    ctx.startActivity(
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .setData(Uri.parse("package:${ctx.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
  }

  /**
   * Best-effort hop into OEM "autostart / start in background" screens
   * (MIUI on the Redmis, HiOS on the Infinix). Returns false when none of the
   * known components exist and we fell back to plain app details.
   */
  fun openAutostart(ctx: Context): Boolean {
    val candidates = listOf(
      ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
      ComponentName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity"),
      ComponentName("com.xiaomi.misettings", "com.xiaomi.misettings.startupautoboot.StartupAutobootActivity"),
      ComponentName("com.transsion.autostart", "com.transsion.autostart.OftenUsedPermissionActivity"),
      ComponentName("com.ihi.app.control", "com.ihi.app.control.activity.StartActivity")
    )
    val pm = ctx.packageManager
    for (c in candidates) {
      try {
        if (pm.getActivityInfo(c, PackageManager.MATCH_DISABLED_COMPONENTS) != null) {
          ctx.startActivity(
            Intent().setComponent(c).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          )
          return true
        }
      } catch (_: Exception) {
        // not installed on this phone, try the next
      }
    }
    openAppDetails(ctx)
    return false
  }
}
