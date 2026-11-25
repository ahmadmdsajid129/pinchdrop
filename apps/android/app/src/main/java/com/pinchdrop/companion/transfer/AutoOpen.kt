package com.pinchdrop.companion.transfer

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.pinchdrop.companion.MainActivity
import com.pinchdrop.companion.Notifications

/**
 * Opening the Catch camera by itself when the PC holds something.
 *
 * Android blocks apps from starting screens from the background unless the user allowed
 * "Display over other apps" for them. Xiaomi / Redmi / POCO (HyperOS, MIUI) also need
 * "Open new windows while running in the background".
 */
object AutoOpen {
    fun allowed(context: Context): Boolean = Settings.canDrawOverlays(context)

    fun openCatch(context: Context) {
        runCatching {
            context.startActivity(
                Intent(context, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                    .putExtra(Notifications.EXTRA_OPEN, Notifications.ROUTE_CATCH),
            )
        }
    }

    val isXiaomi: Boolean
        get() = Build.MANUFACTURER.equals("Xiaomi", ignoreCase = true) ||
            Build.BRAND.lowercase().let { it == "xiaomi" || it == "redmi" || it == "poco" }

    /** Opens the "Display over other apps" switch for PinchDrop. */
    fun requestOverlay(context: Context) {
        runCatching {
            context.startActivity(
                Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }.onFailure { openAppDetails(context) }
    }

    /** Xiaomi's own permission page, where "Open new windows while running in the background" lives. */
    fun requestXiaomiBackgroundWindows(context: Context) {
        runCatching {
            context.startActivity(
                Intent("miui.intent.action.APP_PERM_EDITOR")
                    .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
                    .putExtra("extra_pkgname", context.packageName)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }.onFailure { openAppDetails(context) }
    }

    private fun openAppDetails(context: Context) {
        runCatching {
            context.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }
}
