package com.pinchdrop.companion.link

import org.json.JSONObject
import java.net.URI
import java.net.URLDecoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Link v1 wire format and crypto. Spec: packages/protocol/LINK-v1.md.
 * Keep in sync with apps/desktop/src-tauri/src/link/proto.rs.
 */
object Proto {
    const val VERSION = 1
    const val DEFAULT_PORT = 47821
    /** NsdManager wants the service type without ".local.". */
    const val NSD_SERVICE = "_pinchdrop._tcp."
    const val WS_PATH = "/link"
    const val PING_SECS = 15L
    const val STATUS_EVERY_SECS = 60L

    private val SAS_LABEL = "pinchdrop-sas-v1".toByteArray()
    private val AUTH_LABEL = "pinchdrop-auth-v1".toByteArray()
    private val random = SecureRandom()

    data class Envelope(val type: String, val payload: JSONObject)

    fun message(type: String, payload: JSONObject = JSONObject()): String =
        JSONObject()
            .put("v", VERSION)
            .put("id", UUID.randomUUID().toString())
            .put("type", type)
            .put("ts", System.currentTimeMillis())
            .put("payload", payload)
            .toString()

    fun parse(text: String): Envelope? = runCatching {
        val o = JSONObject(text)
        if (o.optInt("v") != VERSION) return null
        Envelope(o.getString("type"), o.optJSONObject("payload") ?: JSONObject())
    }.getOrNull()

    fun randomBytes(n: Int): ByteArray = ByteArray(n).also { random.nextBytes(it) }

    fun b64(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)
    fun unb64(s: String): ByteArray? = runCatching { Base64.getDecoder().decode(s) }.getOrNull()

    fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private fun hexToBytes(hex: String): ByteArray? {
        if (hex.length % 2 != 0) return null
        return runCatching { ByteArray(hex.length / 2) { i -> hex.substring(i * 2, i * 2 + 2).toInt(16).toByte() } }.getOrNull()
    }

    /** The 6-digit code both screens show (LINK-v1 §5). */
    fun sasCode(fingerprintHex: String, pcNonce: ByteArray, phoneNonce: ByteArray): String? {
        val fp = hexToBytes(fingerprintHex) ?: return null
        if (fp.size != 32) return null
        val md = MessageDigest.getInstance("SHA-256")
        md.update(SAS_LABEL); md.update(fp); md.update(pcNonce); md.update(phoneNonce)
        val d = md.digest()
        val n = ((d[0].toLong() and 0xff) shl 24) or ((d[1].toLong() and 0xff) shl 16) or
            ((d[2].toLong() and 0xff) shl 8) or (d[3].toLong() and 0xff)
        return "%06d".format(n % 1_000_000)
    }

    fun authProof(secret: ByteArray, pcNonce: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret, "HmacSHA256"))
        mac.update(AUTH_LABEL)
        mac.update(pcNonce)
        return mac.doFinal()
    }

    /** What the PC's pairing QR code carries (LINK-v1 §3). */
    data class PairingQr(
        val pcId: String,
        val pcName: String,
        val hosts: List<String>,
        val port: Int,
        val fingerprint: String,
        val token: String,
    )

    fun parsePairingQr(text: String): PairingQr? = runCatching {
        val uri = URI(text.trim())
        if (uri.scheme != "pinchdrop" || uri.host != "pair") return null
        val q = (uri.rawQuery ?: return null).split('&').mapNotNull {
            val i = it.indexOf('=')
            if (i <= 0) null else it.substring(0, i) to URLDecoder.decode(it.substring(i + 1), "UTF-8")
        }.toMap()
        if (q["v"] != VERSION.toString()) return null
        val fp = q["fp"]?.lowercase()?.takeIf { it.length == 64 && it.all { c -> c in '0'..'9' || c in 'a'..'f' } } ?: return null
        PairingQr(
            pcId = q["id"]?.takeIf { it.isNotBlank() } ?: return null,
            pcName = q["n"].orEmpty().ifBlank { "PC" },
            hosts = q["h"].orEmpty().split(',').map { it.trim() }.filter { it.isNotEmpty() },
            port = q["p"]?.toIntOrNull()?.takeIf { it in 1..65535 } ?: DEFAULT_PORT,
            fingerprint = fp,
            token = q["t"]?.takeIf { it.isNotBlank() } ?: return null,
        )
    }.getOrNull()
}
