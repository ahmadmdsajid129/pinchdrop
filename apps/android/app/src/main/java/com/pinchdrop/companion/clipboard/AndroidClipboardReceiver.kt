package com.pinchdrop.companion.clipboard

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast

class AndroidClipboardReceiver(private val context: Context) {

    fun setSystemClipboard(content: String, label: String = "PinchDrop Air Clipboard") {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        if (clipboard != null) {
            val clip = ClipData.newPlainText(label, content)
            clipboard.setPrimaryClip(clip)

            val isUrl = content.startsWith("http://") || content.startsWith("https://")
            val toastMsg = if (isUrl) "🔗 Copied Link to Phone Clipboard" else "📋 Copied Text to Phone Clipboard"
            Toast.makeText(context, toastMsg, Toast.LENGTH_SHORT).show()
        }
    }
}
