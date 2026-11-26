package com.pinchdrop.companion.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryChargingFull
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.pinchdrop.companion.Notifications
import com.pinchdrop.companion.transfer.AutoOpen
import com.pinchdrop.companion.ui.PrimaryButton
import com.pinchdrop.companion.ui.SecondaryButton
import com.pinchdrop.companion.ui.theme.Pd

/*
 * v2 · Permissions without the wall of permissions.
 *
 * 1. Setup asks for just what's needed to start (find the PC, tell you when something arrives,
 *    and the camera for the hand catch), all from one button.
 * 2. Everything else is a *feature* you switch on when you want it: "Messages on your PC", not
 *    "SMS permission". Each is off until tapped, says in one line what you get, and asks
 *    Android only then. A progress bar makes turning features on feel like unlocking, not giving.
 */

private fun Context.ignoringBatteryOptimizations(): Boolean =
    getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(packageName) == true

private fun Context.openAppSettings() {
    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
}

/** The permissions setup asks for together (Android shows its pop-ups one after another). */
private fun startPermissions(): List<String> = buildList {
    if (Build.VERSION.SDK_INT >= 33) {
        add(Manifest.permission.POST_NOTIFICATIONS)
        add(Manifest.permission.NEARBY_WIFI_DEVICES)
    }
    add(Manifest.permission.CAMERA)
    if (Build.VERSION.SDK_INT < 29) add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
}

/** Setup step 1: one screen, one button. */
@Composable
fun PermissionsScreen(step: String?, onContinue: () -> Unit, onBack: () -> Unit) {
    if (step == null) {
        FeaturesScreen(onboarding = false, onDone = onContinue, onBack = onBack)
        return
    }
    val c = Pd.colors
    val context = LocalContext.current
    val perms = remember { startPermissions() }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { onContinue() }
    val allGranted = perms.all { context.granted(it) }
    Column(Modifier.fillMaxSize()) {
        ScreenHeader(title = "Let's get you connected", onBack = onBack, eyebrow = step)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                "PinchDrop works between this phone and your PC on your own Wi-Fi. To start, it only needs to:",
                color = c.soft, fontSize = 16.sp, lineHeight = 23.sp,
            )
            StartRow(Icons.Filled.Wifi, "Find your PC on this Wi-Fi")
            StartRow(Icons.Filled.Notifications, "Tell you when something arrives")
            StartRow(Icons.Filled.CameraAlt, "Catch with your open hand", "The camera turns on only while your PC is sending. Nothing is recorded.")
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.success.copy(alpha = 0.10f)).padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Lock, contentDescription = null, tint = c.success, modifier = Modifier.size(20.dp))
                Text(
                    "No account, no cloud. Your files never leave your home network.",
                    color = c.text, fontSize = 14.sp, lineHeight = 19.sp,
                )
            }
            Text(
                "Extras like messages or calls on your PC stay off. You can switch them on later, one at a time, if you want them.",
                color = c.muted, fontSize = 13.sp, lineHeight = 18.sp,
            )
        }
        PrimaryButton(
            if (allGranted) "Continue" else "Allow and continue",
            onClick = {
                val missing = perms.filterNot { context.granted(it) }
                if (missing.isEmpty()) onContinue() else launcher.launch(missing.toTypedArray())
            },
            modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 12.dp),
        )
        TextButton(onClick = onContinue, modifier = Modifier.align(Alignment.CenterHorizontally).padding(bottom = 8.dp)) {
            Text("Not now", color = c.muted)
        }
    }
}

@Composable
private fun StartRow(icon: ImageVector, title: String, sub: String? = null) {
    val c = Pd.colors
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(c.primary.copy(alpha = 0.10f)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = c.primary)
        }
        Column(Modifier.weight(1f)) {
            Text(title, color = c.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            if (sub != null) Text(sub, color = c.muted, fontSize = 13.sp, lineHeight = 18.sp)
        }
    }
}

// ---------- Features ----------

