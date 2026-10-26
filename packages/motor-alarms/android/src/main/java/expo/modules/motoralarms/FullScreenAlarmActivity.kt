package expo.modules.motoralarms

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationManagerCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Full-screen takeover shown by the alarm's full-screen intent: lights the
 * screen over the lockscreen and rings until dismissed. It plays the alarm
 * sound itself instead of leaning on the notification channel — OEM layers
 * (MIUI) mangle channel sounds, and while this screen is up its notification
 * is cancelled anyway. On MIUI without the "display pop-up windows in
 * background" permission this never launches and the insistent notification
 * remains the fallback — which is why that permission is in the checklist.
 */
class FullScreenAlarmActivity : Activity() {

  // app/src/theme.ts dark palette — the takeover always presents dark
  private val BG = 0xFF09090B.toInt()
  private val RAISED = 0xFF1A1A1F.toInt()
  private val TEXT = 0xFFF4F4F5.toInt()
  private val DIM = 0xFF8B8B93.toInt()
  private val AMBER = 0xFFFBBF24.toInt()
  private val AMBER_BG = 0xFF3A2D0B.toInt()

  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setShowWhenLocked(true)
    setTurnScreenOn(true)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    window.setBackgroundDrawable(ColorDrawable(BG))

    // this screen is now the alarm's presentation — its notification (and the
    // looping sound on it) would only double with ours
    intent?.getStringExtra(AlarmReceiver.EXTRA_ID)?.let {
      NotificationManagerCompat.from(this).cancel(AlarmScheduler.notifId(it))
    }

    setContentView(buildUi())
    hideSystemBars()
    startRinging()
  }

  private fun buildUi(): View {
    val body = intent?.getStringExtra(AlarmReceiver.EXTRA_BODY) ?: ""

    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(dp(24), dp(24), dp(24), dp(24))
      addView(badge())
      addView(label("CHORE DUE", color = AMBER, sizeSp = 12f, weight = Typeface.BOLD, tracking = 0.15f, topDp = 24))
      addView(
        label(
          intent?.getStringExtra(AlarmReceiver.EXTRA_TITLE) ?: "Chore due",
          color = TEXT, sizeSp = 26f, weight = Typeface.BOLD, topDp = 10
        )
      )
      if (body.isNotEmpty()) {
        addView(label(body, color = DIM, sizeSp = 15f, topDp = 8))
      }
    }

    val actions = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(24), 0, dp(24), dp(28))
      addView(pill("Open app", AMBER, BG) { launchMain() })
      addView(pill("Dismiss", RAISED, TEXT, topDp = 10) { finish() })
    }

    return LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(BG)
      addView(content, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
      addView(actions, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }
  }

  /** The app's mark in a soft amber ring — amber is the alarm's color. */
  private fun badge(): View {
    val mark = ImageView(this).apply {
      setImageResource(R.drawable.ic_motor_stat)
      setColorFilter(AMBER)
    }
    return FrameLayout(this).apply {
      layoutParams = LinearLayout.LayoutParams(dp(72), dp(72))
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(AMBER_BG)
      }
      addView(mark, FrameLayout.LayoutParams(dp(32), dp(32), Gravity.CENTER))
    }
  }

  private fun label(
    text: String,
    color: Int,
    sizeSp: Float,
    weight: Int = Typeface.NORMAL,
    tracking: Float = 0f,
    topDp: Int = 0,
  ): TextView = TextView(this).apply {
    this.text = text
    setTextColor(color)
    textSize = sizeSp
    typeface = Typeface.create(Typeface.DEFAULT, weight)
    letterSpacing = tracking
    setLineSpacing(dp(3).toFloat(), 1f)
    gravity = Gravity.CENTER
    layoutParams = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
    ).apply { topMargin = dp(topDp) }
  }

  /** Full-width pill button, 54dp tall, app style: filled, no border. */
  private fun pill(text: String, fill: Int, textColor: Int, topDp: Int = 0, onClick: () -> Unit): TextView =
    TextView(this).apply {
      this.text = text
      setTextColor(textColor)
      textSize = 15f
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      gravity = Gravity.CENTER
      background = RippleDrawable(
        ColorStateList.valueOf(0x33FFFFFF),
        GradientDrawable().apply { cornerRadius = dp(27).toFloat(); setColor(fill) },
        null
      )
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, dp(54)
      ).apply { topMargin = dp(topDp) }
      setOnClickListener { onClick() }
    }

  private fun hideSystemBars() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    WindowInsetsControllerCompat(window, window.decorView).apply {
      hide(WindowInsetsCompat.Type.systemBars())
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
  }

  private fun startRinging() {
    try {
      player = MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
        resources.openRawResourceFd(R.raw.motor_alarm).use { afd ->
          setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
        }
        prepare()
        isLooping = true
        start()
      }
    } catch (_: Exception) {
      player = null  // a broken sound must never block the takeover
    }
    vibrator = getSystemService(Vibrator::class.java)?.apply {
      vibrate(VibrationEffect.createWaveform(longArrayOf(0, 400, 200, 400, 200, 400), 0))
    }
  }

  private fun launchMain() {
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      startActivity(it)
    }
    finish()
  }

  override fun onDestroy() {
    player?.release()
    player = null
    vibrator?.cancel()
    super.onDestroy()
  }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
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
