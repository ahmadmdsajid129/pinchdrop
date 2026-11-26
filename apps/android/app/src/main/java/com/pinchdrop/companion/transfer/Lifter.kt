package com.pinchdrop.companion.transfer

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Base64
import androidx.compose.ui.graphics.asAndroidBitmap
import com.pinchdrop.companion.data.ItemKind
import com.pinchdrop.companion.link.Proto
import com.pinchdrop.companion.ui.loadThumbnail
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.UUID

/**
 * v2 · Lift: phone → PC (LINK-v1 §6.5).
 *
 * Share → PinchDrop prepares the item; a pinch in front of the phone lifts it ("in the air");
 * an open hand at the laptop's webcam catches it there, and the PC pulls the files from here.
 * Files are read straight from the sharing app's content URIs and streamed; nothing is copied.
 */
object Lifter {
    data class OutFile(val uri: Uri, val name: String, val size: Long, val mime: String)

    data class Item(
        val files: List<OutFile>,
        val texts: List<String>,
        val label: String,
        val totalBytes: Long,
        val kind: ItemKind,
        /** First photo / video, for previews. */
        val thumbUri: String?,
    )

    sealed interface State {
        data object Idle : State
        data object Preparing : State
        data class Ready(val item: Item, val note: String? = null) : State
        data class InAir(val item: Item, val id: String, val expiresAtMs: Long, val totalSecs: Int) : State
        data class Sending(val item: Item, val id: String, val bytesSent: Long) : State
        data class Done(val item: Item) : State
        data class Failed(val item: Item?, val message: String) : State
    }

    private const val CATCH_SECS = 30
    private const val CHUNK_MAX = 524_288L
    private const val THUMB_MAX_BYTES = 90 * 1024

    private val _state = MutableStateFlow<State>(State.Idle)
    val state: StateFlow<State> = _state.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var app: Context
    @Volatile private var sendText: (String) -> Boolean = { false }
    @Volatile private var sendBytes: (ByteArray) -> Boolean = { false }
    @Volatile var connected = false
        private set
    private var expiry: Job? = null
    private var server: Job? = null
    private var requests = Channel<JSONObject>(Channel.UNLIMITED)

    fun init(context: Context) {
        if (!::app.isInitialized) app = context.applicationContext
    }

    fun onConnected(text: (String) -> Boolean, bytes: (ByteArray) -> Boolean) {
        sendText = text
        sendBytes = bytes
        connected = true
    }

    fun onDisconnected() {
        connected = false
        sendText = { false }
        sendBytes = { false }
        when (val s = _state.value) {
            is State.InAir -> _state.value = State.Ready(s.item, "Your PC disconnected. Pinch again when it's back.")
            is State.Sending -> fail(s.item, "The connection to your PC dropped.")
            else -> Unit
        }
    }

    // ------------------------------------------------------------ share → ready