private class Feature(
    val icon: ImageVector,
    val title: String,
    val body: String,
    val on: Boolean,
    val blocked: Boolean,
    val turnOn: () -> Unit,
    val note: String? = null,
)

/** How many optional features are on (Home's "Make more of PinchDrop" card). */
fun featuresOn(context: Context): Pair<Int, Int> {
    val checks = listOf(
        com.pinchdrop.companion.phone.NotifyListener.accessGranted(context),
        context.granted(Manifest.permission.READ_SMS),
        context.granted(Manifest.permission.READ_PHONE_STATE),
        context.granted(if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_IMAGES else Manifest.permission.READ_EXTERNAL_STORAGE),
        Build.VERSION.SDK_INT < 30 || com.pinchdrop.companion.phone.PhoneFiles.allowed(),
        context.granted(Manifest.permission.ACCESS_FINE_LOCATION),
        context.ignoringBatteryOptimizations(),
        AutoOpen.allowed(context),
    )
    return checks.count { it } to checks.size
}

@SuppressLint("BatteryLife") // The user taps "Turn on" on a card that explains exactly why.
@Composable
fun FeaturesScreen(onboarding: Boolean, onDone: () -> Unit, onBack: () -> Unit) {
    val c = Pd.colors
    val context = LocalContext.current
    var resumeTick by remember { mutableIntStateOf(0) }
    LifecycleResumeEffect(Unit) {
        resumeTick++
        onPauseOrDispose { }
    }

    // Basics (normally already allowed during setup).
    val notifPerm = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.POST_NOTIFICATIONS else null
    val nearbyPerm = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.NEARBY_WIFI_DEVICES else null
    val (notif, askNotif) = rememberRuntimePermission(notifPerm, resumeTick)
    val (camera, askCamera) = rememberRuntimePermission(Manifest.permission.CAMERA, resumeTick)
    val (nearby, askNearby) = rememberRuntimePermission(nearbyPerm, resumeTick)
    val notifState = remember(notif, resumeTick) {
        if (notif == PermState.NOT_NEEDED) {
            if (Notifications.canPost(context)) PermState.GRANTED else PermState.BLOCKED
        } else notif
    }

    // Features.
    val notifAccess = remember(resumeTick) { com.pinchdrop.companion.phone.NotifyListener.accessGranted(context) }
    val (sms, askSms) = rememberRuntimePermissions(
        listOf(Manifest.permission.READ_SMS, Manifest.permission.SEND_SMS, Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_CONTACTS),
        resumeTick,
    )
    val (calls, askCalls) = rememberRuntimePermissions(
        listOf(
            Manifest.permission.READ_PHONE_STATE, Manifest.permission.ANSWER_PHONE_CALLS, Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_CALL_LOG, Manifest.permission.READ_CONTACTS,
        ),
        resumeTick,
    )
    val photosPerm = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_IMAGES else Manifest.permission.READ_EXTERNAL_STORAGE
    val (photos, askPhotos) = rememberRuntimePermission(photosPerm, resumeTick)
    val allFiles = remember(resumeTick) { Build.VERSION.SDK_INT < 30 || com.pinchdrop.companion.phone.PhoneFiles.allowed() }
    val (location, askLocation) = rememberRuntimePermissions(
        listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), resumeTick,
    )
    val bgLocPerm = if (Build.VERSION.SDK_INT >= 29) Manifest.permission.ACCESS_BACKGROUND_LOCATION else null
    val (bgLocation, askBgLocation) = rememberRuntimePermission(bgLocPerm, resumeTick)
    val background = remember(resumeTick) { context.ignoringBatteryOptimizations() }
    val autoOpen = remember(resumeTick) { AutoOpen.allowed(context) }

    val pcFeatures = listOf(
        Feature(
            Icons.Filled.NotificationsActive, "Notifications on your PC",
            "See and reply to WhatsApp, Instagram and every app's alerts from your PC.",
            notifAccess, false,
            { runCatching { context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) } },
            note = "Find PinchDrop in the list and switch it on.",
        ),
        Feature(Icons.Filled.Sms, "Messages on your PC", "Read and reply to texts with your keyboard. Codes are copied for you.", sms == PermState.GRANTED, sms == PermState.BLOCKED, askSms),
        Feature(Icons.Filled.Call, "Calls on your PC", "See who's calling; answer with your palm or a click. Talk on the phone.", calls == PermState.GRANTED, calls == PermState.BLOCKED, askCalls),
        Feature(Icons.Filled.PhotoLibrary, "Recent photos on your PC", "Your latest photos on the PC; click one to bring it over.", photos == PermState.GRANTED, photos == PermState.BLOCKED, askPhotos),
        Feature(
            Icons.Filled.Folder, "Browse phone files on your PC", "Open this phone's folders on the PC and drag files in and out.",
            allFiles, false,
            {
                runCatching {
                    context.startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${context.packageName}")))
                }.onFailure { runCatching { context.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)) } }
            },
            note = "Switch on “Allow access to manage all files”.",
        ),
        Feature(
            Icons.Filled.LocationOn, "Find my phone", "See where this phone is on your PC's map if you misplace it.",
            location == PermState.GRANTED, location == PermState.BLOCKED, askLocation,
        ),
    )
    val smoothFeatures = listOf(
        Feature(
            Icons.Filled.BatteryChargingFull, "Always connected", "Stays reachable with the screen off, so the PC shows your battery and calls. Uses very little battery.",
            background, false,
            {
                runCatching {
                    context.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}")))
                }.onFailure { context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
            },
        ),
        Feature(
            Icons.Filled.PanTool, "Instant catch", "Pops up the catch screen the moment you pinch on the PC, even from another app.",
            autoOpen, false, { AutoOpen.requestOverlay(context) },
            note = if (AutoOpen.isXiaomi) "Turn on “Display over other apps”, then in Other permissions “Open new windows while running in the background”." else "Android calls this “Display over other apps”.",
        ),
    )
    val all = pcFeatures + smoothFeatures
    val onCount = all.count { it.on }
    val progress by animateFloatAsState(onCount / all.size.toFloat(), label = "unlocked")

    Column(Modifier.fillMaxSize()) {
        ScreenHeader(title = if (onboarding) "Pick your extras" else "Features", onBack = onBack, eyebrow = if (onboarding) "OPTIONAL" else null)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(c.primary.copy(alpha = 0.08f)).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("$onCount of ${all.size} extras on", color = c.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    if (onCount == all.size) Text("All set ✨", color = c.success, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
                LinearProgressIndicator(
                    progress = { progress }, color = c.primary, trackColor = c.line,
                    modifier = Modifier.fillMaxWidth().height(6.dp).clip(CircleShape),
                )
                Text(
                    "Turn on only what you'll use. Each one stays between this phone and your PC, and you can turn it off any time.",
                    color = c.muted, fontSize = 13.sp, lineHeight = 18.sp,
                )
            }
            Text("Your phone on your PC", color = c.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
            pcFeatures.forEach { FeatureCard(it) }
            if (location == PermState.GRANTED && bgLocPerm != null && bgLocation != PermState.GRANTED) {
                FeatureCard(
                    Feature(
                        Icons.Filled.LocationOn, "Find my phone, even when closed", "Choose “Allow all the time” so the map stays up to date.",
                        false, bgLocation == PermState.BLOCKED, askBgLocation,
                    ),
                )
            }
            Text("Make it smoother", color = c.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
            smoothFeatures.forEach { FeatureCard(it) }
            if (AutoOpen.isXiaomi && autoOpen) {
                SecondaryButton("Xiaomi: allow background windows", onClick = { AutoOpen.requestXiaomiBackgroundWindows(context) }, modifier = Modifier.fillMaxWidth())
            }
            if (!onboarding) {
                Text("Basics", color = c.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
                FeatureCard(Feature(Icons.Filled.Notifications, "Arrival alerts", "Tells you when something arrives from your PC.", notifState == PermState.GRANTED || notifState == PermState.NOT_NEEDED, notifState == PermState.BLOCKED, askNotif))
                if (nearby != PermState.NOT_NEEDED) FeatureCard(Feature(Icons.Filled.Wifi, "Find your PC", "Finds your PC on this Wi-Fi.", nearby == PermState.GRANTED, nearby == PermState.BLOCKED, askNearby))
                FeatureCard(Feature(Icons.Filled.CameraAlt, "Catch with your hand", "Sees your open hand to catch, and scans the pairing QR. Nothing is recorded.", camera == PermState.GRANTED, camera == PermState.BLOCKED, askCamera))
            }
        }
        PrimaryButton(if (onboarding) "Continue" else "Done", onClick = onDone, modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = if (onboarding) 0.dp else 20.dp))
        if (onboarding) {
            TextButton(onClick = onDone, modifier = Modifier.align(Alignment.CenterHorizontally).padding(bottom = 8.dp)) {
                Text("Skip for now", color = c.muted)
            }
        }
    }
}

@Composable
private fun FeatureCard(f: Feature) {
    val c = Pd.colors
    val context = LocalContext.current
    val border by animateColorAsState(if (f.on) c.success.copy(alpha = 0.55f) else c.line, label = "border")
    val action = { if (f.blocked) context.openAppSettings() else f.turnOn() }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(c.surface)
            .border(1.dp, border, RoundedCornerShape(18.dp))
            .clickable(enabled = !f.on, role = Role.Switch, onClickLabel = "Turn on", onClick = action)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            Modifier.size(44.dp).clip(RoundedCornerShape(13.dp)).background(if (f.on) c.success.copy(alpha = 0.12f) else c.surface2),
            contentAlignment = Alignment.Center,
        ) { Icon(f.icon, contentDescription = null, tint = if (f.on) c.success else c.accent) }
        Column(Modifier.weight(1f)) {
            Text(f.title, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text(f.body, color = c.muted, fontSize = 13.sp, lineHeight = 18.sp)
            if (f.blocked) Text("Turned off in Android settings. Tap to open them.", color = c.warn, fontSize = 12.sp)
            else if (!f.on && f.note != null) Text(f.note, color = c.soft, fontSize = 12.sp, lineHeight = 16.sp)
        }
        Switchy(f.on)
    }
}

