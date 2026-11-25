package com.pinchdrop.companion.link

import android.annotation.SuppressLint
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

/**
 * Trusts exactly one certificate: the PC's, identified by its SHA-256 fingerprint.
 * The system CA store is never consulted for the link (LINK-v1 §1).
 */
@SuppressLint("CustomX509TrustManager")
class PinningTrustManager(private val expectedFingerprint: String) : X509TrustManager {
    @Volatile var seenFingerprint: String? = null
        private set

    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
        val leaf = chain?.firstOrNull() ?: throw CertificateException("no certificate")
        val fp = Proto.sha256Hex(leaf.encoded)
        seenFingerprint = fp
        if (!fp.equals(expectedFingerprint, ignoreCase = true)) throw CertificateException("PC certificate doesn't match the paired one")
    }

    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) =
        throw CertificateException("client certificates are not used")

    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
}

sealed interface WsEvent {
    data object Open : WsEvent
    data class Text(val env: Proto.Envelope) : WsEvent
    data class Closed(val error: Throwable?) : WsEvent
}

/** One WebSocket to the PC with its events delivered through a channel. */
class WsConn private constructor(
    private val socket: WebSocket,
    val events: Channel<WsEvent>,
    val trust: PinningTrustManager,
    val host: String,
    val port: Int,
) {
    fun send(text: String): Boolean = socket.send(text)

    fun close() {
        socket.close(1000, null)
        events.close()
    }

    /** Waits for the next message (skipping Open); null on timeout or when the link closes. */
    suspend fun next(timeoutMs: Long): Proto.Envelope? = withTimeoutOrNull(timeoutMs) {
        while (true) {
            when (val e = events.receiveCatching().getOrNull() ?: return@withTimeoutOrNull null) {
                is WsEvent.Text -> return@withTimeoutOrNull e.env
                is WsEvent.Closed -> return@withTimeoutOrNull null
                WsEvent.Open -> Unit
            }
        }
        @Suppress("UNREACHABLE_CODE")
        null
    }

    companion object {
        private val base: OkHttpClient by lazy {
            OkHttpClient.Builder()
                .connectTimeout(5, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.SECONDS) // long-lived; liveness comes from pings
                .pingInterval(Proto.PING_SECS, TimeUnit.SECONDS)
                .build()
        }

        fun open(host: String, port: Int, fingerprint: String): WsConn {
            val trust = PinningTrustManager(fingerprint)
            val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
            val client = base.newBuilder()
                .sslSocketFactory(ssl.socketFactory, trust)
                // The PC's certificate has no real hostname; identity comes from the pinned fingerprint.
                .hostnameVerifier { _, _ -> true }
                .build()
            val events = Channel<WsEvent>(Channel.UNLIMITED)
            val request = Request.Builder().url("wss://$host:$port${Proto.WS_PATH}").build()
            val socket = client.newWebSocket(request, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    events.trySend(WsEvent.Open)
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    Proto.parse(text)?.let { events.trySend(WsEvent.Text(it)) }
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(1000, null)
                    events.trySend(WsEvent.Closed(null))
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    events.trySend(WsEvent.Closed(null))
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    events.trySend(WsEvent.Closed(t))
                }
            })
            return WsConn(socket, events, trust, host, port)
        }
    }
}
