package com.pinchdrop.companion.link

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Environment
import android.os.StatFs
import androidx.core.content.ContextCompat
import com.pinchdrop.companion.data.DeviceInfo
import com.pinchdrop.companion.data.SettingsStore
import com.pinchdrop.companion.transfer.Receiver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.selects.select
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject

/**
 * The phone's side of the link (LINK-v1). Process-wide: it keeps the paired PC
 * connected while the app is on screen, or all the time when the foreground
 * service is running ("Stay connected in background"), and runs pairing.
 */
object PcLink {
    sealed interface State {
        data object Unpaired : State
        data class Connecting(val pcName: String) : State
        data class Connected(val pcName: String, val host: String) : State
        data class Offline(val pcName: String) : State
    }

    sealed interface Pairing {
        data object Idle : Pairing
        data class Connecting(val pcName: String) : Pairing
        data class Code(val pcName: String, val code: String, val phoneConfirmed: Boolean) : Pairing
        data class Done(val pcName: String) : Pairing
        data class Failed(val message: String) : Pairing
    }

    /** Where to pair with: from a QR code (has a token) or picked from the Wi-Fi list (no token). */
    data class PairTarget(
        val pcId: String,
        val pcName: String,
        val hosts: List<String>,
        val port: Int,
        val fingerprint: String,
        val token: String?,
    )

    private val _state = MutableStateFlow<State>(State.Unpaired)
    val state: StateFlow<State> = _state.asStateFlow()
    private val _pairing = MutableStateFlow<Pairing>(Pairing.Idle)
    val pairing: StateFlow<Pairing> = _pairing.asStateFlow()
    /** One-off message for the user, e.g. after the PC unpaired this phone. */
    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var app: Context
    private lateinit var store: PairedPcStore
    private lateinit var settings: SettingsStore
    private var started = false
    private var foreground = false
    private var background = false
    private var supervisor: Job? = null
    private var pairJob: Job? = null
    private val pairActions = Channel<Boolean>(Channel.CONFLATED)
    @Volatile private var live: WsConn? = null

    @Synchronized
    fun init(context: Context) {
        if (started) return
        started = true
        app = context.applicationContext
        store = PairedPcStore(app)
        settings = SettingsStore(app)
        Receiver.init(app)
        com.pinchdrop.companion.transfer.Lifter.init(app)
        com.pinchdrop.companion.phone.PhoneData.init(app)
        scope.launch {
            store.pc.map { it?.pcId }.distinctUntilChanged().collect { reevaluate(restart = true) }
        }
    }

    fun setForeground(on: Boolean) {
        foreground = on
        Receiver.foreground = on
        reevaluate()
    }

    fun setBackground(on: Boolean) {
        background = on
        reevaluate()
    }

    fun clearNotice() {
        _notice.value = null
    }

    @Synchronized
    private fun reevaluate(restart: Boolean = false) {
        if (!started) return
        val want = foreground || background
        if (restart || !want) {
            val old = supervisor
            supervisor = null
            live?.close()
            old?.cancel()
        }
        scope.launch {
            val pc = store.current()
            if (pc == null) {
                _state.value = State.Unpaired
                return@launch
            }
            synchronized(this@PcLink) {
                if (want && supervisor?.isActive != true) supervisor = scope.launch { superviseLoop() }
                if (!want) _state.value = State.Offline(pc.name)
            }
        }
    }

    // ------------------------------------------------------------ reconnecting

    private suspend fun superviseLoop() {
        var backoffMs = 2_000L
        Discovery.acquire(app)
        try {
            while (scope.isActive) {
                val pc = store.current() ?: run { _state.value = State.Unpaired; return }
                if (_state.value !is State.Connected) _state.value = State.Connecting(pc.name)
                val candidates = buildList {
                    Discovery.found.value[pc.pcId]?.let { add(it.host to it.port) }
                    pc.lastHost?.let { add(it to pc.lastPort) }
                }.distinct()
                var wasConnected = false
                for ((host, port) in candidates) {
                    when (runSession(pc, host, port)) {
                        SessionEnd.FORGOTTEN -> return
                        SessionEnd.WAS_CONNECTED -> { wasConnected = true; break }
                        SessionEnd.FAILED -> Unit
                    }
                }
                val current = store.current() ?: return
                _state.value = State.Offline(current.name)
                if (wasConnected) backoffMs = 2_000L
                // Wait for the back-off, or until mDNS sees the PC at a new address.
                val knownHost = Discovery.found.value[pc.pcId]?.host
                withTimeoutOrNull(backoffMs) {
                    Discovery.found.first { val f = it[pc.pcId]; f != null && f.host != knownHost }
                }
                if (!wasConnected) backoffMs = (backoffMs * 2).coerceAtMost(30_000L)
            }
        } finally {
            Discovery.release()
        }
    }

