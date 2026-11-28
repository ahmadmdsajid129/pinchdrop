package com.pinchdrop.companion.phone

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import android.service.notification.StatusBarNotification
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import org.json.JSONObject

/**
 * v2 · Calls on the PC (LINK-v1 §6.6): the PC's pill shows who's ringing; open palm = answer,
 * swipe = reject, fist = silence. The call itself stays on the phone.
 *
 * Ringing is noticed three ways, because phone makers differ (Xiaomi/HyperOS can hold back the
 * system broadcast from background apps):
 *  1. a live call-state listener while the PC is connected (needs "Calls on your PC"),
 *  2. the PHONE_STATE broadcast (same permission; also gives the number),
 *  3. the dialer's own incoming-call notification (needs "Notifications on your PC"; gives the name).
 */
object Calls {
    /** ringing | active | idle */
    @Volatile var state = "idle"
        private set
    @Volatile private var number: String? = null
    @Volatile private var nameHint: String? = null
    @Volatile private var answered = false
    /** The dialer notification that said "incoming call", if that's how we noticed it. */
    @Volatile private var notifKey: String? = null
    /** v2: a call through an app (WhatsApp, Instagram, Messenger…): its name and notification. */
    @Volatile private var appName: String? = null
    @Volatile private var appCall: StatusBarNotification? = null
    /** The phone's own incoming-call notification (SIM call): its Answer / Decline buttons are the
     *  fallback on phones that ignore Android's accept/end-call (MIUI / HyperOS, some others). */
    @Volatile private var simCall: StatusBarNotification? = null

    /** The phone's own call screen (a SIM call), not an app. */
    private val DIALERS = setOf(
        "com.android.server.telecom", "com.android.incallui", "com.android.phone", "com.android.dialer",
        "com.google.android.dialer", "com.samsung.android.incallui", "com.samsung.android.dialer", "com.miui.voip",
    )

    private fun isDialer(context: Context, pkg: String): Boolean =
        pkg in DIALERS || runCatching { context.getSystemService(TelecomManager::class.java).defaultDialerPackage == pkg }.getOrDefault(false)
    private var mutedRing = false
    private var listening: Any? = null

    fun payload(context: Context): JSONObject {
        val name = number?.let { Names.of(context, it) } ?: nameHint
        return JSONObject()
            .put("state", state)
            .put("number", number ?: JSONObject.NULL)
            .put("name", name ?: JSONObject.NULL)
            .put("app", appName ?: JSONObject.NULL)
    }

    /** Moves to a new state and tells the PC (once per change; a late number or name is passed on too). */
    @Synchronized
    private fun set(context: Context, next: String, incoming: String? = null, name: String? = null) {
        val prev = state
        var changed = next != prev
        if (!incoming.isNullOrBlank() && incoming != number) { number = incoming; changed = true }
        if (!name.isNullOrBlank() && name != nameHint) { nameHint = name; changed = true }
        if (!changed) return
        state = next
        when (next) {
            "ringing" -> if (prev != "ringing") answered = false
            "active" -> answered = true
            "idle" -> {
                unmute(context)
                // Rang and stopped without being picked up: a missed call.
                PhoneData.push("call.state", payload(context).put("state", if (prev == "ringing" && !answered) "missed" else "ended"))
                number = null
                nameHint = null
                notifKey = null
                appName = null
                appCall = null
                simCall = null
                return
            }
        }
        PhoneData.push("call.state", payload(context))
    }

    /** From the PHONE_STATE broadcast. Android may send RINGING twice (with and without the number). */
    fun onPhoneState(context: Context, extra: String?, incoming: String?) {
        when (extra) {
            TelephonyManager.EXTRA_STATE_RINGING -> set(context, "ringing", incoming)
            TelephonyManager.EXTRA_STATE_OFFHOOK -> set(context, "active", incoming)
            TelephonyManager.EXTRA_STATE_IDLE -> set(context, "idle")
        }
    }

    private fun onCallState(context: Context, s: Int, incoming: String? = null) {
        when (s) {
            TelephonyManager.CALL_STATE_RINGING -> set(context, "ringing", incoming)
            TelephonyManager.CALL_STATE_OFFHOOK -> set(context, "active", incoming)
            TelephonyManager.CALL_STATE_IDLE -> set(context, "idle")
        }
    }

