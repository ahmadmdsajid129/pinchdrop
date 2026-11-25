package com.pinchdrop.companion.phone

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import android.provider.ContactsContract.CommonDataKinds.Phone as P
import android.provider.Telephony
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

fun Context.has(permission: String) = ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

/** Thrown when the user hasn't allowed something on the phone (LINK-v1 §6.6 `no_permission`). */
class NoPermission : Exception()

/**
 * v2 · Text messages (SMS), read straight from Android's message store; sending goes through
 * Android, which also files the message in the phone's own Messages app. Nothing is copied or kept.
 */
object SmsStore {
    private const val SCAN_ROWS = 4000

    fun threads(context: Context, limit: Int): JSONArray {
        if (!context.has(Manifest.permission.READ_SMS)) throw NoPermission()
        data class T(val id: Long, val address: String, val snippet: String, val date: Long, val outgoing: Boolean, var unread: Int)
        val byThread = LinkedHashMap<Long, T>()
        context.contentResolver.query(
            Telephony.Sms.CONTENT_URI,
            arrayOf(Telephony.Sms.THREAD_ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE, Telephony.Sms.TYPE, Telephony.Sms.READ),
            null, null, "${Telephony.Sms.DATE} DESC",
        )?.use { c ->
            var n = 0
            while (c.moveToNext() && n++ < SCAN_ROWS) {
                val tid = c.getLong(0)
                val type = c.getInt(4)
                val t = byThread.getOrPut(tid) {
                    // Rows come newest first: the first row of a thread is its latest message.
                    T(tid, c.getString(1) ?: "", c.getString(2) ?: "", c.getLong(3), type != Telephony.Sms.MESSAGE_TYPE_INBOX, 0)
                }
                if (type == Telephony.Sms.MESSAGE_TYPE_INBOX && c.getInt(5) == 0) t.unread++
            }
        }
        val out = JSONArray()
        byThread.values.take(limit).forEach { t ->
            out.put(
                JSONObject()
                    .put("threadId", t.id)
                    .put("address", t.address)
                    .put("name", Names.of(context, t.address) ?: JSONObject.NULL)
                    .put("snippet", t.snippet.take(200))
                    .put("date", t.date)
                    .put("unread", t.unread)
                    .put("outgoing", t.outgoing),
            )
        }
        return out
    }

    fun thread(context: Context, threadId: Long, limit: Int): JSONObject {
        if (!context.has(Manifest.permission.READ_SMS)) throw NoPermission()
        val msgs = mutableListOf<JSONObject>()
        var address = ""
        context.contentResolver.query(
            Telephony.Sms.CONTENT_URI,
            arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE, Telephony.Sms.TYPE),
            "${Telephony.Sms.THREAD_ID} = ?", arrayOf(threadId.toString()), "${Telephony.Sms.DATE} DESC",
        )?.use { c ->
            while (c.moveToNext() && msgs.size < limit) {
                if (address.isEmpty()) address = c.getString(1) ?: ""
                val type = c.getInt(4)
                msgs += JSONObject()
                    .put("id", c.getLong(0))
                    .put("body", c.getString(2) ?: "")
                    .put("date", c.getLong(3))
                    .put("outgoing", type != Telephony.Sms.MESSAGE_TYPE_INBOX)
                    .put(
                        "status",
                        when (type) {
                            Telephony.Sms.MESSAGE_TYPE_INBOX -> "received"
                            Telephony.Sms.MESSAGE_TYPE_SENT -> "sent"
                            Telephony.Sms.MESSAGE_TYPE_FAILED -> "failed"
                            else -> "sending"
                        },
                    )
            }
        }
        return JSONObject()
            .put("threadId", threadId)
            .put("address", address)
            .put("name", Names.of(context, address) ?: JSONObject.NULL)
            .put("messages", JSONArray(msgs.reversed()))
    }

    fun send(context: Context, address: String, text: String) {
        if (!context.has(Manifest.permission.SEND_SMS)) throw NoPermission()
        require(address.isNotBlank() && text.isNotBlank())
        val sms = if (Build.VERSION.SDK_INT >= 31) context.getSystemService(SmsManager::class.java) else @Suppress("DEPRECATION") SmsManager.getDefault()
        val parts = sms.divideMessage(text)
        if (parts.size == 1) sms.sendTextMessage(address, null, text, null, null)
        else sms.sendMultipartTextMessage(address, null, parts, null, null)
    }
}

/** Contact names for phone numbers (cached per session). */
object Names {
    private val cache = HashMap<String, String?>()

    @Synchronized
    fun of(context: Context, number: String): String? {
        if (number.isBlank() || !context.has(Manifest.permission.READ_CONTACTS)) return null
        return cache.getOrPut(number) {
            runCatching {
                context.contentResolver.query(
                    Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number)),
                    arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null,
                )?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
            }.getOrNull()
        }
    }

    @Synchronized
    fun clear() = cache.clear()
}

/** v2 · Contacts with their phone numbers (read-only). */
object ContactsStore {
    private const val MAX = 5000

    fun list(context: Context): JSONArray {
        if (!context.has(Manifest.permission.READ_CONTACTS)) throw NoPermission()
        data class C(val id: Long, val name: String, val starred: Boolean, val numbers: MutableList<Pair<String, String>>)
        val byId = LinkedHashMap<Long, C>()
        context.contentResolver.query(
            P.CONTENT_URI,
            arrayOf(P.CONTACT_ID, P.DISPLAY_NAME_PRIMARY, P.NUMBER, P.TYPE, P.LABEL, P.STARRED),
            null, null, "${P.DISPLAY_NAME_PRIMARY} COLLATE NOCASE ASC",
        )?.use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(0)
                if (byId.size >= MAX && id !in byId) continue
                val entry = byId.getOrPut(id) { C(id, c.getString(1) ?: "", c.getInt(5) == 1, mutableListOf()) }
                val number = c.getString(2) ?: continue
                val label = P.getTypeLabel(context.resources, c.getInt(3), c.getString(4)).toString()
                if (entry.numbers.none { it.first.filter(Char::isDigit) == number.filter(Char::isDigit) }) entry.numbers += number to label
            }
        }
        val out = JSONArray()
        byId.values.filter { it.name.isNotBlank() && it.numbers.isNotEmpty() }.forEach { ct ->
            val nums = JSONArray()
            ct.numbers.forEach { (n, l) -> nums.put(JSONObject().put("number", n).put("label", l)) }
            out.put(JSONObject().put("id", ct.id).put("name", ct.name).put("starred", ct.starred).put("numbers", nums))
        }
        return out
    }
}
