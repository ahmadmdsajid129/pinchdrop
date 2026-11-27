package com.pinchdrop.companion.ui.screens

import com.pinchdrop.companion.transfer.History
import com.pinchdrop.companion.ui.GetPcAppCard
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Laptop
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pinchdrop.companion.data.AppSettings
import com.pinchdrop.companion.data.PcStatus
import com.pinchdrop.companion.ui.Avatar
import com.pinchdrop.companion.ui.DemoTag
import com.pinchdrop.companion.ui.PdCard
import com.pinchdrop.companion.ui.PrimaryButton
import com.pinchdrop.companion.ui.ToggleRow
import com.pinchdrop.companion.ui.theme.Pd

// ---------- Home ----------

@Composable
fun HomeScreen(
    settings: AppSettings,
    pc: PcStatus,
    notice: String?,
    clearNotice: () -> Unit,
    onPair: () -> Unit,
    onSeeAll: () -> Unit,
    onProfile: () -> Unit,
    onFeatures: () -> Unit = {},
    onGuide: () -> Unit = {},
) {
    val c = Pd.colors
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("PinchDrop", color = c.text, fontSize = 26.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f).semantics { heading() })
            Box(Modifier.clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Open profile", onClick = onProfile)) {
                Avatar(settings.phoneName, c.accent, size = 40)
            }
        }

        if (notice != null) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.warn.copy(alpha = 0.12f)).padding(start = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(notice, color = c.text, fontSize = 14.sp, modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite })
                TextButton(onClick = clearNotice) { Text("OK", color = c.accent) }
            }
        }

        if (pc.paired) ExtrasCard(onOpen = onFeatures)

        if (pc.connected) ScanToPcCard()

        if (pc.paired) {
            PdCard(borderColor = if (pc.connected) c.success.copy(alpha = 0.5f) else null) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Box(Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(c.surface2), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Laptop, contentDescription = null, tint = c.accent)
                    }
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(pc.name, color = c.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                            if (pc.isDemo) DemoTag()
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(Modifier.size(8.dp).clip(CircleShape).background(if (pc.connected) c.success else c.muted))
                            Text(
                                when {
                                    pc.connected -> "Connected · ${pc.network ?: "Wi-Fi"}"
                                    pc.connecting -> "Connecting…"
                                    else -> "Not on this Wi-Fi right now"
                                },
                                color = c.muted, fontSize = 13.sp,
                            )
                        }
                    }
                }
            }
            PdCard {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Icon(Icons.Filled.PanTool, contentDescription = null, tint = c.primary, modifier = Modifier.size(28.dp))
                    Column(Modifier.weight(1f)) {
                        Text(if (settings.catchWithHand) "Ready to catch" else "Ready to receive", color = c.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            if (settings.catchWithHand) "Camera turns on only when the PC sends" else "Hand catching is off — you'll get a tap-to-accept alert",
                            color = c.muted, fontSize = 13.sp,
                        )
                    }
                }
            }
        } else {
            PdCard {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Icon(Icons.Filled.Laptop, contentDescription = null, tint = c.muted, modifier = Modifier.size(36.dp))
                    Text("No PC paired yet", color = c.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                    Text("Install PinchDrop for Windows, open Devices → Pair a new phone, then scan its QR code here.", color = c.muted, fontSize = 14.sp, lineHeight = 20.sp)
                    PrimaryButton("Pair with PC", onClick = onPair, modifier = Modifier.fillMaxWidth())
                    GetPcAppCard(title = "Not on your PC yet?")
                }
            }
        }

        Text(
            "How to receive: select something on your PC → pinch in front of the laptop camera → open your hand over this phone.  See the full guide ›",
            color = c.soft, fontSize = 14.sp, lineHeight = 20.sp,
            modifier = Modifier.clip(RoundedCornerShape(14.dp)).background(c.bg2).clickable(role = Role.Button, onClickLabel = "Open the guide", onClick = onGuide).padding(14.dp),
        )

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Recently received", color = c.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text(
                "See all", color = c.accent, fontSize = 14.sp,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button, onClick = onSeeAll).padding(8.dp),
            )
        }
        val recent by History.items.collectAsStateWithLifecycle()
        if (recent.isEmpty()) EmptyReceived(compact = true) else recent.take(5).forEach { ReceivedRow(it) }
    }
}

