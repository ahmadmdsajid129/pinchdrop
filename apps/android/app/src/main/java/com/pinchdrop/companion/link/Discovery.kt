package com.pinchdrop.companion.link

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.net.Inet4Address
import java.util.ArrayDeque

/** A PC found on this Wi-Fi through mDNS (`_pinchdrop._tcp`). */
data class FoundPc(val pcId: String, val name: String, val host: String, val port: Int, val fingerprint: String)

/**
 * Finds PinchDrop PCs on the local network with Android's NsdManager.
 * Reference-counted: runs while the Pair screen is open or the link is looking for its PC.
 * NsdManager can only resolve one service at a time, so resolves are queued.
 */
object Discovery {
    private val _found = MutableStateFlow<Map<String, FoundPc>>(emptyMap())
    val found: StateFlow<Map<String, FoundPc>> = _found.asStateFlow()

    private var users = 0
    private var nsd: NsdManager? = null
    private var listener: NsdManager.DiscoveryListener? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    private val queue = ArrayDeque<NsdServiceInfo>()
    private var resolving = false

    @Synchronized
    fun acquire(context: Context) {
        users++
        if (users == 1) start(context.applicationContext)
    }

    @Synchronized
    fun release() {
        if (users == 0) return
        users--
        if (users == 0) stop()
    }

    private fun start(context: Context) {
        val manager = context.getSystemService(NsdManager::class.java) ?: return
        nsd = manager
        // Some phones drop multicast packets with the screen off unless a lock is held.
        multicastLock = runCatching {
            (context.getSystemService(Context.WIFI_SERVICE) as WifiManager).createMulticastLock("pinchdrop-mdns").apply {
                setReferenceCounted(false); acquire()
            }
        }.getOrNull()
        val l = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {}
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
            override fun onServiceFound(info: NsdServiceInfo) = enqueue(info)
            override fun onServiceLost(info: NsdServiceInfo) {
                synchronized(this@Discovery) {
                    _found.value = _found.value.filterValues { !info.serviceName.endsWith(it.pcId.take(6)) }
                }
            }
        }
        listener = l
        runCatching { manager.discoverServices(Proto.NSD_SERVICE, NsdManager.PROTOCOL_DNS_SD, l) }
    }

    private fun stop() {
        val m = nsd
        val l = listener
        if (m != null && l != null) runCatching { m.stopServiceDiscovery(l) }
        listener = null
        queue.clear()
        resolving = false
        runCatching { multicastLock?.release() }
        multicastLock = null
        _found.value = emptyMap()
    }

    @Synchronized
    private fun enqueue(info: NsdServiceInfo) {
        queue.add(info)
        resolveNext()
    }

    @Synchronized
    private fun resolveNext() {
        if (resolving || listener == null) return
        val next = queue.poll() ?: return
        val m = nsd ?: return
        resolving = true
        @Suppress("DEPRECATION") // registerServiceInfoCallback is API 34+; resolveService works everywhere.
        m.resolveService(next, object : NsdManager.ResolveListener {
            override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) = done(null)
            override fun onServiceResolved(info: NsdServiceInfo) = done(info)
        })
    }

    private fun done(info: NsdServiceInfo?) {
        synchronized(this) {
            resolving = false
            if (info != null && listener != null) toFound(info)?.let { _found.value = _found.value + (it.pcId to it) }
        }
        resolveNext()
    }

    private fun toFound(info: NsdServiceInfo): FoundPc? {
        val attrs = info.attributes ?: return null
        fun txt(k: String) = attrs[k]?.let { String(it, Charsets.UTF_8) }
        val id = txt("id") ?: return null
        if (txt("v") != Proto.VERSION.toString()) return null
        val fp = txt("fp")?.lowercase()?.takeIf { it.length == 64 } ?: return null
        @Suppress("DEPRECATION")
        val addr = info.host ?: return null
        if (addr !is Inet4Address) return null
        return FoundPc(id, txt("name") ?: info.serviceName, addr.hostAddress ?: return null, info.port, fp)
    }
}
