package com.pinchdrop.companion.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

enum class ThemeMode { SYSTEM, DARK, LIGHT }
enum class HandDetection { EASY, NORMAL, STRICT }
enum class ManualSends { AUTO, ASK }
enum class NameClash { KEEP_BOTH, REPLACE }

/** Everything the phone remembers. Lives only on this phone (DataStore). */
data class AppSettings(
    val onboarded: Boolean = false,
    val theme: ThemeMode = ThemeMode.LIGHT,
    val phoneName: String = "",
    val demoPc: Boolean = false,
    val stayConnected: Boolean = true,
    val catchWithHand: Boolean = true,
    val handDetection: HandDetection = HandDetection.NORMAL,
    val manualSends: ManualSends = ManualSends.AUTO,
    val nameClash: NameClash = NameClash.KEEP_BOTH,
    val arrivalAnimation: Boolean = true,
    val arrivalSound: Boolean = true,
    val vibrate: Boolean = true,
    /** v2: hover a hand over the top of the phone to catch (proximity sensor). */
    val proximityCatch: Boolean = true,
)

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

private object Keys {
    val onboarded = booleanPreferencesKey("onboarded")
    val theme = stringPreferencesKey("theme")
    val phoneName = stringPreferencesKey("phone_name")
    val demoPc = booleanPreferencesKey("demo_pc")
    val stayConnected = booleanPreferencesKey("stay_connected")
    val catchWithHand = booleanPreferencesKey("catch_with_hand")
    val handDetection = stringPreferencesKey("hand_detection")
    val manualSends = stringPreferencesKey("manual_sends")
    val nameClash = stringPreferencesKey("name_clash")
    val arrivalAnimation = booleanPreferencesKey("arrival_animation")
    val arrivalSound = booleanPreferencesKey("arrival_sound")
    val vibrate = booleanPreferencesKey("vibrate")
    val proximityCatch = booleanPreferencesKey("proximity_catch")
    /** 2 = the white Apple-style look; older installs switch to it once. */
    val uiVersion = androidx.datastore.preferences.core.intPreferencesKey("ui_version")
}

/** Reads an enum by name, falling back to [default] for unknown or missing values (e.g. after a downgrade). */
inline fun <reified E : Enum<E>> enumOr(name: String?, default: E): E =
    enumValues<E>().firstOrNull { it.name == name } ?: default

class SettingsStore(private val context: Context) {
    private val d = AppSettings()

    val settings: Flow<AppSettings> = context.dataStore.data.map { decode(it) }

    private fun decode(p: Preferences): AppSettings =
        AppSettings(
            onboarded = p[Keys.onboarded] ?: d.onboarded,
            theme = if ((p[Keys.uiVersion] ?: 0) < 2) ThemeMode.LIGHT else enumOr(p[Keys.theme], d.theme),
            phoneName = p[Keys.phoneName] ?: DeviceInfo.defaultName(context),
            demoPc = p[Keys.demoPc] ?: d.demoPc,
            stayConnected = p[Keys.stayConnected] ?: d.stayConnected,
            catchWithHand = p[Keys.catchWithHand] ?: d.catchWithHand,
            handDetection = enumOr(p[Keys.handDetection], d.handDetection),
            manualSends = enumOr(p[Keys.manualSends], d.manualSends),
            nameClash = enumOr(p[Keys.nameClash], d.nameClash),
            arrivalAnimation = p[Keys.arrivalAnimation] ?: d.arrivalAnimation,
            arrivalSound = p[Keys.arrivalSound] ?: d.arrivalSound,
            vibrate = p[Keys.vibrate] ?: d.vibrate,
            proximityCatch = p[Keys.proximityCatch] ?: d.proximityCatch,
        )

    /** Read-modify-write inside one DataStore transaction, so quick successive changes never overwrite each other. */
    suspend fun update(change: (AppSettings) -> AppSettings) {
        context.dataStore.edit { p ->
            val s = change(decode(p))
            p[Keys.onboarded] = s.onboarded
            p[Keys.theme] = s.theme.name
            p[Keys.phoneName] = s.phoneName
            p[Keys.demoPc] = s.demoPc
            p[Keys.stayConnected] = s.stayConnected
            p[Keys.catchWithHand] = s.catchWithHand
            p[Keys.handDetection] = s.handDetection.name
            p[Keys.manualSends] = s.manualSends.name
            p[Keys.nameClash] = s.nameClash.name
            p[Keys.arrivalAnimation] = s.arrivalAnimation
            p[Keys.arrivalSound] = s.arrivalSound
            p[Keys.vibrate] = s.vibrate
            p[Keys.proximityCatch] = s.proximityCatch
            p[Keys.uiVersion] = 2
        }
    }

    suspend fun reset() {
        context.dataStore.edit { it.clear() }
    }
}
