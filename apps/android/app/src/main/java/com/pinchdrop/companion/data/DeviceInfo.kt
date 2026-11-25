package com.pinchdrop.companion.data

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings

/** Facts about this phone. Read on demand; nothing here is sent anywhere until pairing ships (Phase 3). */
object DeviceInfo {
    fun defaultName(context: Context): String {
        val fromSystem = runCatching { Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME) }.getOrNull()
        return fromSystem?.takeIf { it.isNotBlank() } ?: model()
    }

    fun model(): String {
        val maker = Build.MANUFACTURER.replaceFirstChar { it.uppercase() }
        val model = Build.MODEL
        return if (model.startsWith(maker, ignoreCase = true)) model else "$maker $model"
    }

    fun androidVersion(): String = "Android ${Build.VERSION.RELEASE}"

    data class Battery(val percent: Int, val charging: Boolean)

    fun battery(context: Context): Battery? {
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        if (level < 0 || scale <= 0) return null
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        return Battery(level * 100 / scale, charging)
    }
}

/** Two-letter avatar text, e.g. "Pixel 8" -> "P8", "My Phone" -> "MP". Mirrors the desktop initials(). */
fun initials(name: String): String {
    val words = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    return when {
        words.isEmpty() -> "?"
        words.size == 1 -> words[0].take(2).uppercase()
        else -> (words[0].take(1) + words[1].take(1)).uppercase()
    }
}

/** Human file size, matching the desktop formatBytes(). */
fun formatBytes(bytes: Long): String {
    if (bytes < 1024) return "$bytes B"
    val units = listOf("KB", "MB", "GB", "TB")
    var v = bytes / 1024.0
    var i = 0
    while (v >= 1024 && i < units.lastIndex) {
        v /= 1024; i++
    }
    return if (v >= 10 || v % 1.0 == 0.0) "${v.toInt()} ${units[i]}" else "${"%.1f".format(java.util.Locale.ROOT, v)} ${units[i]}"
}
