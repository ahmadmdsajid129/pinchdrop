package com.pinchdrop.companion.phone

import android.Manifest
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.pinchdrop.companion.Notifications
import com.pinchdrop.companion.R
import org.json.JSONObject

/**
 * v2 · Unread text messages, for the 💬 badge on the PC's pill. Counted from the phone's own
 * message store whenever it changes; only the number is sent.
 */
object UnreadWatcher {
    private var observer: ContentObserver? = null
    private var last = -1
    private val main = Handler(Looper.getMainLooper())
    private val recount = Runnable { push() }
    private lateinit var app: Context

    fun start(context: Context) {
        app = context.applicationContext
        last = -1
        if (!app.has(Manifest.permission.READ_SMS)) return
        if (observer == null) {
            observer = object : ContentObserver(main) {
                override fun onChange(selfChange: Boolean) {
                    // Many rows change at once when a message is read; count once they settle.
                    main.removeCallbacks(recount)
                    main.postDelayed(recount, 600)
                }
            }.also { runCatching { app.contentResolver.registerContentObserver(Telephony.Sms.CONTENT_URI, true, it) } }
        }
        main.post(recount)
    }

    fun stop() {
        observer?.let { o -> runCatching { app.contentResolver.unregisterContentObserver(o) } }
        observer = null
        main.removeCallbacks(recount)
    }

    private fun push() {
        Thread {
            val n = runCatching {
                app.contentResolver.query(
                    Telephony.Sms.Inbox.CONTENT_URI, arrayOf(Telephony.Sms._ID),
                    "${Telephony.Sms.READ} = 0", null, null,
                )?.use { it.count } ?: 0
            }.getOrDefault(0)
            if (n != last) {
                last = n
                PhoneData.push("status.messages", JSONObject().put("unread", n))
            }
        }.start()
    }
}

/**
 * v2 · Find my phone: rings loudly (alarm volume, even on silent) until "I found it" is tapped,
 * PinchDrop is opened, the PC stops it, or a minute passes.
 */
object FindPhone {
    private var player: MediaPlayer? = null
    private var oldVolume = -1
    private val main = Handler(Looper.getMainLooper())
    private const val NOTIF_ID = 7999
    const val ACTION_STOP = "com.pinchdrop.companion.FOUND_IT"

    fun ring(context: Context) {
        val app = context.applicationContext
        main.post {
            if (player != null) return@post
            val audio = app.getSystemService(AudioManager::class.java)
            oldVolume = audio.getStreamVolume(AudioManager.STREAM_ALARM)
            runCatching { audio.setStreamVolume(AudioManager.STREAM_ALARM, audio.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0) }
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            player = runCatching {
                MediaPlayer().apply {
                    setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                    setDataSource(app, uri)
                    isLooping = true
                    prepare()
                    start()
                }
            }.getOrNull()
            val stop = PendingIntent.getBroadcast(
                app, 1, Intent(app, FoundItReceiver::class.java).setAction(ACTION_STOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            Notifications.ensureChannels(app)
            runCatching {
                NotificationManagerCompat.from(app).notify(
                    NOTIF_ID,
                    NotificationCompat.Builder(app, Notifications.CH_INCOMING)
                        .setSmallIcon(R.drawable.ic_stat_pinchdrop)
                        .setContentTitle("Your PC is looking for this phone")
                        .setContentText("Tap “I found it” to stop the sound")
                        .setPriority(NotificationCompat.PRIORITY_MAX)
                        .setCategory(NotificationCompat.CATEGORY_ALARM)
                        .setOngoing(true)
                        .setContentIntent(stop)
                        .addAction(0, "I found it", stop)
                        .build(),
                )
            }
            main.postDelayed({ stop(app) }, 60_000)
        }
    }

    fun stop(context: Context) {
        val app = context.applicationContext
        main.post {
            player?.let { runCatching { it.stop(); it.release() } }
            player = null
            if (oldVolume >= 0) {
                runCatching { app.getSystemService(AudioManager::class.java).setStreamVolume(AudioManager.STREAM_ALARM, oldVolume, 0) }
                oldVolume = -1
            }
            NotificationManagerCompat.from(app).cancel(NOTIF_ID)
            main.removeCallbacksAndMessages(null)
        }
    }
}

class FoundItReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == FindPhone.ACTION_STOP) FindPhone.stop(context)
    }
}

/**
 * v2 · Clipboard both ways (only when switched on in the PC's Settings).
 * PC → phone: copied text lands on the phone's clipboard. Phone → PC: Android only lets apps
 * read the clipboard while they're on screen, so the phone sends it when PinchDrop is opened.
 */
object ClipSync {
    @Volatile var enabled = false
    private var lastSent: String? = null
    private var lastSet: String? = null

    fun onConfig(on: Boolean) {
        enabled = on
    }

    fun setFromPc(context: Context, text: String) {
        if (!enabled || text.isEmpty()) return
        lastSet = text
        Handler(Looper.getMainLooper()).post {
            runCatching {
                context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("From your PC", text))
            }
        }
    }

    /** PinchDrop came on screen (or got focus): pass a newly copied text to the PC. */
    fun onForeground(context: Context) {
        if (!enabled) return
        val text = runCatching {
            context.getSystemService(ClipboardManager::class.java).primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(context)?.toString()
        }.getOrNull()?.take(100_000) ?: return
        if (text.isBlank() || text == lastSent || text == lastSet) return
        lastSent = text
        PhoneData.push("clip.set", JSONObject().put("text", text))
    }
}
