package com.pinchdrop.companion.phone

import android.Manifest
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.provider.Telephony
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.pinchdrop.companion.Notifications
import com.pinchdrop.companion.R
import com.pinchdrop.companion.link.Proto
import com.pinchdrop.companion.transfer.Receiver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/**
 * v2 · The phone's side of notifications, messages and contacts on the PC (LINK-v1 §6.6).
 * Answers the PC's requests and passes along new notifications and texts while connected.
 */
object PhoneData {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var app: Context
    @Volatile private var send: (String) -> Boolean = { false }
    @Volatile private var connected = false

    val requestTypes = setOf(
        "sms.threads", "sms.thread", "sms.send", "contacts.list", "call.dial", "notif.dismiss", "notif.reply",
        "call.answer", "call.reject", "call.silence", "phone.ring", "phone.ring.stop",
    )
    /** Messages from the PC that need no reply. */
    val eventTypes = setOf("clip.set", "clip.config")

    fun onEvent(type: String, p: JSONObject) {
        if (!::app.isInitialized) return
        when (type) {
            "clip.config" -> ClipSync.onConfig(p.optBoolean("enabled"))
            "clip.set" -> ClipSync.setFromPc(app, p.optString("text").take(100_000))
        }
    }

    fun init(context: Context) {
        if (!::app.isInitialized) app = context.applicationContext
    }

    fun onConnected(sender: (String) -> Boolean) {
        send = sender
        connected = true
        Names.clear()
        NotifyListener.resetIcons()
        sync()
        UnreadWatcher.start(app)
        Calls.startListening(app)
        // A call already ringing (seen in the notification shade) when we connect.
        NotifyListener.instance?.let { l -> runCatching { l.activeNotifications.orEmpty().forEach { Calls.onCallNotification(app, it) } } }
        if (Calls.state != "idle") push("call.state", Calls.payload(app))
    }

    fun onDisconnected() {
        UnreadWatcher.stop()
        if (::app.isInitialized) Calls.stopListening(app)
        ClipSync.onConfig(false)
        connected = false
        send = { false }
    }

    /** Everything showing right now, so the PC starts with the same list as the phone. */
    fun sync() {
        if (!connected) return
        scope.launch {
            val items = NotifyListener.current()
            send(Proto.message("notif.sync", JSONObject().put("items", JSONArray(items))))
        }
    }

    fun push(type: String, payload: JSONObject) {
        if (connected) send(Proto.message(type, payload))
    }

    fun onRequest(type: String, p: JSONObject) {
        if (!::app.isInitialized) return
        val reqId = p.optString("reqId")
        if (reqId.isBlank()) return
        scope.launch {
            val reply = JSONObject().put("reqId", reqId)
            try {
                val data: JSONObject = when (type) {
                    "sms.threads" -> JSONObject().put("threads", SmsStore.threads(app, p.optInt("limit", 60).coerceIn(1, 100)))
                    "sms.thread" -> SmsStore.thread(app, p.optLong("threadId"), p.optInt("limit", 150).coerceIn(1, 300))
                    "sms.send" -> { SmsStore.send(app, p.optString("address"), p.optString("text").take(2000)); JSONObject() }
                    "contacts.list" -> JSONObject().put("contacts", ContactsStore.list(app))
                    "call.dial" -> JSONObject().put("how", dial(p.optString("number")))
                    "call.answer" -> { Calls.answer(app); JSONObject() }
                    "call.reject" -> { Calls.reject(app); JSONObject() }
                    "call.silence" -> { Calls.silence(app); JSONObject() }
                    "phone.ring" -> { FindPhone.ring(app); JSONObject() }
                    "phone.ring.stop" -> { FindPhone.stop(app); JSONObject() }
                    "notif.dismiss" -> { if (!NotifyListener.dismiss(p.optString("key"))) throw NoPermission(); JSONObject() }
                    "notif.reply" -> {
                        if (NotifyListener.instance == null) throw NoPermission()
                        if (!NotifyListener.reply(app, p.optString("key"), p.optString("text").take(2000))) error("no reply action")
                        JSONObject()
                    }
                    else -> { reply.put("ok", false).put("error", "unknown"); send(Proto.message("phone.reply", reply)); return@launch }
                }
                reply.put("ok", true).put("data", data)
            } catch (_: NoPermission) {
                reply.put("ok", false).put("error", "no_permission")
            } catch (_: Exception) {
                reply.put("ok", false).put("error", "failed")
            }
            send(Proto.message("phone.reply", reply))
        }
    }

    /**
     * Starts a call on the phone. Android only lets an app start a screen from the background
     * if "Display over other apps" is allowed; otherwise a notification offers the call.
     */
    private fun dial(number: String): String {
        require(number.isNotBlank())
        val canCall = app.has(Manifest.permission.CALL_PHONE)
        val canStart = Receiver.foreground || Settings.canDrawOverlays(app)
        val uri = Uri.fromParts("tel", number, null)
        if (canStart) {
            app.startActivity(Intent(if (canCall) Intent.ACTION_CALL else Intent.ACTION_DIAL, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return if (canCall) "calling" else "dialer"
        }
        val tap = PendingIntent.getActivity(
            app, number.hashCode(), Intent(Intent.ACTION_DIAL, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        Notifications.ensureChannels(app)
        runCatching {
            NotificationManagerCompat.from(app).notify(
                7000 + (number.hashCode() and 0xFFF),
                NotificationCompat.Builder(app, Notifications.CH_INCOMING)
                    .setSmallIcon(R.drawable.ic_stat_pinchdrop)
                    .setContentTitle("Call ${Names.of(app, number) ?: number}")
                    .setContentText("Tap to call — asked from your PC")
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setContentIntent(tap)
                    .build(),
            )
        }
        return "notification"
    }
}

/** A text message arrived: tell the PC (only while connected; nothing is kept). */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        msgs.groupBy { it.originatingAddress.orEmpty() }.forEach { (address, parts) ->
            val body = parts.joinToString("") { it.messageBody.orEmpty() }
            PhoneData.push(
                "sms.new",
                JSONObject()
                    .put("address", address)
                    .put("name", Names.of(context, address) ?: JSONObject.NULL)
                    .put("body", body.take(2000))
                    .put("date", parts.first().timestampMillis),
            )
        }
    }
}
