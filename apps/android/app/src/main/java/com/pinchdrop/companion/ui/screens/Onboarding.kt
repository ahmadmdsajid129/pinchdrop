package com.pinchdrop.companion.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.BatteryChargingFull
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.pinchdrop.companion.Notifications
import com.pinchdrop.companion.ui.PrimaryButton
import com.pinchdrop.companion.ui.SecondaryButton
import com.pinchdrop.companion.ui.theme.Pd

@Composable
fun ScreenHeader(title: String, onBack: (() -> Unit)? = null, eyebrow: String? = null) {
    val c = Pd.colors
    Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 16.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = c.text) }
        } else {
            Spacer(Modifier.width(12.dp))
        }
        Column {
            if (eyebrow != null) Text(eyebrow, color = c.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp)
            Text(title, color = c.text, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
        }
    }
}

@Composable
fun WelcomeScreen(onStart: () -> Unit) {
    val c = Pd.colors
    val drop = remember { Animatable(-40f) }
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        alpha.animateTo(1f, tween(300))
    }
    LaunchedEffect(Unit) {
        drop.animateTo(0f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow))
    }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Spacer(Modifier.height(40.dp))
        Box(Modifier.size(180.dp), contentAlignment = Alignment.Center) {
            Box(
                Modifier.size(170.dp).clip(RoundedCornerShape(40.dp))
                    .background(Brush.radialGradient(listOf(c.primary.copy(alpha = 0.35f), Color.Transparent))),
            )
            // A file card dropping into the phone.
            Box(
                Modifier.graphicsLayer { translationY = drop.value * density; this.alpha = alpha.value }
                    .size(72.dp, 88.dp).clip(RoundedCornerShape(14.dp))
                    .background(Brush.linearGradient(listOf(c.primary, c.accent))),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Folder, contentDescription = null, tint = Color.White, modifier = Modifier.size(36.dp)) }
        }
        Spacer(Modifier.height(28.dp))
        Text(
            "Catch files from your PC", color = c.text, fontSize = 30.sp, fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center, lineHeight = 36.sp, modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(12.dp))
        Text(
            "Pinch a file on your laptop, open your hand over this phone, and it lands here. Works on your home Wi-Fi — no cloud, no account.",
            color = c.muted, fontSize = 16.sp, textAlign = TextAlign.Center, lineHeight = 24.sp,
        )
        Spacer(Modifier.height(36.dp))
        PrimaryButton("Get started", onClick = onStart, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        Text("Needs PinchDrop for Windows on your PC", color = c.muted, fontSize = 13.sp)
    }
}

// ---------- Permissions ----------

private fun Context.findActivity(): Activity? {
    var ctx: Context? = this
    while (ctx is ContextWrapper) {
        if (ctx is Activity) return ctx
        ctx = ctx.baseContext
    }
    return null
}

private fun Context.granted(permission: String) =
    ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

private fun Context.ignoringBatteryOptimizations(): Boolean =
    getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(packageName) == true

private fun Context.openAppSettings() {
    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
}

enum class PermState { GRANTED, ASK, BLOCKED, NOT_NEEDED }

/**
 * A runtime permission with Android's own pop-up. After two refusals Android stops showing the
 * pop-up; we detect that (no rationale + still denied after asking) and offer the App settings page.
 */