/** A switch look (the whole card is the button). */
@Composable
private fun Switchy(on: Boolean) {
    val c = Pd.colors
    val x by animateFloatAsState(if (on) 1f else 0f, label = "knob")
    Box(
        Modifier.width(46.dp).height(28.dp).clip(CircleShape).background(if (on) c.success else c.line).padding(3.dp),
    ) {
        Box(
            Modifier.offset(x = (18 * x).dp).size(22.dp).clip(CircleShape).background(Color.White),
            contentAlignment = Alignment.Center,
        ) { if (on) Icon(Icons.Filled.Check, contentDescription = null, tint = c.success, modifier = Modifier.size(14.dp)) }
    }
}

/** Home card: invites to turn on more, while some are still off. */
@Composable
fun ExtrasCard(onOpen: () -> Unit) {
    val c = Pd.colors
    val context = LocalContext.current
    var tick by remember { mutableIntStateOf(0) }
    LifecycleResumeEffect(Unit) {
        tick++
        onPauseOrDispose { }
    }
    val (on, total) = remember(tick) { featuresOn(context) }
    if (on >= total) return
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(c.primary.copy(alpha = 0.08f))
            .clickable(role = Role.Button, onClick = onOpen).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(c.primary), contentAlignment = Alignment.Center) {
            Text("$on/$total", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        }
        Column(Modifier.weight(1f)) {
            Text("Make more of PinchDrop", color = c.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
            Text("Messages, calls and photos on your PC. Pick the ones you want.", color = c.muted, fontSize = 13.sp, lineHeight = 18.sp)
        }
        Spacer(Modifier.width(2.dp))
    }
}
