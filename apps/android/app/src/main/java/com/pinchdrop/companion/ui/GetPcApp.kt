package com.pinchdrop.companion.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pinchdrop.companion.ui.theme.Pd

/** The website page that offers the right download for each device (the PC app on Windows). */
const val GET_APP_URL = "https://ahmadmdsajid129.github.io/pinchdrop/get.html"

/**
 * "Get PinchDrop for your PC": PinchDrop works in pairs, so the phone tells people about the PC
 * app (and the PC app shows a QR code for this one). The link is shared to wherever they'll open
 * it on the PC: WhatsApp Web, email, Nearby Share…
 */
@Composable
fun GetPcAppCard(modifier: Modifier = Modifier, title: String = "Get PinchDrop for your PC") {
    val c = Pd.colors
    val context = LocalContext.current
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(c.bg2).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(c.primary.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Computer, contentDescription = null, tint = c.primary) }
            Column(Modifier.weight(1f)) {
                Text(title, color = c.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Text("PinchDrop works in pairs: install it on your Windows PC too.", color = c.muted, fontSize = 13.sp, lineHeight = 18.sp)
            }
        }
        Text(
            GET_APP_URL.removePrefix("https://"),
            color = c.soft, fontSize = 11.sp, fontFamily = FontFamily.Monospace, maxLines = 1, softWrap = false,
            overflow = TextOverflow.Ellipsis,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PrimaryButton("Send link to my PC", onClick = { shareGetLink(context) }, modifier = Modifier.weight(1f))
            SecondaryButton("Copy", onClick = { copyGetLink(context) })
        }
    }
}

private fun shareGetLink(context: Context) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, "PinchDrop for Windows")
        putExtra(Intent.EXTRA_TEXT, "Get PinchDrop for my PC: $GET_APP_URL")
    }
    runCatching { context.startActivity(Intent.createChooser(send, "Send the link to your PC").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}

private fun copyGetLink(context: Context) {
    val cm = context.getSystemService(ClipboardManager::class.java) ?: return
    cm.setPrimaryClip(ClipData.newPlainText("PinchDrop for Windows", GET_APP_URL))
    Toast.makeText(context, "Link copied. Open it on your PC.", Toast.LENGTH_SHORT).show()
}
