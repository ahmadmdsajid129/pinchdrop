package com.pinchdrop.companion.link

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/** The PC this phone is paired with (LINK-v1 §6). App-private storage; backups are off. */
data class PairedPc(
    val pcId: String,
    val name: String,
    val fingerprint: String,
    val deviceId: String,
    val secret: String,
    val lastHost: String?,
    val lastPort: Int,
)

private val Context.linkStore: DataStore<Preferences> by preferencesDataStore(name = "link")

class PairedPcStore(private val context: Context) {
    private object K {
        val pcId = stringPreferencesKey("pc_id")
        val name = stringPreferencesKey("pc_name")
        val fp = stringPreferencesKey("fingerprint")
        val deviceId = stringPreferencesKey("device_id")
        val secret = stringPreferencesKey("secret")
        val host = stringPreferencesKey("last_host")
        val port = intPreferencesKey("last_port")
    }

    val pc: Flow<PairedPc?> = context.linkStore.data.map { p ->
        val id = p[K.pcId] ?: return@map null
        PairedPc(
            pcId = id,
            name = p[K.name] ?: "PC",
            fingerprint = p[K.fp] ?: return@map null,
            deviceId = p[K.deviceId] ?: return@map null,
            secret = p[K.secret] ?: return@map null,
            lastHost = p[K.host],
            lastPort = p[K.port] ?: Proto.DEFAULT_PORT,
        )
    }

    suspend fun current(): PairedPc? = pc.first()

    suspend fun save(pc: PairedPc) {
        context.linkStore.edit { p ->
            p[K.pcId] = pc.pcId
            p[K.name] = pc.name
            p[K.fp] = pc.fingerprint
            p[K.deviceId] = pc.deviceId
            p[K.secret] = pc.secret
            if (pc.lastHost != null) p[K.host] = pc.lastHost else p.remove(K.host)
            p[K.port] = pc.lastPort
        }
    }

    suspend fun rememberAddress(host: String, port: Int) {
        context.linkStore.edit { p ->
            if (p[K.pcId] != null) {
                p[K.host] = host
                p[K.port] = port
            }
        }
    }

    suspend fun rename(name: String) {
        context.linkStore.edit { p -> if (p[K.pcId] != null) p[K.name] = name.take(40) }
    }

    suspend fun clear() {
        context.linkStore.edit { it.clear() }
    }
}