@Composable
private fun EmptyReceived(compact: Boolean, filter: ReceivedFilter = ReceivedFilter.ALL) {
    val c = Pd.colors
    // Each filter says what's missing (a photo filter with no photos says so, with its own icon).
    val (icon, title, body) = when (filter) {
        ReceivedFilter.ALL -> Triple(Icons.Filled.Inventory2, "Nothing received yet", "Files you catch from your PC show up here.")
        ReceivedFilter.PHOTOS -> Triple(Icons.Filled.Image, "No photos yet", "Pinch a photo on your PC and open your hand over this phone. It lands in your Gallery too.")
        ReceivedFilter.VIDEOS -> Triple(Icons.Filled.Movie, "No videos yet", "Videos you catch from your PC show up here and in your Gallery.")
        ReceivedFilter.FILES -> Triple(Icons.Filled.Description, "No files yet", "Documents, folders, links and text from your PC show up here. Files are saved in Downloads/PinchDrop.")
    }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(c.surface).padding(if (compact) 20.dp else 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            Modifier.size(if (compact) 48.dp else 72.dp).clip(CircleShape).background(c.primary.copy(alpha = 0.10f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = c.primary, modifier = Modifier.size(if (compact) 26.dp else 36.dp))
        }
        Text(title, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Text(body, color = c.muted, fontSize = 13.sp, textAlign = TextAlign.Center, lineHeight = 18.sp)
    }
}

// ---------- Received ----------

@Composable
fun ReceivedScreen() {
    val c = Pd.colors
    val items by History.items.collectAsStateWithLifecycle()
    var filter by rememberSaveable { mutableStateOf(ReceivedFilter.ALL) }
    val shown = items.filter { filter.matches(it) }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text("Received", color = c.text, fontSize = 26.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
        }
        item {
            // Scrolls sideways on narrow phones / big text instead of squashing the labels.
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ReceivedFilter.entries.forEach { f ->
                    FilterChip(
                        selected = filter == f,
                        onClick = { filter = f },
                        label = { Text(f.label, maxLines = 1, softWrap = false) },
                        modifier = Modifier.heightIn(min = 40.dp),
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = c.primary, selectedLabelColor = Color.White,
                            containerColor = c.surface, labelColor = c.soft,
                        ),
                    )
                }
            }
        }
        if (shown.isEmpty()) {
            item(key = "empty-${filter.name}") { EmptyReceived(compact = false, filter = filter) }
        } else {
            items(shown, key = { it.id }) { ReceivedRow(it) }
            item {
                Text(
                    "Tap to open. Long-press for Share, Copy or Remove from list (the file stays on the phone).",
                    color = c.muted, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
    }
}

/** v2 · Scan a document with the phone's camera; the PDF lands and opens on the PC. */
@androidx.compose.runtime.Composable
private fun ScanToPcCard() {
    val c = Pd.colors
    val context = androidx.compose.ui.platform.LocalContext.current
    val activity = context as? android.app.Activity
    val launcher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.StartIntentSenderForResult(),
    ) { r ->
        if (r.resultCode == android.app.Activity.RESULT_OK) {
            val pdf = com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult.fromActivityResultIntent(r.data)?.pdf?.uri
            if (pdf != null) {
                com.pinchdrop.companion.transfer.Lifter.sendNow(context, listOf(pdf))
                android.widget.Toast.makeText(context, "Sending the scan to your PC", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }
    PdCard {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            androidx.compose.material3.Icon(
                androidx.compose.material.icons.Icons.Filled.DocumentScanner, contentDescription = null, tint = c.primary,
                modifier = Modifier.size(28.dp),
            )
            Column(Modifier.weight(1f)) {
                Text("Scan to PC", color = c.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Text("Scan a document; the PDF opens on your PC", color = c.muted, fontSize = 13.sp)
            }
            com.pinchdrop.companion.ui.SecondaryButton("Scan", onClick = {
                val act = activity ?: return@SecondaryButton
                val options = com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.Builder()
                    .setGalleryImportAllowed(true)
                    .setResultFormats(com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
                    .setScannerMode(com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.SCANNER_MODE_FULL)
                    .build()
                com.google.mlkit.vision.documentscanner.GmsDocumentScanning.getClient(options).getStartScanIntent(act)
                    .addOnSuccessListener { launcher.launch(androidx.activity.result.IntentSenderRequest.Builder(it).build()) }
                    .addOnFailureListener {
                        android.widget.Toast.makeText(context, "The scanner isn't available on this phone", android.widget.Toast.LENGTH_SHORT).show()
                    }
            })
        }
    }
}
