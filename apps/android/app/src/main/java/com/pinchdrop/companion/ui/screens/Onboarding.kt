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
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material.icons.filled.Contacts
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.PhotoLibrary
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

// ---------- Permissions ----------

internal fun Context.findActivity(): Activity? {
    var ctx: Context? = this
    while (ctx is ContextWrapper) {
        if (ctx is Activity) return ctx
        ctx = ctx.baseContext
    }
    return null
}

internal fun Context.granted(permission: String) =
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
internal fun rememberRuntimePermission(permission: String?, refreshKey: Int): Pair<PermState, () -> Unit> {
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

/** Several runtime permissions asked together (e.g. read + send + receive SMS). GRANTED only when all are. */
@Composable
internal fun rememberRuntimePermissions(permissions: List<String>, refreshKey: Int): Pair<PermState, () -> Unit> {
    val context = LocalContext.current
    var asked by remember { mutableStateOf(false) }
    var tick by remember { mutableIntStateOf(0) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { asked = true; tick++ }
    val state = remember(permissions, refreshKey, tick) {
        val missing = permissions.filterNot { context.granted(it) }
        when {
            missing.isEmpty() -> PermState.GRANTED
            asked && missing.none { context.findActivity()?.shouldShowRequestPermissionRationale(it) == true } -> PermState.BLOCKED
            else -> PermState.ASK
        }
    }
    val request: () -> Unit = {
        when (state) {
            PermState.ASK -> launcher.launch(permissions.toTypedArray())
            PermState.BLOCKED -> context.openAppSettings()
            else -> Unit
        }
    }
    return state to request
}

