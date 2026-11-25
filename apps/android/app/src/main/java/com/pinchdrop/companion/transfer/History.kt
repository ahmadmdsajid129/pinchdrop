package com.pinchdrop.companion.transfer

import android.content.Context
import com.pinchdrop.companion.data.ItemKind
import com.pinchdrop.companion.data.enumOr
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** One row on the Received screen. */
data class ReceivedItem(
    val id: String,
    val name: String,
    val kind: ItemKind,
    val size: Long,
    val fileCount: Int,
    /** content:// or file:// of the saved file; null for folders and notes. */
    val uri: String?,
    /** Where it was saved, in words ("Gallery › PinchDrop"). */
    val location: String,
    val receivedAt: Long,
    val pcName: String,
    /** The note or link itself, for text items. */
    val text: String?,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id).put("name", name).put("kind", kind.name).put("size", size).put("fileCount", fileCount)
        .put("uri", uri ?: JSONObject.NULL).put("location", location).put("receivedAt", receivedAt)
        .put("pcName", pcName).put("text", text ?: JSONObject.NULL)

    companion object {
        fun fromJson(o: JSONObject) = ReceivedItem(
            id = o.getString("id"),
            name = o.optString("name"),
            kind = enumOr(o.optString("kind"), ItemKind.FILE),
            size = o.optLong("size"),
            fileCount = o.optInt("fileCount", 1),
            uri = o.optString("uri").takeIf { !o.isNull("uri") && it.isNotEmpty() },
            location = o.optString("location"),
            receivedAt = o.optLong("receivedAt"),
            pcName = o.optString("pcName"),
            text = o.optString("text").takeIf { !o.isNull("text") },
        )
    }
}

/** The phone's list of received items (app-private `received.json`, newest first, max 500). */
object History {
    private const val MAX = 500
    private val _items = MutableStateFlow<List<ReceivedItem>>(emptyList())
    val items: StateFlow<List<ReceivedItem>> = _items.asStateFlow()
    private var file: File? = null

    @Synchronized
    fun init(context: Context) {
        if (file != null) return
        val f = File(context.filesDir, "received.json")
        file = f
        _items.value = runCatching {
            val arr = JSONArray(f.readText())
            List(arr.length()) { ReceivedItem.fromJson(arr.getJSONObject(it)) }
        }.getOrDefault(emptyList())
    }

    @Synchronized
    fun add(items: List<ReceivedItem>) {
        if (items.isEmpty()) return
        _items.value = (items + _items.value).take(MAX)
        save()
    }

    /** Removes rows from the list only; the files stay on the phone. */
    @Synchronized
    fun remove(id: String) {
        _items.value = _items.value.filterNot { it.id == id }
        save()
    }

    @Synchronized
    fun clear() {
        _items.value = emptyList()
        save()
    }

    private fun save() {
        val f = file ?: return
        val arr = JSONArray().apply { _items.value.forEach { put(it.toJson()) } }
        val tmp = File(f.path + ".tmp")
        tmp.writeText(arr.toString())
        tmp.renameTo(f)
    }
}