    /** Reads a Share intent. Returns false if it carries nothing PinchDrop can send. */
    fun prepare(context: Context, intent: Intent): Boolean {
        init(context)
        if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) return false
        val uris: List<Uri> = if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
            streamList(intent)
        } else {
            listOfNotNull(stream(intent))
        }
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.takeIf { it.isNotEmpty() }
        if (uris.isEmpty() && text == null) return false
        cancel() // a new share replaces anything still in the air
        _state.value = State.Preparing
        val resolver = context.applicationContext.contentResolver
        scope.launch {
            val files = uris.mapNotNull { u -> describe(resolver, u) }
            val item = if (files.isNotEmpty()) {
                val kind = when {
                    files.size > 1 -> ItemKind.FOLDER
                    files[0].mime.startsWith("image/") -> ItemKind.PHOTO
                    files[0].mime.startsWith("video/") -> ItemKind.VIDEO
                    else -> ItemKind.FILE
                }
                Item(
                    files = files,
                    texts = emptyList(),
                    label = if (files.size == 1) files[0].name else "${files.size} items",
                    totalBytes = files.sumOf { it.size },
                    kind = kind,
                    thumbUri = files.firstOrNull { it.mime.startsWith("image/") || it.mime.startsWith("video/") }?.uri?.toString(),
                )
            } else if (text != null) {
                val link = Regex("^https?://\\S+$", RegexOption.IGNORE_CASE).matches(text)
                Item(emptyList(), listOf(text), if (link) (Uri.parse(text).host?.removePrefix("www.") ?: "Link") else "Note", text.length.toLong(), ItemKind.TEXT, null)
            } else null
            _state.value = if (item != null) State.Ready(item) else State.Failed(null, "PinchDrop couldn't read what was shared.")
        }
        return true
    }

    @Suppress("DEPRECATION")
    private fun stream(i: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableExtra(Intent.EXTRA_STREAM)

    @Suppress("DEPRECATION")
    private fun streamList(i: Intent): List<Uri> =
        (if (Build.VERSION.SDK_INT >= 33) i.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableArrayListExtra(Intent.EXTRA_STREAM))
            ?.toList() ?: emptyList()

    /** v2: the PC should pass this send straight on to another device (Phone files, phone → phone). */
    @Volatile private var pendingRelay: String? = null

    private fun describe(resolver: android.content.ContentResolver, u: Uri): OutFile? = runCatching {
        if (u.scheme == "file") {
            val f = java.io.File(u.path ?: return@runCatching null)
            if (!f.isFile) return@runCatching null
            val mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(f.extension.lowercase()) ?: "application/octet-stream"
            return@runCatching OutFile(u, f.name, f.length(), mime)
        }
        var name: String? = null
        var size = -1L
        resolver.query(u, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                c.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 }?.let { name = c.getString(it) }
                c.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 && !c.isNull(it) }?.let { size = c.getLong(it) }
            }
        }
        if (size < 0) {
            // Unknown size: count it once (rare; some apps share streams without a size).
            size = resolver.openInputStream(u)?.use { s ->
                var n = 0L
                val buf = ByteArray(64 * 1024)
                while (true) { val r = s.read(buf); if (r < 0) break; n += r }
                n
            } ?: return@runCatching null
        }
        val mime = resolver.getType(u) ?: "application/octet-stream"
        OutFile(u, (name ?: u.lastPathSegment ?: "file").substringAfterLast('/'), size, mime)
    }.getOrNull()

    // ------------------------------------------------------------ lift → in the air

    /** v2 · Send these straight to the PC (a photo from its strip, a scan): no pinch needed. */
    fun sendNow(context: Context, uris: List<Uri>, relay: String? = null) {
        init(context)
        pendingRelay = relay
        val resolver = context.applicationContext.contentResolver
        scope.launch {
            val files = uris.mapNotNull { describe(resolver, it) }
            if (files.isEmpty()) return@launch
            val f = files[0]
            val kind = when {
                files.size > 1 -> ItemKind.FOLDER
                f.mime.startsWith("image/") -> ItemKind.PHOTO
                f.mime.startsWith("video/") -> ItemKind.VIDEO
                else -> ItemKind.FILE
            }
            val item = Item(
                files, emptyList(), if (files.size == 1) f.name else "${files.size} items", files.sumOf { it.size }, kind,
                files.firstOrNull { it.mime.startsWith("image/") }?.uri?.toString(),
            )
            _state.value = State.Ready(item)
            lift(sendNow = true)
        }
    }

    /** Pinched (or "Send without gesture"): tell the PC it's in the air. */
    fun lift(sendNow: Boolean = false) {
        val item = when (val s = _state.value) {
            is State.Ready -> s.item
            is State.Failed -> s.item ?: return
            else -> return
        }
        if (!connected) {
            _state.value = State.Ready(item, "Your PC isn't connected. Open PinchDrop on the PC and try again.")
            return
        }
        val id = UUID.randomUUID().toString()
        _state.value = State.InAir(item, id, System.currentTimeMillis() + CATCH_SECS * 1000L, CATCH_SECS)
        scope.launch {
            val files = JSONArray()
            item.files.forEachIndexed { i, f ->
                files.put(JSONObject().put("index", i).put("name", f.name).put("size", f.size).put("mime", f.mime))
            }
            val p = JSONObject()
                .put("liftId", id)
                .put("label", item.label)
                .put("totalBytes", item.totalBytes)
                .put("expiresInSecs", CATCH_SECS)
                .put("files", files)
                .put("texts", JSONArray(item.texts))
                .put("sendNow", sendNow)
            pendingRelay?.let { p.put("relay", it) }
            pendingRelay = null
            thumbOf(item)?.let { p.put("thumb", it) }
            if (!sendText(Proto.message("lift.offer", p))) {
                _state.value = State.Ready(item, "Couldn't reach your PC. Try again.")
                return@launch
            }
            expiry?.cancel()
            expiry = scope.launch {
                delay(CATCH_SECS * 1000L + 1500)
                val s = _state.value
                if (s is State.InAir && s.id == id) _state.value = State.Ready(item, "Not caught in time. Pinch to lift it again.")
            }
        }
    }

    /** A small JPEG of the first photo / video for the PC's card (≤ 90 KB). */
    private fun thumbOf(item: Item): String? {
        val uri = item.thumbUri ?: return null
        val bmp = loadThumbnail(app, uri, 320)?.asAndroidBitmap() ?: return null
        var quality = 75
        while (quality >= 35) {
            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)
            if (out.size() <= THUMB_MAX_BYTES) {
                return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            }
            quality -= 15
        }
        return null
    }

    /** Take it back (or close the Lift screen). */
    fun cancel() {
        val s = _state.value
        val id = when (s) {
            is State.InAir -> s.id
            is State.Sending -> s.id
            else -> null
        }
        if (id != null) sendText(Proto.message("lift.cancel", JSONObject().put("liftId", id).put("reason", "cancelled")))
        expiry?.cancel()
        server?.cancel()
        server = null
        _state.value = State.Idle
    }

    fun reset() {
        if (_state.value !is State.InAir && _state.value !is State.Sending) _state.value = State.Idle
    }

    private fun fail(item: Item?, message: String) {
        expiry?.cancel()
        server?.cancel()
        server = null
        _state.value = State.Failed(item, message)
    }

    // ------------------------------------------------------------ the PC caught it

    fun onMessage(type: String, p: JSONObject) {
        val id = p.optString("liftId")
        val s = _state.value
        val mine = (s is State.InAir && s.id == id) || (s is State.Sending && s.id == id)
        if (!mine) return
        when (type) {
            "lift.catch" -> if (s is State.InAir) {
                expiry?.cancel()
                _state.value = State.Sending(s.item, id, 0)
                if (s.item.files.isNotEmpty()) startServer(s.item, id)
            }
            "lift.req" -> requests.trySend(p)
            "lift.done" -> {
                server?.cancel()
                server = null
                val item = (s as? State.Sending)?.item ?: (s as State.InAir).item
                _state.value = State.Done(item)
            }
            "lift.cancel" -> {
                val item = (s as? State.Sending)?.item ?: (s as? State.InAir)?.item
                when (p.optString("reason")) {
                    "expired" -> { expiry?.cancel(); _state.value = State.Ready(item!!, "Not caught in time. Pinch to lift it again.") }
                    "cancelled" -> { expiry?.cancel(); _state.value = State.Ready(item!!, "Your PC said not now.") }
                    "replaced" -> { expiry?.cancel(); _state.value = State.Ready(item!!, "Something newer took its place.") }
                    else -> fail(item, "Your PC couldn't save it. Check its free space and try again.")
                }
            }
        }
    }

    /** Answers the PC's `lift.req`s one by one, in the order they come. */
    private fun startServer(item: Item, id: String) {
        server?.cancel()
        requests = Channel(Channel.UNLIMITED)
        val queue = requests
        server = scope.launch {
            var open: Triple<Int, InputStream, Long>? = null // index, stream, position
            var sent = 0L
            try {
                for (req in queue) {
                    val index = req.optInt("index", -1)
                    val offset = req.optLong("offset", -1)
                    val length = req.optLong("length", 0).coerceIn(0, CHUNK_MAX)
                    val f = item.files.getOrNull(index)
                    if (f == null || offset < 0 || offset > f.size) { failRemote(id, item, "unreadable"); return@launch }
                    val want = minOf(length, f.size - offset).toInt()
                    // Keep the stream open while the PC reads it in order; reopen only if it jumps.
                    var cur = open
                    if (cur == null || cur.first != index || cur.third != offset) {
                        cur?.second?.close()
                        val s = app.contentResolver.openInputStream(f.uri) ?: run { failRemote(id, item, "unreadable"); return@launch }
                        var skipped = 0L
                        while (skipped < offset) {
                            val k = s.skip(offset - skipped)
                            if (k <= 0) break
                            skipped += k
                        }
                        if (skipped != offset) { s.close(); failRemote(id, item, "unreadable"); return@launch }
                        cur = Triple(index, s, offset)
                    }
                    val buf = ByteArray(want)
                    var got = 0
                    while (got < want) {
                        val r = cur.second.read(buf, got, want - got)
                        if (r < 0) break
                        got += r
                    }
                    if (got != want) { cur.second.close(); failRemote(id, item, "unreadable"); return@launch }
                    open = Triple(index, cur.second, offset + want)
                    if (!sendBytes(frame(id, index, offset, buf))) {
                        fail(item, "The connection to your PC dropped.")
                        return@launch
                    }
                    sent += want
                    val st = _state.value
                    if (st is State.Sending && st.id == id) _state.value = st.copy(bytesSent = sent)
                }
            } finally {
                open?.second?.close()
            }
        }
    }

    private fun failRemote(id: String, item: Item, reason: String) {
        sendText(Proto.message("lift.cancel", JSONObject().put("liftId", id).put("reason", reason)))
        fail(item, "Couldn't read the shared file. Try sharing it again.")
    }

    /** `u32 headerLength ‖ header JSON ‖ data` (LINK-v1 §6.2 layout). */
    fun frame(id: String, index: Int, offset: Long, data: ByteArray): ByteArray {
        val header = JSONObject().put("t", id).put("i", index).put("o", offset).toString().toByteArray(Charsets.UTF_8)
        val out = ByteArray(4 + header.size + data.size)
        out[0] = (header.size ushr 24).toByte()
        out[1] = (header.size ushr 16).toByte()
        out[2] = (header.size ushr 8).toByte()
        out[3] = header.size.toByte()
        System.arraycopy(header, 0, out, 4, header.size)
        System.arraycopy(data, 0, out, 4 + header.size, data.size)
        return out
    }
}
