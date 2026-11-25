package com.pinchdrop.companion.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.automirrored.filled.Notes
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pinchdrop.companion.data.ItemKind
import com.pinchdrop.companion.data.formatBytes
import com.pinchdrop.companion.transfer.History
import com.pinchdrop.companion.transfer.ReceivedItem
import com.pinchdrop.companion.ui.isLink
import com.pinchdrop.companion.ui.loadThumbnail
import com.pinchdrop.companion.ui.openUri
import com.pinchdrop.companion.ui.shareText
import com.pinchdrop.companion.ui.shareUri
import com.pinchdrop.companion.ui.theme.Pd
import java.text.DateFormat
import java.util.Date

enum class ReceivedFilter(val label: String) { ALL("All"), PHOTOS("Photos"), VIDEOS("Videos"), FILES("Files") }

fun ReceivedFilter.matches(i: ReceivedItem) = when (this) {
    ReceivedFilter.ALL -> true
    ReceivedFilter.PHOTOS -> i.kind == ItemKind.PHOTO
    ReceivedFilter.VIDEOS -> i.kind == ItemKind.VIDEO
    ReceivedFilter.FILES -> i.kind == ItemKind.FILE || i.kind == ItemKind.FOLDER || i.kind == ItemKind.TEXT
}

private fun ago(ms: Long): String {
    val d = (System.currentTimeMillis() - ms) / 1000
    return when {
        d < 60 -> "just now"
        d < 3600 -> "${d / 60} min ago"
        d < 86400 -> "${d / 3600} h ago"
        else -> DateFormat.getDateInstance(DateFormat.SHORT).format(Date(ms))
    }
}

/** One received item. Tap opens it; long-press shows Open · Share · Copy · Remove from list. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ReceivedRow(item: ReceivedItem) {
    val c = Pd.colors
    val context = LocalContext.current
    var menu by remember { mutableStateOf(false) }
    val thumb = remember(item.uri) { item.uri?.takeIf { item.kind == ItemKind.PHOTO }?.let { loadThumbnail(context, it, 160) } }
    val open: () -> Unit = {
        when {
            item.uri != null -> openUri(context, item.uri)
            item.text != null && isLink(item.text) -> openUri(context, item.text)
            else -> menu = true
        }
    }
    val detail = when (item.kind) {
        ItemKind.FOLDER -> "${item.fileCount} files · ${formatBytes(item.size)} · ${item.location}"
        ItemKind.TEXT -> item.text.orEmpty()
        else -> "${formatBytes(item.size)} · ${item.location}"
    }
    Box {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 64.dp).clip(RoundedCornerShape(16.dp)).background(c.surface)
                .combinedClickable(role = Role.Button, onClickLabel = "Open", onLongClickLabel = "More actions", onLongClick = { menu = true }, onClick = open)
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).background(c.surface2), contentAlignment = Alignment.Center) {
                if (thumb != null) {
                    Image(thumb, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(44.dp))
                } else {
                    val icon = when (item.kind) {
                        ItemKind.FOLDER -> Icons.Filled.Folder
                        ItemKind.PHOTO -> Icons.Filled.Image
                        ItemKind.VIDEO -> Icons.Filled.Movie
                        ItemKind.TEXT -> if (item.text != null && isLink(item.text)) Icons.Filled.Link else Icons.AutoMirrored.Filled.Notes
                        ItemKind.FILE -> Icons.AutoMirrored.Filled.InsertDriveFile
                    }
                    Icon(icon, contentDescription = null, tint = if (item.kind == ItemKind.FOLDER) c.warn else c.accent)
                }
            }
            Column(Modifier.weight(1f)) {
                Text(item.name, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("$detail · ${ago(item.receivedAt)}", color = c.muted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            if (item.uri != null) {
                DropdownMenuItem(text = { Text("Open") }, onClick = { menu = false; openUri(context, item.uri) })
                DropdownMenuItem(text = { Text("Share") }, onClick = { menu = false; shareUri(context, item.uri) })
            }
            if (item.text != null) {
                DropdownMenuItem(text = { Text("Copy") }, onClick = {
                    menu = false
                    context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("PinchDrop", item.text))
                    Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show()
                })
                DropdownMenuItem(text = { Text("Share") }, onClick = { menu = false; shareText(context, item.text) })
            }
            if (item.kind == ItemKind.FOLDER) {
                DropdownMenuItem(text = { Text("Find it in Files › ${item.location}") }, onClick = { menu = false }, enabled = false)
            }
            DropdownMenuItem(text = { Text("Remove from list") }, onClick = { menu = false; History.remove(item.id) })
        }
    }
}
