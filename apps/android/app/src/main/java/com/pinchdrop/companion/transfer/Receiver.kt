package com.pinchdrop.companion.transfer

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import com.pinchdrop.companion.Notifications
import com.pinchdrop.companion.data.ItemKind
import com.pinchdrop.companion.data.ManualSends
import com.pinchdrop.companion.data.SettingsStore
import com.pinchdrop.companion.link.LinkService
import com.pinchdrop.companion.link.Proto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.util.UUID

/**
 * Receives sends from the PC (LINK-v1 §6): answers offers, pulls file data in
 * chunks, writes it to Gallery / Downloads, resumes after a dropped link, and
 * records everything in [History]. One transfer runs at a time; others queue.
 */
object Receiver {
    private const val CHUNK = 524_288
    private const val WINDOW = 4
    private const val CHUNK_TIMEOUT_MS = 30_000L

    data class OfferFile(val index: Int, val segments: List<String>, val size: Long)

    data class Offer(
        val id: String,
        val label: String,
        val pcName: String,
        val destination: String,
        val openFirst: Boolean,
        val totalBytes: Long,
        val files: List<OfferFile>,
        val texts: List<String>,
        val raw: JSONObject,
    )

    data class Progress(
        val id: String,
        val label: String,
        val pcName: String,
        val filesDone: Int,
        val fileCount: Int,
        val bytesDone: Long,
        val totalBytes: Long,
        val bytesPerSec: Long,
        val paused: Boolean,
    )

    /** Shown by the Arrived screen / notification when something finishes. */
    data class Arrived(
        val name: String,
        val kind: ItemKind,
        val size: Long,
        val fileCount: Int,
        val pcName: String,
        val location: String,
        val uri: String?,
        val text: String?,
        val openFirst: Boolean,
    )

    /**
     * Something pinched on the PC and held for this phone to catch (P5/P6).
     * The Catch screen shows it; catching tells the PC to send it.
     */
    data class Hold(
        val id: String,
        val label: String,
        val fileCount: Long,
        val totalBytes: Long,
        val isFolder: Boolean,
        val pcName: String,
        val expiresAtMs: Long,
        val totalSecs: Int,
    ) {
        fun secondsLeft(): Int = ((expiresAtMs - System.currentTimeMillis() + 999) / 1000).toInt().coerceAtLeast(0)
    }

    private class Chunk(val id: String, val index: Int, val offset: Long, val data: ByteArray)

    /** A transfer being received; persisted so it survives a dropped link or an app restart. */
    private class JobState(
        val offer: Offer,
        var nextIndex: Int = 0,
        var currentUri: String? = null,
        val saved: MutableMap<Int, String> = mutableMapOf(),
    )

    private val _incoming = MutableStateFlow<Offer?>(null)
    /** An offer waiting for the user (when "Manual sends" is set to Ask). */
    val incoming: StateFlow<Offer?> = _incoming.asStateFlow()
    private val _progress = MutableStateFlow<Progress?>(null)
    val progress: StateFlow<Progress?> = _progress.asStateFlow()
    private val _hold = MutableStateFlow<Hold?>(null)
    /** What the PC is holding for this phone right now, if anything. */
    val hold: StateFlow<Hold?> = _hold.asStateFlow()
    /** Holds this phone caught: their sends are accepted without asking. */
    private val caughtHolds = mutableSetOf<String>()
    private val _arrivals = MutableSharedFlow<Arrived>(extraBufferCapacity = 4)
    val arrivals: SharedFlow<Arrived> = _arrivals.asSharedFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var app: Context
    private lateinit var settings: SettingsStore
    private lateinit var journalFile: File
    private val jobs = mutableListOf<JobState>()
    private val chunks = Channel<Chunk>(Channel.UNLIMITED)
    private var runner: Job? = null
    @Volatile private var connected = false
    @Volatile private var send: (String) -> Boolean = { false }
    @Volatile var pcName: String = "PC"
    /** True while the app is on screen (set by PcLink); used for clipboard and progress notifications. */
    @Volatile var foreground = false

    @Synchronized
    fun init(context: Context) {
        if (::app.isInitialized) return
        app = context.applicationContext
        settings = SettingsStore(app)
        History.init(app)
        journalFile = File(app.filesDir, "inbox.json")
        loadJournal()
        jobs.firstOrNull()?.let { j -> _progress.value = progressOf(j, paused = true) }
    }

