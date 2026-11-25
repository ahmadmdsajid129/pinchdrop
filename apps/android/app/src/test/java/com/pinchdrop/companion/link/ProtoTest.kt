package com.pinchdrop.companion.link

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class ProtoTest {
    @Test
    fun sasMatchesTheSharedTestVector() {
        // LINK-v1 §5; the desktop proto.rs test pins the same value.
        val code = Proto.sasCode("00".repeat(32), ByteArray(32) { 1 }, ByteArray(32) { 2 })
        assertEquals("749713", code)
        assertNotEquals(code, Proto.sasCode("00".repeat(32), ByteArray(32) { 2 }, ByteArray(32) { 1 }))
    }

    @Test
    fun sasRejectsBadFingerprint() {
        assertNull(Proto.sasCode("abcd", ByteArray(32), ByteArray(32)))
        assertNull(Proto.sasCode("zz".repeat(32), ByteArray(32), ByteArray(32)))
    }

    @Test
    fun fingerprintOfEmptyIsKnownSha256() {
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", Proto.sha256Hex(ByteArray(0)))
    }

    @Test
    fun authProofIsHmacSha256() {
        val a = Proto.authProof(ByteArray(32) { 7 }, ByteArray(32) { 9 })
        assertEquals(32, a.size)
        assertArrayEquals(a, Proto.authProof(ByteArray(32) { 7 }, ByteArray(32) { 9 }))
        assertNotEquals(a.toList(), Proto.authProof(ByteArray(32) { 8 }, ByteArray(32) { 9 }).toList())
    }

    @Test
    fun envelopeRoundTripAndVersionCheck() {
        val text = Proto.message("status", org.json.JSONObject().put("battery", 80))
        val env = Proto.parse(text)
        assertNotNull(env)
        assertEquals("status", env!!.type)
        assertEquals(80, env.payload.getInt("battery"))
        assertNull(Proto.parse("""{"v":2,"id":"x","type":"status","ts":0,"payload":{}}"""))
        assertNull(Proto.parse("nope"))
    }

    @Test
    fun parsesTheDesktopPairingUrl() {
        // Exactly what proto.rs pairing_url() produces (see its unit test), with a real-length fingerprint.
        val fp = "ab".repeat(32)
        val qr = Proto.parsePairingQr("pinchdrop://pair?v=1&id=abc&n=My%20Laptop&h=192.168.1.5%2C10.0.0.2&p=47821&fp=$fp&t=tok")
        assertNotNull(qr)
        assertEquals("abc", qr!!.pcId)
        assertEquals("My Laptop", qr.pcName)
        assertEquals(listOf("192.168.1.5", "10.0.0.2"), qr.hosts)
        assertEquals(47821, qr.port)
        assertEquals(fp, qr.fingerprint)
        assertEquals("tok", qr.token)
    }

    @Test
    fun rejectsOtherQrCodes() {
        assertNull(Proto.parsePairingQr("https://example.com"))
        assertNull(Proto.parsePairingQr("pinchdrop://pair?v=1&id=a&fp=short&t=x"))
        assertNull(Proto.parsePairingQr("pinchdrop://pair?v=9&id=a&fp=${"a".repeat(64)}&t=x"))
    }
}
