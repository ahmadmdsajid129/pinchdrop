package com.pinchdrop.companion.ui.screens

import android.content.pm.PackageManager
import com.pinchdrop.companion.ui.GetPcAppCard
import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pinchdrop.companion.Notifications
import com.pinchdrop.companion.data.AppSettings
import com.pinchdrop.companion.data.DeviceInfo
import com.pinchdrop.companion.data.HandDetection
import com.pinchdrop.companion.data.ManualSends
import com.pinchdrop.companion.data.NameClash
import com.pinchdrop.companion.data.PcStatus
import com.pinchdrop.companion.data.ThemeMode
import com.pinchdrop.companion.link.PcLink
import com.pinchdrop.companion.ui.Avatar
import com.pinchdrop.companion.ui.DemoTag
import com.pinchdrop.companion.ui.NavRow
import com.pinchdrop.companion.ui.PdCard
import com.pinchdrop.companion.ui.Route
import com.pinchdrop.companion.ui.SecondaryButton
import com.pinchdrop.companion.ui.SectionLabel
import com.pinchdrop.companion.ui.Segmented
import com.pinchdrop.companion.ui.SettingRow
import com.pinchdrop.companion.ui.ToggleRow
import com.pinchdrop.companion.ui.theme.Pd
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun SettingsScreen(
    settings: AppSettings,
    pc: PcStatus,
    update: ((AppSettings) -> AppSettings) -> Unit,
    onPair: () -> Unit,
    onProfile: () -> Unit,
    onPermissions: () -> Unit,
    onDemo: (Route) -> Unit,
    onGuide: () -> Unit = {},
) {
    val c = Pd.colors
    val context = LocalContext.current
    var notice by remember { mutableStateOf<String?>(null) }
    var confirmUnpair by remember { mutableStateOf(false) }
    if (confirmUnpair) {
        AlertDialog(
            onDismissRequest = { confirmUnpair = false },
            title = { Text("Unpair ${pc.name}?") },
            text = { Text("This phone forgets the PC, and the PC forgets this phone if it's connected now. To use them together again, scan a new pairing QR code.") },
            confirmButton = { TextButton(onClick = { confirmUnpair = false; PcLink.unpair() }) { Text("Unpair", color = c.danger) } },
            dismissButton = { TextButton(onClick = { confirmUnpair = false }) { Text("Cancel") } },
            containerColor = c.surface, titleContentColor = c.text, textContentColor = c.soft,
        )
    }
    val version = remember {
        val pm = context.packageManager
        val info = if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION") pm.getPackageInfo(context.packageName, 0)
        }
        info.versionName ?: ""
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 20.dp)) {
        Text("Settings", color = c.text, fontSize = 26.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })

        SectionLabel("Connection")
        PdCard {
            if (pc.paired) {
                SettingRow(
                    title = pc.name,
                    description = when {
                        pc.connected -> "Connected · ${pc.network ?: "Wi-Fi"}"
                        pc.connecting -> "Connecting…"
                        else -> "Not connected — looking for it on this Wi-Fi"
                    },
                ) {
                    if (pc.isDemo) DemoTag()
                    TextButton(onClick = { if (pc.isDemo) update { it.copy(demoPc = false) } else confirmUnpair = true }) {
                        Text(if (pc.isDemo) "Turn off" else "Unpair", color = c.danger)
                    }
                }
            } else {
                SettingRow(title = "No PC paired", description = "Pair once; it reconnects by itself on the same Wi-Fi")
            }
            ToggleRow(
                "Stay connected in background", settings.stayConnected, { v -> update { it.copy(stayConnected = v) } },
                description = "Shows battery on the PC, receives with screen off",
            )
            NavRow(if (pc.paired) "Pair another PC" else "Pair with PC", onClick = onPair, last = true)
        }
        GetPcAppCard(Modifier.padding(top = 10.dp), title = if (pc.paired) "PinchDrop on another PC" else "Get PinchDrop for your PC")

        SectionLabel("Catching")
        PdCard {
            ToggleRow(
                "Catch with open hand", settings.catchWithHand, { v -> update { it.copy(catchWithHand = v) } },
                description = "Uses the front camera only while something is coming",
            )
            ToggleRow(
                "Catch by hovering over the phone", settings.proximityCatch, { v -> update { it.copy(proximityCatch = v) } },
                description = "Wave a hand over the top of the phone, no camera needed. Works with the screen off.",
            )
            SettingRow("Hand detection") {
                Segmented(
                    listOf(HandDetection.EASY to "Easy", HandDetection.NORMAL to "Normal", HandDetection.STRICT to "Strict"),
                    settings.handDetection, { v -> update { it.copy(handDetection = v) } },
                )
            }
            SettingRow("Manual sends from the PC", description = if (settings.manualSends == ManualSends.AUTO) "Accept automatically" else "Ask me first") {
                Segmented(
                    listOf(ManualSends.AUTO to "Auto", ManualSends.ASK to "Ask"),
                    settings.manualSends, { v -> update { it.copy(manualSends = v) } },
                )
            }
            NavRow("Practice the catch", onClick = { onDemo(Route.CATCH_DEMO) }, description = "Try the open-hand catch with a pretend folder — nothing is sent", last = true)
        }

        SectionLabel("Saving")
        PdCard {
            SettingRow("Photos & videos") { Text("Gallery › PinchDrop", color = c.soft, fontSize = 13.sp) }
            SettingRow("Files & folders") { Text("Downloads/PinchDrop", color = c.soft, fontSize = 13.sp) }
            SettingRow("Same name exists", last = true) {
                Segmented(
                    listOf(NameClash.KEEP_BOTH to "Keep both", NameClash.REPLACE to "Replace"),
                    settings.nameClash, { v -> update { it.copy(nameClash = v) } },
                )
            }
        }

        SectionLabel("Notifications & feel")
        PdCard {
            ToggleRow("Arrival animation", settings.arrivalAnimation, { v -> update { it.copy(arrivalAnimation = v) } })
            ToggleRow("Arrival sound", settings.arrivalSound, { v -> update { it.copy(arrivalSound = v) } })
            ToggleRow("Vibrate on catch & arrival", settings.vibrate, { v -> update { it.copy(vibrate = v) } })
            SettingRow("Theme", last = true) {
                Segmented(
                    listOf(ThemeMode.DARK to "Dark", ThemeMode.LIGHT to "Light", ThemeMode.SYSTEM to "Auto"),
                    settings.theme, { v -> update { it.copy(theme = v) } },
                )
            }
        }

        SectionLabel("Preview the animations")
        PdCard {
            NavRow("Incoming alert", description = notice ?: "Posts a real notification marked “demo”", onClick = {
                notice = if (Notifications.postIncomingDemo(context, pc.name.ifEmpty { "Demo laptop" })) {
                    "Sent — pull down your notifications"
                } else {
                    "Notifications are off — allow them in Permissions"
                }
            })
            NavRow("Catch screen", onClick = { onDemo(Route.CATCH_DEMO) })
            NavRow("Receiving animation", onClick = { onDemo(Route.RECEIVING_DEMO) })
            NavRow("Photo arrived animation", onClick = { onDemo(Route.ARRIVED_DEMO) }, last = true)
        }

        SectionLabel("You & this phone")
        PdCard {
            NavRow("Profile", onClick = onProfile, value = settings.phoneName)
            NavRow("Features & permissions", onClick = onPermissions, description = "Messages, calls, photos and more on your PC")
            NavRow("How to use PinchDrop", onClick = onGuide, last = true)
        }

        SectionLabel("Privacy & about")
        PdCard {
            Text(
                "Camera frames are checked in memory for an open hand and discarded. Nothing is recorded or uploaded.",
                color = c.soft, fontSize = 13.sp, lineHeight = 19.sp, modifier = Modifier.padding(16.dp),
            )
            val history by com.pinchdrop.companion.transfer.History.items.collectAsStateWithLifecycle()
            var confirmClear by remember { mutableStateOf(false) }
            NavRow(
                "Clear received history",
                onClick = { if (history.isNotEmpty()) confirmClear = true },
                description = if (history.isEmpty()) "Nothing in the list" else "${history.size} item${if (history.size == 1) "" else "s"} in the list · the files stay on the phone",
            )
            if (confirmClear) {
                androidx.compose.material3.AlertDialog(
                    onDismissRequest = { confirmClear = false },
                    title = { Text("Clear the Received list?") },
                    text = { Text("Only the list is cleared. The files stay in your Gallery and Downloads.") },
                    confirmButton = { androidx.compose.material3.TextButton(onClick = { com.pinchdrop.companion.transfer.History.clear(); confirmClear = false }) { Text("Clear", color = c.danger) } },
                    dismissButton = { androidx.compose.material3.TextButton(onClick = { confirmClear = false }) { Text("Cancel", color = c.muted) } },
                    containerColor = c.surface, titleContentColor = c.text, textContentColor = c.soft,
                )
            }
            SettingRow("PinchDrop $version", description = "Pinch on your PC, catch on your phone", last = true)
        }
    }
}

