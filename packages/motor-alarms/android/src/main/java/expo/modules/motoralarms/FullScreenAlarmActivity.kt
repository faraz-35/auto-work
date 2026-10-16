package expo.modules.motoralarms

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationManagerCompat

/**
 * Full-screen takeover shown by the alarm's full-screen intent: lights the
 * screen over the lockscreen and rings (the insistent notification sound)
 * until dismissed. On MIUI without the "display pop-up windows in background"
 * permission this never launches and the heads-up notification is the
 * fallback — which is why that permission is in the app's checklist.
 */
class FullScreenAlarmActivity : Activity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setShowWhenLocked(true)
    setTurnScreenOn(true)

    val id = intent?.getStringExtra(AlarmReceiver.EXTRA_ID)
    val title = intent?.getStringExtra(AlarmReceiver.EXTRA_TITLE) ?: "Chore due"
    val body = intent?.getStringExtra(AlarmReceiver.EXTRA_BODY) ?: ""

    val dp = resources.displayMetrics.density
    val pad = (dp * 28).toInt()

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(0xFF09090B.toInt())
      setPadding(pad, pad, pad, pad)
    }
    val titleView = TextView(this).apply {
      text = title.uppercase()
      textSize = 32f
      setTextColor(0xFF22D3EE.toInt())
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      gravity = Gravity.CENTER
    }
    val bodyView = TextView(this).apply {
      text = body
      textSize = 16f
      setTextColor(0xFFA1A1AA.toInt())
      gravity = Gravity.CENTER
      setPadding(0, pad, 0, pad * 2)
    }
    val open = Button(this).apply {
      text = "Open app"
      setOnClickListener { launchMain() }
    }
    val dismiss = Button(this).apply {
      text = "Dismiss"
      setOnClickListener { finish() }
    }
    root.addView(titleView)
    root.addView(bodyView)
    root.addView(open)
    root.addView(dismiss)
    setContentView(root)
    notifIdToCancel = id?.let { AlarmScheduler.notifId(it) }
  }

  private var notifIdToCancel: Int? = null

  private fun launchMain() {
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      startActivity(it)
    }
    finish()
  }

  override fun onDestroy() {
    // the insistent sound loops until its notification is cancelled — either
    // button here counts as "acknowledged"
    notifIdToCancel?.let { NotificationManagerCompat.from(this).cancel(it) }
    super.onDestroy()
  }
}

/** PendingIntents targeting the takeover screen. */
object FullScreen {
  fun intent(ctx: Context, alarm: AlarmScheduler.Alarm): PendingIntent =
    PendingIntent.getActivity(
      ctx, (AlarmScheduler.ACTION_PREFIX + alarm.id).hashCode(),
      Intent(ctx, FullScreenAlarmActivity::class.java)
        .putExtra(AlarmReceiver.EXTRA_ID, alarm.id)
        .putExtra(AlarmReceiver.EXTRA_TITLE, alarm.title)
        .putExtra(AlarmReceiver.EXTRA_BODY, alarm.body)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
}