@Composable
private fun rememberRuntimePermission(permission: String?, refreshKey: Int): Pair<PermState, () -> Unit> {
    val context = LocalContext.current
    var asked by remember { mutableStateOf(false) }
    var tick by remember { mutableIntStateOf(0) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { asked = true; tick++ }
    // Re-checked after each pop-up answer and each time the screen resumes (e.g. back from App settings).
    val state = remember(permission, refreshKey, tick) {
        when {
            permission == null -> PermState.NOT_NEEDED
            context.granted(permission) -> PermState.GRANTED
            asked && context.findActivity()?.shouldShowRequestPermissionRationale(permission) == false -> PermState.BLOCKED
            else -> PermState.ASK
        }
    }
    val request: () -> Unit = {
        when (state) {
            PermState.ASK -> launcher.launch(permission!!)
            PermState.BLOCKED -> context.openAppSettings()
            else -> Unit
        }
    }
    return state to request
}

@SuppressLint("BatteryLife") // The user taps "Allow" on a row that explains exactly why.
@Composable
fun PermissionsScreen(step: String?, onContinue: () -> Unit, onBack: () -> Unit) {
    val c = Pd.colors
    val context = LocalContext.current
    var resumeTick by remember { mutableIntStateOf(0) }
    LifecycleResumeEffect(Unit) {
        resumeTick++
        onPauseOrDispose { }
    }

    val notifPerm = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.POST_NOTIFICATIONS else null
    val nearbyPerm = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.NEARBY_WIFI_DEVICES else null
    val (notif, askNotif) = rememberRuntimePermission(notifPerm, resumeTick)
    val (camera, askCamera) = rememberRuntimePermission(Manifest.permission.CAMERA, resumeTick)
    val (nearby, askNearby) = rememberRuntimePermission(nearbyPerm, resumeTick)
    // Android 8–9 only: saving into the public Download / Pictures folders needs this.
    val storagePerm = if (Build.VERSION.SDK_INT < 29) Manifest.permission.WRITE_EXTERNAL_STORAGE else null
    val (storage, askStorage) = rememberRuntimePermission(storagePerm, resumeTick)
    val background = remember(resumeTick) { if (context.ignoringBatteryOptimizations()) PermState.GRANTED else PermState.ASK }
    val askBackground = {
        runCatching {
            context.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}")))
        }.onFailure { context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
        Unit
    }
    val autoOpen = remember(resumeTick) {
        if (com.pinchdrop.companion.transfer.AutoOpen.allowed(context)) PermState.GRANTED else PermState.ASK
    }
    val askAutoOpen = { com.pinchdrop.companion.transfer.AutoOpen.requestOverlay(context) }
    // Before Android 13 there is no pop-up, but the user can still turn notifications off for the app.
    val notifState = remember(notif, resumeTick) {
        if (notif == PermState.NOT_NEEDED) {
            if (Notifications.canPost(context)) PermState.GRANTED else PermState.BLOCKED
        } else notif
    }

    Column(Modifier.fillMaxSize()) {
        ScreenHeader(title = if (step != null) "Allow a few things" else "Permissions", onBack = onBack, eyebrow = step)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Android will show its own pop-up after each Allow.", color = c.muted, fontSize = 15.sp)
            PermissionRow(Icons.Filled.Notifications, "Notifications", "“CPP is coming” alerts and progress", notifState, askNotif)
            PermissionRow(Icons.Filled.CameraAlt, "Camera", "Sees your open hand to catch. Also scans the pairing QR. Nothing is recorded.", camera, askCamera)
            PermissionRow(Icons.Filled.Wifi, "Nearby devices", "Finds your PC on this Wi-Fi", nearby, askNearby)
            PermissionRow(
                Icons.Filled.BatteryChargingFull, "Stay connected in background",
                "Lets your PC show this phone's battery and reach it while the screen is off. Uses very little battery.",
                background, askBackground,
            )
            PermissionRow(
                Icons.Filled.PanTool, "Open PinchDrop by itself",
                if (com.pinchdrop.companion.transfer.AutoOpen.isXiaomi)
                    "Opens the catch camera the moment you pinch on your PC, and shows files as they arrive. Turn on “Display over other apps”, then in Other permissions “Open new windows while running in the background”."
                else "Opens the catch camera the moment you pinch on your PC and shows files as they arrive, even while you use another app. Android calls this “Display over other apps”.",
                autoOpen, askAutoOpen,
            )
            if (com.pinchdrop.companion.transfer.AutoOpen.isXiaomi && autoOpen == PermState.GRANTED) {
                SecondaryButton(
                    "Xiaomi: allow background windows",
                    onClick = { com.pinchdrop.companion.transfer.AutoOpen.requestXiaomiBackgroundWindows(context) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            PermissionRow(
                Icons.Filled.Folder, "Saving files",
                if (storagePerm == null) "No permission needed — files go to Gallery and Downloads/PinchDrop."
                else "Lets PinchDrop save what you receive into Download/PinchDrop and Pictures/PinchDrop.",
                storage, askStorage,
            )
            if (camera != PermState.GRANTED) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Filled.PanTool, contentDescription = null, tint = c.muted, modifier = Modifier.size(16.dp))
                    Text("Without the camera you can still accept with a tap.", color = c.muted, fontSize = 13.sp)
                }
            }
        }
        PrimaryButton(if (step != null) "Continue" else "Done", onClick = onContinue, modifier = Modifier.fillMaxWidth().padding(20.dp))
    }
}

@Composable
private fun PermissionRow(icon: ImageVector, title: String, body: String, state: PermState, onAllow: () -> Unit) {
    val c = Pd.colors
    val ok = state == PermState.GRANTED || state == PermState.NOT_NEEDED
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(c.surface)
            .border(1.dp, if (state == PermState.GRANTED) c.success.copy(alpha = 0.6f) else c.line, RoundedCornerShape(18.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(c.surface2), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = c.accent)
        }
        Column(Modifier.weight(1f)) {
            Text(title, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text(body, color = c.muted, fontSize = 13.sp, lineHeight = 18.sp)
            if (state == PermState.BLOCKED) Text("Turned off in Android settings.", color = c.warn, fontSize = 12.sp)
        }
        when {
            state == PermState.GRANTED -> Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Check, contentDescription = null, tint = c.success, modifier = Modifier.size(18.dp))
                Text("Allowed", color = c.success, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
            state == PermState.NOT_NEEDED && title != "Saving files" -> Text("Not needed", color = c.muted, fontSize = 12.sp)
            state == PermState.BLOCKED -> SecondaryButton("Settings", onClick = onAllow)
            !ok -> SecondaryButton("Allow", onClick = onAllow)
        }
    }
}