    // ------------------------------------------------------------ link hooks (called by PcLink)

    fun onConnected(sender: (String) -> Boolean, name: String) {
        send = sender
        pcName = name
        connected = true
        ensureRunning()
    }

    fun onDisconnected() {
        connected = false
        send = { false }
        runner?.cancel()
        synchronized(this) { jobs.firstOrNull() }?.let { _progress.value = progressOf(it, paused = true) }
    }

    fun onMessage(type: String, p: JSONObject) {
        when (type) {
            "push.offer" -> parseOffer(p)?.let { scope.launch { handleOffer(it) } }
                ?: send(Proto.message("push.decline", JSONObject().put("transferId", p.optString("transferId"))))
            "transfer.cancel" -> scope.launch { finishEarly(p.optString("transferId"), cancelled = true) }
            "hold.offer" -> onHoldOffer(p)
            "hold.cancel" -> if (_hold.value?.id == p.optString("holdId")) clearHold()
            "transfer.error" -> scope.launch { finishEarly(p.optString("transferId"), cancelled = false) }
        }
    }

    /** Binary frame: u32 header length ‖ header JSON ‖ data (LINK-v1 §6.2). */
    fun onBinary(bytes: ByteArray) {
        if (bytes.size < 4) return
        val headerLen = ByteBuffer.wrap(bytes, 0, 4).int
        if (headerLen <= 0 || 4 + headerLen > bytes.size) return
        val h = runCatching { JSONObject(String(bytes, 4, headerLen, Charsets.UTF_8)) }.getOrNull() ?: return
        chunks.trySend(Chunk(h.optString("t"), h.optInt("i", -1), h.optLong("o", -1), bytes.copyOfRange(4 + headerLen, bytes.size)))
    }

    // ------------------------------------------------------------ holds (catch)

    private fun onHoldOffer(p: JSONObject) {
        val id = p.optString("holdId").takeIf { it.isNotBlank() } ?: return
        val secs = p.optInt("expiresInSecs", 30).coerceIn(5, 120)
        val h = Hold(
            id = id,
            label = p.optString("label").ifBlank { "Items" }.take(80),
            fileCount = p.optLong("fileCount"),
            totalBytes = p.optLong("totalBytes"),
            isFolder = p.optBoolean("isFolder"),
            pcName = pcName,
            expiresAtMs = System.currentTimeMillis() + secs * 1000L,
            totalSecs = secs,
        )
        _hold.value = h
        // Android won't let an app open the camera from the background, so ask the user to open it.
        if (!foreground) Notifications.postHold(app, h.pcName, h.label, h.fileCount, h.totalBytes, secs)
        scope.launch {
            kotlinx.coroutines.delay(secs * 1000L + 500)
            if (_hold.value?.id == id) clearHold()
        }
    }

    private fun clearHold() {
        _hold.value = null
        Notifications.cancelHold(app)
    }

    /** "Open your hand" (P6) or "Accept without gesture": tells the PC to send what it holds. */
    fun catchHold() {
        val h = _hold.value ?: return
        synchronized(this) { caughtHolds += h.id }
        send(Proto.message("hold.catch", JSONObject().put("holdId", h.id)))
        clearHold()
    }

    /** Declined on the phone; the PC keeps counting down and can still "Send now". */
    fun dismissHold() = clearHold()

    // ------------------------------------------------------------ offers

    private fun parseOffer(p: JSONObject): Offer? {
        val id = p.optString("transferId").takeIf { it.isNotBlank() } ?: return null
        val filesJson = p.optJSONArray("files") ?: JSONArray()
        val files = (0 until filesJson.length()).map { i ->
            val f = filesJson.getJSONObject(i)
            // Any unsafe path (absolute, "..", empty parts) and the whole offer is refused.
            val segs = Saver.safeSegments(f.optString("path")) ?: return null
            OfferFile(f.optInt("index", i), segs, f.optLong("size").coerceAtLeast(0))
        }
        val textsJson = p.optJSONArray("texts") ?: JSONArray()
        val texts = (0 until textsJson.length()).map { textsJson.optString(it) }.filter { it.isNotBlank() }
        return Offer(
            id = id,
            label = p.optString("label").ifBlank { files.firstOrNull()?.segments?.first() ?: "Items" }.take(80),
            pcName = pcName,
            destination = if (p.optString("destination") == "downloads") "downloads" else "auto",
            openFirst = p.optBoolean("openFirst"),
            totalBytes = files.sumOf { it.size },
            files = files,
            texts = texts,
            raw = p,
        )
    }

