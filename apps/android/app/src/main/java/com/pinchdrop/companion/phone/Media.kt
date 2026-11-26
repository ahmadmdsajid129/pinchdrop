package com.pinchdrop.companion.phone

import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.util.Base64
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * v2 · Now playing on the PC's Island (music, YouTube, podcasts…) with play / pause / next.
 * Uses the same "Notification access" the user already allowed; only the title, artist, app
 * and a small cover picture are sent, while the PC is connected.
 */
object MediaWatcher {
    private val main = Handler(Looper.getMainLooper())
    private var manager: MediaSessionManager? = null
    private var controller: MediaController? = null
    private var lastSent: String? = null
    private lateinit var app: Context

    private val sessionsChanged = MediaSessionManager.OnActiveSessionsChangedListener { list -> pick(list.orEmpty()) }
    private val callback = object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?) = schedule()
        override fun onPlaybackStateChanged(state: PlaybackState?) = schedule()
        override fun onSessionDestroyed() {
            main.post { pick(currentSessions()) }
        }
    }
    private val sendNow = Runnable { push() }

    fun start(context: Context) {
        app = context.applicationContext
        main.post {
            if (manager != null || !NotifyListener.accessGranted(app)) return@post
            val m = app.getSystemService(MediaSessionManager::class.java) ?: return@post
            val component = ComponentName(app, NotifyListener::class.java)
            runCatching {
                m.addOnActiveSessionsChangedListener(sessionsChanged, component, main)
                manager = m
                pick(m.getActiveSessions(component))
            }
        }
    }

    fun stop() {
        main.post {
            runCatching { manager?.removeOnActiveSessionsChangedListener(sessionsChanged) }
            controller?.unregisterCallback(callback)
            controller = null
            manager = null
            lastSent = null
        }
    }

    private fun currentSessions(): List<MediaController> = runCatching {
        manager?.getActiveSessions(ComponentName(app, NotifyListener::class.java)).orEmpty()
    }.getOrDefault(emptyList())

    /** Follows the session that's playing (or the most recent one). */
    private fun pick(list: List<MediaController>) {
        val next = list.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING } ?: list.firstOrNull()
        if (next?.sessionToken == controller?.sessionToken) return schedule()
        controller?.unregisterCallback(callback)
        controller = next
        next?.registerCallback(callback, main)
        schedule()
    }

    private fun schedule() {
        main.removeCallbacks(sendNow)
        main.postDelayed(sendNow, 300)
    }

    private fun push() {
        val c = controller
        val md = c?.metadata
        val title = md?.getString(MediaMetadata.METADATA_KEY_TITLE) ?: md?.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)
        val p = JSONObject()
        if (c == null || md == null || title.isNullOrBlank()) {
            p.put("title", "")
        } else {
            val appName = runCatching {
                val pm = app.packageManager
                pm.getApplicationLabel(pm.getApplicationInfo(c.packageName, 0)).toString()
            }.getOrDefault("")
            p.put("title", title.take(200))
                .put("artist", (md.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: md.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE) ?: "").take(200))
                .put("app", appName)
                .put("playing", c.playbackState?.state == PlaybackState.STATE_PLAYING)
            val art = md.getBitmap(MediaMetadata.METADATA_KEY_ART) ?: md.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART) ?: md.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON)
            art?.let { small(it) }?.let { p.put("art", it) }
        }
        // Don't repeat the same state (covers are heavy).
        val key = p.optString("title") + p.optString("artist") + p.optBoolean("playing")
        if (key == lastSent) return
        lastSent = key
        PhoneData.push("media.state", p)
    }

    private fun small(b: Bitmap): String? = runCatching {
        val side = 128
        val scaled = Bitmap.createScaledBitmap(b, side, (side * b.height / b.width.coerceAtLeast(1)).coerceIn(1, 256), true)
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 75, out)
        if (out.size() > 48 * 1024) null else "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }.getOrNull()

    /** play / pause / toggle / next / previous from the PC. */
    fun command(action: String) {
        val t = controller?.transportControls ?: throw NoPermission()
        val playing = controller?.playbackState?.state == PlaybackState.STATE_PLAYING
        when (action) {
            "play" -> t.play()
            "pause" -> t.pause()
            "toggle" -> if (playing) t.pause() else t.play()
            "next" -> t.skipToNext()
            "previous" -> t.skipToPrevious()
        }
    }
}
