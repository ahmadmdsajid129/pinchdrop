package com.pinchdrop.companion.phone

import android.Manifest
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import org.json.JSONObject

/**
 * v2 · Calls on the PC (LINK-v1 §6.6): the PC's pill shows who's ringing; open palm = answer,
 * swipe = reject, fist = silence. The call itself stays on the phone.
 */
object Calls {
    /** ringing | active | idle */
    @Volatile var state = "idle"
        private set
    @Volatile private var number: String? = null
    @Volatile private var answered = false
    /** Ring volume before "silence", restored when the call ends. */
    private var mutedRing = false

    fun payload(context: Context): JSONObject = JSONObject()
        .put("state", state)
        .put("number", number ?: JSONObject.NULL)
        .put("name", number?.let { Names.of(context, it) } ?: JSONObject.NULL)

    /** From the PHONE_STATE broadcast. Android may send RINGING twice (with and without the number). */
    fun onPhoneState(context: Context, extra: String?, incoming: String?) {
        val next = when (extra) {
            TelephonyManager.EXTRA_STATE_RINGING -> "ringing"
            TelephonyManager.EXTRA_STATE_OFFHOOK -> "active"
            TelephonyManager.EXTRA_STATE_IDLE -> "idle"
            else -> return
        }
        val prev = state
        if (next == "ringing" && !incoming.isNullOrBlank()) number = incoming
        if (next == prev && (next != "ringing" || incoming.isNullOrBlank())) return
        state = next
        when (next) {
            "ringing" -> answered = false
            "active" -> answered = true
            "idle" -> {
                unmute(context)
                // Rang and stopped without being picked up: a missed call.
                PhoneData.push("call.state", payload(context).put("state", if (prev == "ringing" && !answered) "missed" else "ended"))
                number = null
                return
            }
        }
        PhoneData.push("call.state", payload(context))
    }

    @SuppressLint("MissingPermission")
    fun answer(context: Context) {
        if (!context.has(Manifest.permission.ANSWER_PHONE_CALLS)) throw NoPermission()
        check(state == "ringing")
        context.getSystemService(TelecomManager::class.java).acceptRingingCall()
    }

    @SuppressLint("MissingPermission")
    fun reject(context: Context) {
        if (!context.has(Manifest.permission.ANSWER_PHONE_CALLS)) throw NoPermission()
        check(state == "ringing" && Build.VERSION.SDK_INT >= 28)
        context.getSystemService(TelecomManager::class.java).endCall()
    }

    /** Stops the ringing but leaves the call ringing silently (the caller hears nothing different). */
    @SuppressLint("MissingPermission")
    fun silence(context: Context) {
        check(state == "ringing")
        val done = runCatching { context.getSystemService(TelecomManager::class.java).silenceRinger() }.isSuccess
        if (!done) {
            val audio = context.getSystemService(AudioManager::class.java)
            audio.adjustStreamVolume(AudioManager.STREAM_RING, AudioManager.ADJUST_MUTE, 0)
            mutedRing = true
        }
    }

    private fun unmute(context: Context) {
        if (!mutedRing) return
        mutedRing = false
        runCatching {
            context.getSystemService(AudioManager::class.java).adjustStreamVolume(AudioManager.STREAM_RING, AudioManager.ADJUST_UNMUTE, 0)
        }
    }
}

/** Android tells us when the phone rings, is answered, or hangs up (only with "Calls on your PC" allowed). */
class CallWatcher : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        @Suppress("DEPRECATION")
        Calls.onPhoneState(
            context.applicationContext,
            intent.getStringExtra(TelephonyManager.EXTRA_STATE),
            intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER),
        )
    }
}