    private suspend fun handleOffer(o: Offer) {
        if (synchronized(this) { jobs.any { it.offer.id == o.id } }) {
            // Already accepted earlier (the PC re-sent it after a reconnect).
            send(Proto.message("push.accept", JSONObject().put("transferId", o.id)))
            return
        }
        val holdId = o.raw.optString("holdId").takeIf { it.isNotBlank() && !o.raw.isNull("holdId") }
        if (holdId != null && holdId == _hold.value?.id) clearHold() // "Send now" on the PC ends the catch
        val caught = holdId != null && synchronized(this) { holdId in caughtHolds }
        val s = settings.settings.first()
        if (caught || s.manualSends == ManualSends.AUTO) {
            accept(o)
        } else {
            _incoming.value = o
            if (!foreground) Notifications.postOffer(app, o.pcName, o.label, o.files.size, o.totalBytes)
        }
    }

    fun accept(o: Offer) {
        _incoming.value = null
        Notifications.cancelOffer(app)
        scope.launch {
            send(Proto.message("push.accept", JSONObject().put("transferId", o.id)))
            if (o.texts.isNotEmpty()) receiveTexts(o)
            if (o.files.isEmpty()) return@launch
            synchronized(this@Receiver) {
                jobs.add(JobState(o))
                saveJournal()
            }
            ensureRunning()
        }
    }

    fun decline(o: Offer) {
        _incoming.value = null
        Notifications.cancelOffer(app)
        send(Proto.message("push.decline", JSONObject().put("transferId", o.id)))
    }

    private fun receiveTexts(o: Offer) {
        val now = System.currentTimeMillis()
        History.add(o.texts.map { t ->
            val isLink = Regex("^https?://\\S+$", RegexOption.IGNORE_CASE).matches(t.trim())
            ReceivedItem(UUID.randomUUID().toString(), if (isLink) "Link" else "Note", ItemKind.TEXT, t.length.toLong(), 1, null, "Clipboard", now, o.pcName, t)
        })
        runCatching {
            val cm = app.getSystemService(ClipboardManager::class.java)
            cm?.setPrimaryClip(ClipData.newPlainText("PinchDrop", o.texts.last()))
        }
        if (o.files.isEmpty()) {
            val t = o.texts.last()
            _arrivals.tryEmit(Arrived(if (o.texts.size == 1) "Note" else "${o.texts.size} notes", ItemKind.TEXT, t.length.toLong(), o.texts.size, o.pcName, "Copied to clipboard", null, t, false))
            if (!foreground) Notifications.postArrived(app, "Text from ${o.pcName} copied", t.take(80))
        }
    }

    // ------------------------------------------------------------ receiving

