package com.pinchdrop.companion.phone

import android.app.Activity
import android.app.PendingIntent
import android.content.ClipboardManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.service.quicksettings.TileService
import android.widget.Toast
import org.json.JSONObject

/**
 * v2 · Quick Settings tile "Copy to PC": copy something on the phone, pull down the shade, tap.
 * Android lets only the app on screen read the clipboard, so the tile opens a see-through
 * screen for a split second that reads it, sends it to the PC, and closes.
 */
class ClipTile : TileService() {
    override fun onClick() {
        super.onClick()
        val intent = Intent(this, ClipSendActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE))
        } else {
            @Suppress("DEPRECATION", "StartActivityAndCollapseDeprecated")
            startActivityAndCollapse(intent)
        }
    }
}

/** See-through, closes itself once the clipboard has been read. */
class ClipSendActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        com.pinchdrop.companion.link.PcLink.init(this)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (!hasFocus) return
        val text = runCatching {
            getSystemService(ClipboardManager::class.java).primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString()
        }.getOrNull()?.take(100_000)
        val msg = when {
            text.isNullOrBlank() -> "Nothing copied yet"
            !PhoneData.isConnected() -> "Your PC isn't connected"
            else -> {
                // "explicit": sent by the user's tap, so the PC takes it even with sharing switched off.
                PhoneData.push("clip.set", JSONObject().put("text", text).put("explicit", true))
                "Copied to your PC"
            }
        }
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        finish()
    }
}