// ---------- Profile ----------

@Composable
fun ProfileScreen(settings: AppSettings, update: ((AppSettings) -> AppSettings) -> Unit, onReset: () -> Unit, onBack: () -> Unit) {
    val c = Pd.colors
    val focus = LocalFocusManager.current
    var name by rememberSaveable { mutableStateOf(settings.phoneName) }
    var confirmReset by remember { mutableStateOf(false) }
    LaunchedEffect(settings.phoneName) { name = settings.phoneName }
    val save = {
        val clean = name.trim().take(40)
        if (clean.isNotEmpty() && clean != settings.phoneName) update { it.copy(phoneName = clean) } else name = settings.phoneName
    }

    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Profile", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Avatar(name.ifBlank { settings.phoneName }, c.accent, size = 96)
            OutlinedTextField(
                value = name,
                onValueChange = { name = it.take(40) },
                label = { Text("Phone name shown on your PC's pill") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { focus.clearFocus() }),
                modifier = Modifier.fillMaxWidth().onFocusChanged { if (!it.isFocused) save() },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = c.primary, unfocusedBorderColor = c.line,
                    focusedTextColor = c.text, unfocusedTextColor = c.text,
                    focusedLabelColor = c.accent, unfocusedLabelColor = c.muted,
                ),
            )
            PdCard {
                SettingRow("Shared with PC", description = "Name · battery · free space")
                SettingRow("Model", description = "${DeviceInfo.model()} · ${DeviceInfo.androidVersion()}")
                SettingRow("Security key", description = "Created for each PC when you pair, kept only on this phone", last = true)
            }
            Text(
                "No account needed. Contacts, messages and other apps are never touched.",
                color = c.soft, fontSize = 13.sp, lineHeight = 19.sp,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.bg2).padding(14.dp),
            )
            SecondaryButton("Reset PinchDrop on this phone", onClick = { confirmReset = true }, modifier = Modifier.fillMaxWidth(), danger = true)
        }
    }

    if (confirmReset) {
        AlertDialog(
            onDismissRequest = { confirmReset = false },
            title = { Text("Reset PinchDrop?") },
            text = { Text("This clears all PinchDrop settings on this phone and shows the setup again. Files you received are not touched.") },
            confirmButton = { TextButton(onClick = { confirmReset = false; onReset() }) { Text("Reset", color = c.danger) } },
            dismissButton = { TextButton(onClick = { confirmReset = false }) { Text("Cancel") } },
            containerColor = c.surface,
            titleContentColor = c.text,
            textContentColor = c.soft,
        )
    }
}