    private enum class SessionEnd { FAILED, WAS_CONNECTED, FORGOTTEN }

    private suspend fun runSession(pc: PairedPc, host: String, port: Int): SessionEnd {
        val ws = runCatching { WsConn.open(host, port, pc.fingerprint) }.getOrNull() ?: return SessionEnd.FAILED
        try {
            val hello = ws.next(8_000)?.takeIf { it.type == "server.hello" } ?: return SessionEnd.FAILED
            if (hello.payload.optString("pcId") != pc.pcId) return SessionEnd.FAILED
            val pcNonce = Proto.unb64(hello.payload.optString("nonce")) ?: return SessionEnd.FAILED
            val secret = Proto.unb64(pc.secret) ?: return SessionEnd.FAILED
            ws.send(Proto.message("auth", JSONObject().put("deviceId", pc.deviceId).put("proof", Proto.b64(Proto.authProof(secret, pcNonce)))))
            val reply = ws.next(8_000) ?: return SessionEnd.FAILED
            when (reply.type) {
                "welcome" -> Unit
                "auth.fail" -> {
                    if (reply.payload.optString("reason") == "unknown_device") {
                        forgetLocally("${pc.name} no longer knows this phone. Pair again to reconnect.")
                        return SessionEnd.FORGOTTEN
                    }
                    return SessionEnd.FAILED
                }
                else -> return SessionEnd.FAILED
            }
            // v2: the PC says what it supports (fast mode = bigger chunks).
            Receiver.fast = reply.payload.optJSONArray("caps")?.let { caps -> (0 until caps.length()).any { caps.optString(it) == "chunk2m" } } == true
            val pcName = reply.payload.optString("pcName").ifBlank { pc.name }
            if (pcName != pc.name) store.rename(pcName)
            store.rememberAddress(host, port)
            live = ws
            _state.value = State.Connected(pcName, host)
            Receiver.onConnected({ ws.send(it) }, pcName)
            com.pinchdrop.companion.transfer.Lifter.onConnected({ ws.send(it) }, { ws.sendBytes(it) })
            com.pinchdrop.companion.phone.PhoneData.onConnected { ws.send(it) }
            // v2.0.1 battery: no network discovery (and no multicast lock, which wakes the Wi-Fi
            // chip for every packet) while connected; it comes back the moment the link drops.
            Discovery.release()
            val forgotten = try { connectedLoop(ws) } finally { Discovery.acquire(app) }
            return if (forgotten) SessionEnd.FORGOTTEN else SessionEnd.WAS_CONNECTED
        } finally {
            if (live === ws) {
                live = null
                Receiver.onDisconnected()
                com.pinchdrop.companion.transfer.Lifter.onDisconnected()
                com.pinchdrop.companion.phone.PhoneData.onDisconnected()
            }
            ws.close()
        }
    }

