package com.pinchdrop.companion.phone

import android.app.Notification
import android.app.NotificationManager
import android.app.RemoteInput
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Bundle
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Base64
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * v2 · Mirrors the phone's notifications to the PC's Island (LINK-v1 §6.6).
 * Android starts this service only after the user turns on "Notification access" for PinchDrop.
 * Notifications are passed along while the PC is connected and never stored.
 */
class NotifyListener : NotificationListenerService() {
    override fun onListenerConnected() {
        instance = this
        PhoneData.sync()
    }

    override fun onListenerDisconnected() {
        if (instance === this) instance = null
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (!shouldMirror(sbn)) return
        payloadOf(this, sbn)?.let { PhoneData.push("notif.posted", it) }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        PhoneData.push("notif.removed", JSONObject().put("key", sbn.key))
    }

    private fun shouldMirror(sbn: StatusBarNotification): Boolean {
        val n = sbn.notification
        if (sbn.packageName == packageName) return false
        if (sbn.isOngoing || (n.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return false
        val r = Ranking()
        if (currentRanking?.getRanking(sbn.key, r) == true && r.importance < NotificationManager.IMPORTANCE_DEFAULT) return false
        val e = n.extras
        return !e.getCharSequence(Notification.EXTRA_TITLE).isNullOrBlank() || !e.getCharSequence(Notification.EXTRA_TEXT).isNullOrBlank()
    }

    companion object {
        @Volatile var instance: NotifyListener? = null
            private set

        fun accessGranted(context: Context): Boolean {
            val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
            val me = ComponentName(context, NotifyListener::class.java)
            return flat.split(':').any { ComponentName.unflattenFromString(it) == me }
        }

        /** Everything mirrorable that's showing right now (for `notif.sync`). */
        fun current(): List<JSONObject> {
            val l = instance ?: return emptyList()
            return runCatching { l.activeNotifications.orEmpty() }.getOrDefault(emptyArray())
                .filter { l.shouldMirror(it) }
                .sortedByDescending { it.postTime }
                .take(30)
                .mapNotNull { payloadOf(l, it) }
        }

        private val iconsSent = HashSet<String>()

        @Synchronized
        fun resetIcons() = iconsSent.clear()

        private fun payloadOf(context: Context, sbn: StatusBarNotification): JSONObject? = runCatching {
            val e = sbn.notification.extras
            val title = e.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
            val text = (e.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: e.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
            val pm = context.packageManager
            val appName = runCatching { pm.getApplicationLabel(pm.getApplicationInfo(sbn.packageName, 0)).toString() }.getOrDefault(sbn.packageName)
            val p = JSONObject()
                .put("key", sbn.key)
                .put("pkg", sbn.packageName)
                .put("app", appName)
                .put("title", title.take(200))
                .put("text", text.take(600))
                .put("time", sbn.postTime)
                .put("canReply", replyAction(sbn.notification) != null)
            val first = synchronized(this) { iconsSent.add(sbn.packageName) }
            if (first) iconOf(context, sbn.packageName)?.let { p.put("icon", it) }
            p
        }.getOrNull()

        private fun iconOf(context: Context, pkg: String): String? = runCatching {
            val d = context.packageManager.getApplicationIcon(pkg)
            val size = 64
            val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            d.setBounds(0, 0, size, size)
            d.draw(Canvas(bmp))
            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
            if (out.size() > 16 * 1024) null else "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        }.getOrNull()

        private fun replyAction(n: Notification): Notification.Action? =
            n.actions?.firstOrNull { a -> a.remoteInputs?.any { it.allowFreeFormInput } == true }

        fun dismiss(key: String): Boolean {
            val l = instance ?: return false
            l.cancelNotification(key)
            return true
        }

        /** Replies through the notification's own Reply action (WhatsApp, Messages, Gmail…). */
        fun reply(context: Context, key: String, text: String): Boolean {
            val l = instance ?: return false
            val sbn = l.activeNotifications?.firstOrNull { it.key == key } ?: return false
            val action = replyAction(sbn.notification) ?: return false
            val inputs = action.remoteInputs ?: return false
            val intent = Intent()
            val results = Bundle()
            inputs.filter { it.allowFreeFormInput }.forEach { results.putCharSequence(it.resultKey, text) }
            RemoteInput.addResultsToIntent(inputs, intent, results)
            action.actionIntent.send(context, 0, intent)
            return true
        }
    }
}
