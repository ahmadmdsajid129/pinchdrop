package com.pinchdrop.companion.pairing

data class DesktopPairingInfo(
    val deviceId: String,
    val deviceName: String,
    val publicKey: String,
    val certFingerprint: String,
    val address: String,
    val port: Int
)

class PairingManager {
    private var pairedDesktop: DesktopPairingInfo? = null

    fun savePairing(info: DesktopPairingInfo) {
        this.pairedDesktop = info
    }

    fun getPairedDesktop(): DesktopPairingInfo? = pairedDesktop

    fun isPaired(): Boolean = pairedDesktop != null

    fun unpair() {
        pairedDesktop = null
    }

    fun verifyCertificate(fingerprint: String): Boolean {
        return pairedDesktop?.certFingerprint == fingerprint
    }
}