    /** Runs an authenticated session until it drops. Returns true if the PC unpaired this phone. */
    private suspend fun connectedLoop(ws: WsConn): Boolean {
        val triggers = Channel<Unit>(Channel.CONFLATED)
        val receiver = object : BroadcastReceiver() {
            private var last: DeviceInfo.Battery? = null
            override fun onReceive(context: Context, intent: Intent) {
                val b = DeviceInfo.battery(context)
                if (b != last) { last = b; triggers.trySend(Unit) }
            }
        }
        ContextCompat.registerReceiver(app, receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED)
        val nameWatcher = scope.launch {
            settings.settings.map { it.phoneName }.distinctUntilChanged().drop(1).collect { triggers.trySend(Unit) }
        }
        val ticker = scope.launch {
            while (isActive) { delay(Proto.STATUS_EVERY_SECS * 1000); triggers.trySend(Unit) }
        }
        try {
            ws.send(Proto.message("status", statusPayload()))
            while (true) {
                val unpaired = select<Boolean?> {
                    triggers.onReceive {
                        ws.send(Proto.message("status", statusPayload()))
                        null
                    }
                    ws.events.onReceiveCatching { r ->
                        when (val e = r.getOrNull()) {
                            null, is WsEvent.Closed -> false
                            is WsEvent.Text -> when (e.env.type) {
                                "push.offer", "transfer.cancel", "transfer.error", "hold.offer", "hold.cancel" -> {
                                    Receiver.onMessage(e.env.type, e.env.payload)
                                    null
                                }
                                "lift.catch", "lift.req", "lift.done", "lift.cancel" -> {
                                    com.pinchdrop.companion.transfer.Lifter.onMessage(e.env.type, e.env.payload)
                                    null
                                }
                                in com.pinchdrop.companion.phone.PhoneData.eventTypes -> {
                                    com.pinchdrop.companion.phone.PhoneData.onEvent(e.env.type, e.env.payload)
                                    null
                                }
                                in com.pinchdrop.companion.phone.PhoneData.requestTypes -> {
                                    com.pinchdrop.companion.phone.PhoneData.onRequest(e.env.type, e.env.payload)
                                    null
                                }
                                "pc.info" -> {
                                    val n = e.env.payload.optString("pcName")
                                    if (n.isNotBlank()) {
                                        store.rename(n)
                                        Receiver.pcName = n.take(40)
                                        _state.value = State.Connected(n.take(40), ws.host)
                                    }
                                    null
                                }
                                "unpair" -> {
                                    forgetLocally("Your PC unpaired this phone.")
                                    true
                                }
                                else -> null
                            }
                            is WsEvent.Binary -> {
                                Receiver.onBinary(e.bytes)
                                null
                            }
                            WsEvent.Open -> null
                        }
                    }
                }
                if (unpaired != null) return unpaired
            }
        } finally {
            runCatching { app.unregisterReceiver(receiver) }
            nameWatcher.cancel()
            ticker.cancel()
        }
    }

    private suspend fun statusPayload(): JSONObject {
        val s = settings.settings.first()
        val battery = DeviceInfo.battery(app)
        val freeGb = runCatching { StatFs(Environment.getDataDirectory().path).availableBytes / (1024L * 1024 * 1024) }.getOrNull()
        val cm = app.getSystemService(ConnectivityManager::class.java)
        val caps = cm?.getNetworkCapabilities(cm.activeNetwork)
        val network = when {
            caps == null -> null
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
            else -> "Hotspot"
        }
        return JSONObject()
            .put("name", s.phoneName)
            .put("model", DeviceInfo.model())
            .put("battery", battery?.percent ?: JSONObject.NULL)
            .put("charging", battery?.charging ?: false)
            .put("network", network ?: JSONObject.NULL)
            .put("freeSpaceGb", freeGb ?: JSONObject.NULL)
    }

    private suspend fun forgetLocally(message: String?) {
        store.clear()
        _state.value = State.Unpaired
        if (message != null) _notice.value = message
    }

    /** User pressed Unpair on the phone. Tells the PC if it's connected right now. */
    fun unpair() {
        scope.launch {
            val ws = live
            if (ws != null) {
                ws.send(Proto.message("unpair"))
                delay(300)
            }
            supervisor?.cancelAndJoin()
            supervisor = null
            forgetLocally(if (ws == null) "Unpaired. Also remove this phone on the PC (Devices → Unpair)." else null)
        }
    }

    // ------------------------------------------------------------ pairing

    fun startPairing(target: PairTarget) {
        pairJob?.cancel()
        while (pairActions.tryReceive().isSuccess) Unit
        _pairing.value = Pairing.Connecting(target.pcName)
        pairJob = scope.launch { _pairing.value = runPairing(target) }
    }

    /** The user compared the codes: true = "Codes match — Pair", false = "They don't match". */
    fun answerCode(match: Boolean) {
        pairActions.trySend(match)
    }

