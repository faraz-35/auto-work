package expo.modules.motoralarms

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MotorAlarmsModule : Module() {
  private val ctx: Context?
    get() = appContext.reactContext

  override fun definition() = ModuleDefinition {
    Name("MotorAlarms")

    // Full desired-state reconcile: {"<id>": {at, title, body, rechain}}.
    // Alarms missing from the JSON are cancelled; the set persists for boot.
    AsyncFunction("syncAlarms") { json: String ->
      val c = ctx ?: throw IllegalStateException("no context")
      AlarmScheduler.ensureChannels(c)
      AlarmScheduler.syncAlarms(c, json)
    }

    // Same reconcile for quiet deadline reminders: {"<id>": {at, title, body}}.
    AsyncFunction("syncReminders") { json: String ->
      val c = ctx ?: throw IllegalStateException("no context")
      AlarmScheduler.ensureChannels(c)
      AlarmScheduler.syncReminders(c, json)
    }

    // One quiet notification on the Task alerts channel.
    AsyncFunction("notify") { id: String, title: String, body: String ->
      val c = ctx ?: throw IllegalStateException("no context")
      AlarmScheduler.postAlert(c, id, title, body)
    }

    AsyncFunction("snoozeAlarm") { id: String, minutes: Int ->
      ctx?.let { AlarmScheduler.snooze(it, id, minutes) }
    }

    AsyncFunction("setSnoozeMinutes") { minutes: Int ->
      ctx?.let { AlarmScheduler.setSnoozeMinutes(it, minutes) }
    }

    Function("isIgnoringBatteryOptimizations") {
      ctx?.let { AlarmScheduler.isIgnoringBatteryOptimizations(it) } ?: false
    }

    Function("notificationsEnabled") {
      ctx?.let { AlarmScheduler.areNotificationsEnabled(it) } ?: false
    }

    Function("openAutostartSettings") {
      ctx?.let { AlarmScheduler.openAutostart(it) } ?: false
    }

    Function("openAppDetails") {
      ctx?.let { AlarmScheduler.openAppDetails(it) }
    }

    AsyncFunction("requestIgnoreBatteryOptimizations") {
      ctx?.let { AlarmScheduler.requestIgnoreBatteryOptimizations(it) }
    }

    AsyncFunction("openNotificationSettings") {
      ctx?.let { AlarmScheduler.openNotificationSettings(it) }
    }
  }
}