    /** Starts the live listener (while the PC is connected). */
    @SuppressLint("MissingPermission")
    fun startListening(context: Context) {
        val app = context.applicationContext
        if (listening != null || !app.has(Manifest.permission.READ_PHONE_STATE)) return
        val tm = app.getSystemService(TelephonyManager::class.java) ?: return
        runCatching {
            listening = if (Build.VERSION.SDK_INT >= 31) {
                val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                    override fun onCallStateChanged(s: Int) = onCallState(app, s)
                }
                tm.registerTelephonyCallback(app.mainExecutor, cb)
                cb
            } else {
                @Suppress("DEPRECATION")
                val l = object : PhoneStateListener() {
                    @Deprecated("Deprecated in Java")
                    override fun onCallStateChanged(s: Int, phoneNumber: String?) = onCallState(app, s, phoneNumber)
                }
                @Suppress("DEPRECATION")
                tm.listen(l, PhoneStateListener.LISTEN_CALL_STATE)
                l
            }
        }
    }

    fun stopListening(context: Context) {
        val l = listening ?: return
        listening = null
        val tm = context.applicationContext.getSystemService(TelephonyManager::class.java) ?: return
        runCatching {
            if (Build.VERSION.SDK_INT >= 31 && l is TelephonyCallback) tm.unregisterTelephonyCallback(l)
            else @Suppress("DEPRECATION") tm.listen(l as PhoneStateListener, PhoneStateListener.LISTEN_NONE)
        }
    }

    private fun actionTitles(n: Notification) = n.actions.orEmpty().map { it.title?.toString()?.lowercase().orEmpty() }
    private val ANSWER = Regex("answer|accept|pick up|join")
    private val DECLINE = Regex("decline|reject|dismiss|ignore|hang ?up|end call|cancel")

    /**
     * A call notification: the phone's own (SIM, gives the caller's name) or an app's
     * (WhatsApp, Instagram, Messenger… — the only way to see those calls at all).
     */
    fun onCallNotification(context: Context, sbn: StatusBarNotification) {
        val n = sbn.notification
        val titles = actionTitles(n)
        val looksLikeCall = n.category == Notification.CATEGORY_CALL ||
            (titles.any { ANSWER.containsMatchIn(it) } && titles.any { DECLINE.containsMatchIn(it) })
        if (!looksLikeCall) return
        val type = n.extras.getInt("android.callType", 0) // Notification.CallStyle: 1 = incoming, 2 = ongoing
        val fromApp = !isDialer(context, sbn.packageName)
        val canAnswer = titles.any { ANSWER.containsMatchIn(it) }
        // An app's *outgoing* call ("Calling…" on the phone that rings someone) has no Answer
        // button: only the phone being called gets one. SIM calls keep the system's call type.
        val incoming = if (fromApp) canAnswer && type != 2 else type == 1 || (type == 0 && (n.fullScreenIntent != null || canAnswer))
        val title = n.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim()
        if (incoming) {
            notifKey = sbn.key
            if (!fromApp) simCall = sbn
            if (fromApp) {
                appCall = sbn
                appName = runCatching {
                    val pm = context.packageManager
                    pm.getApplicationLabel(pm.getApplicationInfo(sbn.packageName, 0)).toString()
                }.getOrDefault("App")
            }
            // Some apps title it with their own name ("Instagram") and put the caller in the text.
            val text = n.extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim()
            val who = if (fromApp && (title.isNullOrBlank() || title.equals(appName, ignoreCase = true))) {
                text?.replace(Regex("(?i)\\s*(is calling.*|incoming (video |audio |voice )?call.*|calling.*)$"), "")?.trim()?.ifBlank { null } ?: title
            } else title
            set(context, "ringing", name = who)
        } else if (state == "ringing" && sbn.key == notifKey) {
            // The same notification turned into an ongoing call: answered.
            set(context, "active")
        }
    }

    fun onCallNotificationRemoved(context: Context, sbn: StatusBarNotification) {
        if (sbn.key != notifKey) return
        notifKey = null
        // App calls are only known through their notification; SIM calls only decide here
        // when Android's own call state isn't available.
        if (appCall != null || listening == null) {
            if (state == "ringing" || state == "active") set(context, "idle")
        }
    }

    /** Presses a button on a call notification (Answer / Decline). */
    private fun pressButton(context: Context, sbn: StatusBarNotification?, match: Regex): Boolean {
        sbn ?: return false
        val a = sbn.notification.actions?.firstOrNull { match.containsMatchIn(it.title?.toString()?.lowercase().orEmpty()) } ?: return false
        return runCatching { a.actionIntent.send(context, 0, Intent()); true }.getOrDefault(false)
    }

    private val main = android.os.Handler(android.os.Looper.getMainLooper())

    /**
     * Answers the ringing call. App calls: their notification's Answer. SIM calls: Android's
     * accept-call, and if the phone is still ringing a moment later (some phones ignore it), the
     * call notification's own Answer button.
     */
    @SuppressLint("MissingPermission")
    fun answer(context: Context) {
        check(state == "ringing")
        if (appCall != null) {
            check(pressButton(context, appCall, ANSWER))
            return
        }
        val tried = context.has(Manifest.permission.ANSWER_PHONE_CALLS) &&
            runCatching { context.getSystemService(TelecomManager::class.java).acceptRingingCall(); true }.getOrDefault(false)
        if (!tried) {
            if (!pressButton(context, simCall, ANSWER)) throw NoPermission()
            return
        }
        main.postDelayed({ if (state == "ringing") pressButton(context, simCall, ANSWER) }, 1200)
    }

    @SuppressLint("MissingPermission")
    fun reject(context: Context) {
        check(state == "ringing")
        if (appCall != null) {
            check(pressButton(context, appCall, DECLINE))
            return
        }
        val tried = Build.VERSION.SDK_INT >= 28 && context.has(Manifest.permission.ANSWER_PHONE_CALLS) &&
            runCatching { context.getSystemService(TelecomManager::class.java).endCall() }.getOrDefault(false)
        if (!tried) {
            if (!pressButton(context, simCall, DECLINE)) throw NoPermission()
            return
        }
        main.postDelayed({ if (state == "ringing") pressButton(context, simCall, DECLINE) }, 1200)
    }

    /** Stops the ringing but leaves the call ringing silently (the caller hears nothing different). */
    @SuppressLint("MissingPermission")
    fun silence(context: Context) {
        check(state == "ringing")
        // App calls ring through the ring stream too; muting it silences them.
        val done = appCall == null && runCatching { context.getSystemService(TelecomManager::class.java).silenceRinger() }.isSuccess
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