    @Synchronized
    private fun ensureRunning() {
        if (!connected || runner?.isActive == true || jobs.isEmpty()) return
        LinkService.setBusy(app, true)
        runner = scope.launch {
            try {
                while (true) {
                    val job = synchronized(this@Receiver) { jobs.firstOrNull() } ?: break
                    runJob(job)
                }
                _progress.value = null
            } catch (_: Paused) {
                synchronized(this@Receiver) { jobs.firstOrNull() }?.let { _progress.value = progressOf(it, paused = true) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Storage full, file removed under us, …: stop this transfer instead of crashing the app.
                synchronized(this@Receiver) { jobs.firstOrNull() }?.let { fail(it, e.message ?: "Couldn't write the file on the phone.") }
                _progress.value = null
            } finally {
                Notifications.cancelProgress(app)
                LinkService.setBusy(app, false)
            }
        }
    }

    private class Paused : Exception()

    private fun progressOf(j: JobState, paused: Boolean, bytesInCurrent: Long = 0, rate: Long = 0): Progress {
        val done = j.offer.files.take(j.nextIndex).sumOf { it.size } + bytesInCurrent
        return Progress(j.offer.id, j.offer.label, j.offer.pcName, j.nextIndex, j.offer.files.size, done, j.offer.totalBytes, rate, paused)
    }

    private suspend fun runJob(j: JobState) {
        val clash = settings.settings.first().nameClash
        while (chunks.tryReceive().isSuccess) Unit // stale data from an earlier connection
        var rateBytes = 0L
        var rateSince = System.currentTimeMillis()
        var rate = 0L
        var lastUi = 0L
        for (i in j.nextIndex until j.offer.files.size) {
            val f = j.offer.files[i]
            val place = Saver.place(f.segments, j.offer.destination)
            var uri = j.currentUri
            if (uri == null || Saver.writtenBytes(app, uri) > f.size) {
                uri?.let { Saver.discardPartial(app, it) }
                uri = try {
                    Saver.create(app, place, clash)
                } catch (e: Exception) {
                    fail(j, "Couldn't save ${place.name} on the phone: ${e.message ?: "storage error"}")
                    return
                }
                synchronized(this) { j.currentUri = uri; saveJournal() }
            }
            var offset = Saver.writtenBytes(app, uri)
            Saver.openAppend(app, uri).use { out ->
                var requested = offset
                var inFlight = 0
                while (offset < f.size) {
                    while (inFlight < WINDOW && requested < f.size) {
                        val len = minOf(CHUNK.toLong(), f.size - requested)
                        val req = JSONObject().put("transferId", j.offer.id).put("index", f.index).put("offset", requested).put("length", len)
                        if (!send(Proto.message("chunk.req", req))) throw Paused()
                        requested += len
                        inFlight++
                    }
                    val c = withTimeoutOrNull(CHUNK_TIMEOUT_MS) { chunks.receive() } ?: throw Paused()
                    if (c.id != j.offer.id || c.index != f.index || c.offset != offset) continue
                    out.write(c.data)
                    offset += c.data.size
                    inFlight--
                    rateBytes += c.data.size
                    val now = System.currentTimeMillis()
                    if (now - rateSince >= 1000) {
                        rate = rateBytes * 1000 / (now - rateSince)
                        rateBytes = 0; rateSince = now
                    }
                    if (now - lastUi >= 200) {
                        lastUi = now
                        val p = progressOf(j, paused = false, bytesInCurrent = offset, rate = rate)
                        _progress.value = p
                        if (!foreground) Notifications.postProgress(app, p.label, p.pcName, p.bytesDone, p.totalBytes)
                    }
                }
                out.flush()
            }
            val final = Saver.finish(app, uri)
            synchronized(this) {
                j.saved[f.index] = final
                j.nextIndex = i + 1
                j.currentUri = null
                saveJournal()
            }
            send(Proto.message("file.done", JSONObject().put("transferId", j.offer.id).put("index", f.index)))
            _progress.value = progressOf(j, paused = false, rate = rate)
        }
        send(Proto.message("transfer.complete", JSONObject().put("transferId", j.offer.id)))
        complete(j)
    }

    /** Records what arrived, announces it, and forgets the job. */
    private fun complete(j: JobState) {
        val o = j.offer
        val now = System.currentTimeMillis()
        val rows = mutableListOf<ReceivedItem>()
        val folders = o.files.filter { it.segments.size > 1 && j.saved.containsKey(it.index) }.groupBy { it.segments.first() }
        folders.forEach { (folder, fs) ->
            rows += ReceivedItem(UUID.randomUUID().toString(), folder, ItemKind.FOLDER, fs.sumOf { it.size }, fs.size, null, "Downloads/PinchDrop/$folder", now, o.pcName, null)
        }
        o.files.filter { it.segments.size == 1 }.forEach { f ->
            val uri = j.saved[f.index] ?: return@forEach
            val place = Saver.place(f.segments, o.destination)
            rows += ReceivedItem(UUID.randomUUID().toString(), place.name, place.kind, f.size, 1, uri, place.label, now, o.pcName, null)
        }
        History.add(rows)
        synchronized(this) {
            jobs.remove(j)
            saveJournal()
        }
        val single = rows.singleOrNull()
        val arrived = if (single != null) {
            Arrived(single.name, single.kind, single.size, single.fileCount, o.pcName, single.location, single.uri, null, o.openFirst)
        } else {
            val first = rows.firstOrNull { it.uri != null }
            Arrived(o.label, ItemKind.FOLDER, rows.sumOf { it.size }, rows.sumOf { it.fileCount }, o.pcName, "Downloads/PinchDrop", first?.uri, null, o.openFirst)
        }
        _arrivals.tryEmit(arrived)
        if (!foreground) Notifications.postArrived(app, "“${arrived.name}” arrived", "From ${o.pcName} · ${arrived.location}")
    }

    private fun fail(j: JobState, message: String) {
        j.currentUri?.let { Saver.discardPartial(app, it) }
        send(Proto.message("transfer.cancel", JSONObject().put("transferId", j.offer.id)))
        recordPartial(j)
        synchronized(this) { jobs.remove(j); saveJournal() }
        Notifications.postArrived(app, "“${j.offer.label}” didn't finish", message)
    }

    /** Files that fully arrived before a cancel/failure stay on the phone and in the list. */
    private fun recordPartial(j: JobState) {
        if (j.saved.isEmpty()) return
        val now = System.currentTimeMillis()
        History.add(j.offer.files.filter { j.saved.containsKey(it.index) }.map { f ->
            val place = Saver.place(f.segments, j.offer.destination)
            ReceivedItem(UUID.randomUUID().toString(), place.name, place.kind, f.size, 1, j.saved[f.index], place.label, now, j.offer.pcName, null)
        })
    }

    private suspend fun finishEarly(id: String, cancelled: Boolean) {
        val j = synchronized(this) { jobs.firstOrNull { it.offer.id == id } } ?: run {
            if (_incoming.value?.id == id) { _incoming.value = null; Notifications.cancelOffer(app) }
            return
        }
        val wasRunning = synchronized(this) { jobs.firstOrNull() === j }
        if (wasRunning) runner?.let { try { it.cancel(); it.join() } catch (_: CancellationException) {} }
        j.currentUri?.let { Saver.discardPartial(app, it) }
        recordPartial(j)
        synchronized(this) { jobs.remove(j); saveJournal() }
        _progress.value = null
        if (!cancelled) Notifications.postArrived(app, "“${j.offer.label}” didn't finish", "The PC couldn't read a file. Try sending it again.")
        ensureRunning()
    }

    /** The user pressed Cancel on the phone. */
    fun cancelCurrent() {
        val id = synchronized(this) { jobs.firstOrNull()?.offer?.id } ?: return
        send(Proto.message("transfer.cancel", JSONObject().put("transferId", id)))
        scope.launch { finishEarly(id, cancelled = true) }
    }

    // ------------------------------------------------------------ journal

    private fun saveJournal() {
        val arr = JSONArray()
        jobs.forEach { j ->
            arr.put(
                JSONObject()
                    .put("offer", j.offer.raw)
                    .put("pcName", j.offer.pcName)
                    .put("nextIndex", j.nextIndex)
                    .put("currentUri", j.currentUri ?: JSONObject.NULL)
                    .put("saved", JSONObject(j.saved.mapKeys { it.key.toString() })),
            )
        }
        runCatching {
            val tmp = File(journalFile.path + ".tmp")
            tmp.writeText(arr.toString())
            tmp.renameTo(journalFile)
        }
    }

    private fun loadJournal() {
        val arr = runCatching { JSONArray(journalFile.readText()) }.getOrNull() ?: return
        for (k in 0 until arr.length()) {
            val o = arr.optJSONObject(k) ?: continue
            pcName = o.optString("pcName", pcName)
            val offer = parseOffer(o.optJSONObject("offer") ?: continue) ?: continue
            val saved = o.optJSONObject("saved")
            val map = mutableMapOf<Int, String>()
            saved?.keys()?.forEach { key -> key.toIntOrNull()?.let { map[it] = saved.getString(key) } }
            jobs += JobState(
                offer.copy(pcName = o.optString("pcName", offer.pcName)),
                o.optInt("nextIndex"),
                o.optString("currentUri").takeIf { !o.isNull("currentUri") && it.isNotEmpty() },
                map,
            )
        }
    }
}