    fun cancelPairing() {
        pairJob?.cancel()
        pairJob = null
        _pairing.value = Pairing.Idle
    }

    private suspend fun runPairing(t: PairTarget): Pairing {
        var lastError = "Couldn't reach ${t.pcName}. Check that both are on the same Wi-Fi and the PC's Pair screen is open."
        for (host in t.hosts.distinct()) {
            val ws = runCatching { WsConn.open(host, t.port, t.fingerprint) }.getOrNull() ?: continue
            try {
                val hello = ws.next(6_000)
                if (hello == null) {
                    if (ws.trust.seenFingerprint?.equals(t.fingerprint, ignoreCase = true) == false) {
                        lastError = "That isn't the PC from the QR code (security check failed). Nothing was paired."
                    }
                    continue
                }
                if (hello.type != "server.hello" || hello.payload.optString("pcId") != t.pcId) continue
                val pcNonce = Proto.unb64(hello.payload.optString("nonce")) ?: continue
                val phoneNonce = Proto.randomBytes(32)
                val s = settings.settings.first()
                val req = JSONObject()
                    .put("nonce", Proto.b64(phoneNonce))
                    .put("phone", JSONObject().put("name", s.phoneName).put("model", DeviceInfo.model()))
                if (t.token != null) req.put("token", t.token)
                ws.send(Proto.message("pair.request", req))
                val fp = ws.trust.seenFingerprint ?: t.fingerprint
                val code = Proto.sasCode(fp, pcNonce, phoneNonce) ?: return Pairing.Failed("Security check failed. Nothing was paired.")
                var confirmed = false
                _pairing.value = Pairing.Code(t.pcName, code, confirmed)
                while (true) {
                    val outcome: Pairing? = select {
                        pairActions.onReceive { match ->
                            if (match) {
                                confirmed = true
                                ws.send(Proto.message("pair.confirm"))
                                _pairing.value = Pairing.Code(t.pcName, code, true)
                                null
                            } else {
                                ws.send(Proto.message("pair.reject", JSONObject().put("reason", "mismatch")))
                                Pairing.Failed("The codes didn't match, so nothing was paired. Make sure you're pairing with your own PC.")
                            }
                        }
                        ws.events.onReceiveCatching { r ->
                            when (val e = r.getOrNull()) {
                                null, is WsEvent.Closed -> Pairing.Failed("The PC stopped pairing. Open its Pair screen and try again.")
                                is WsEvent.Text -> when (e.env.type) {
                                    "pair.accept" -> accept(t, e.env.payload, fp, host)
                                    "pair.reject" -> Pairing.Failed(rejectText(e.env.payload.optString("reason")))
                                    else -> null
                                }
                                WsEvent.Open, is WsEvent.Binary -> null
                            }
                        }
                    }
                    if (outcome != null) return outcome
                }
            } finally {
                ws.close()
            }
        }
        return Pairing.Failed(lastError)
    }

    private suspend fun accept(t: PairTarget, p: JSONObject, fingerprint: String, host: String): Pairing {
        val deviceId = p.optString("deviceId").takeIf { it.isNotBlank() } ?: return Pairing.Failed("The PC sent an incomplete reply.")
        val secret = p.optString("secret").takeIf { Proto.unb64(it)?.size == 32 } ?: return Pairing.Failed("The PC sent an incomplete reply.")
        val name = p.optString("pcName").ifBlank { t.pcName }.take(40)
        // One PC at a time in v1: replacing an old pairing tells the old PC if it's connected.
        val old = store.current()
        if (old != null && old.pcId != t.pcId) live?.send(Proto.message("unpair"))
        store.save(PairedPc(t.pcId, name, fingerprint, deviceId, secret, host, t.port))
        return Pairing.Done(name)
    }

    private fun rejectText(reason: String) = when (reason) {
        "cancelled" -> "Pairing was cancelled on the PC."
        "window_closed" -> "The PC's Pair screen was closed. Open it and try again."
        "bad_token" -> "That QR code has expired. Scan the new one on the PC."
        "mismatch" -> "The codes didn't match, so nothing was paired."
        else -> "The PC didn't accept the pairing."
    }
}
