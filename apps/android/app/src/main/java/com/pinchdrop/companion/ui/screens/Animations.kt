package com.pinchdrop.companion.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.material.icons.automirrored.filled.Notes
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Image
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.layout.ContentScale
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pinchdrop.companion.data.ItemKind
import com.pinchdrop.companion.data.formatBytes
import com.pinchdrop.companion.transfer.Receiver
import com.pinchdrop.companion.ui.isLink
import com.pinchdrop.companion.ui.loadThumbnail
import com.pinchdrop.companion.ui.openUri
import com.pinchdrop.companion.ui.shareUri
import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pinchdrop.companion.Notifications
import com.pinchdrop.companion.data.AppSettings
import com.pinchdrop.companion.ui.DemoTag
import com.pinchdrop.companion.ui.PhaseBadge
import com.pinchdrop.companion.ui.PrimaryButton
import com.pinchdrop.companion.ui.SecondaryButton
import com.pinchdrop.companion.ui.theme.Pd
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** True when the user turned animations off in Android's accessibility / developer settings. */
internal fun Context.animationsOff(): Boolean =
    Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

/** A short two-note chime from the system tone generator — no bundled audio needed. */
internal fun chime() {
    runCatching {
        val tg = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70)
        tg.startTone(ToneGenerator.TONE_PROP_ACK, 220)
        Thread { Thread.sleep(400); tg.release() }.start()
    }
}

/** The demo payload used by every preview screen. */
private object DemoItem {
    const val FOLDER = "CPP"
    const val FILES = 12
    const val MB = 48
}

// ---------- Catch ----------

@Composable
fun CatchScreen(pcName: String, onAccept: () -> Unit, onDecline: () -> Unit, hold: Receiver.Hold? = null) {
    val c = Pd.colors
    val context = LocalContext.current
    val total = hold?.totalSecs ?: 30
    var left by remember(hold?.id) { mutableIntStateOf(hold?.secondsLeft() ?: total) }
    LaunchedEffect(hold?.id) {
        if (hold == null) Notifications.cancelIncomingDemo(context) else Notifications.cancelHold(context)
        while (left > 0) {
            delay(1000); left--
        }
        onDecline()
    }
    val still = remember { context.animationsOff() }
    val pulse = rememberInfiniteTransition(label = "pulse")
    val ring by pulse.animateFloat(0f, 1f, infiniteRepeatable(tween(1600, easing = LinearEasing)), label = "ring")
    val hover by pulse.animateFloat(0f, 1f, infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "hover")

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF0B1020), Color(0xFF1A1440))))) {
        Column(Modifier.fillMaxSize().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.08f)).padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(
                    if (hold == null || hold.isFolder) Icons.Filled.Folder else Icons.AutoMirrored.Filled.InsertDriveFile,
                    contentDescription = null, tint = c.accent,
                )
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(hold?.label ?: DemoItem.FOLDER, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        if (hold == null) DemoTag()
                    }
                    Text(
                        if (hold == null) "from $pcName · ${DemoItem.FILES} files · ${DemoItem.MB} MB"
                        else "from ${hold.pcName} · ${hold.fileCount} file${if (hold.fileCount == 1L) "" else "s"} · ${formatBytes(hold.totalBytes)}",
                        color = Color(0xFFC7CEEA), fontSize = 13.sp,
                    )
                }
                Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
                    Canvas(Modifier.size(44.dp)) {
                        drawCircle(Color.White.copy(alpha = 0.15f), style = Stroke(4.dp.toPx()))
                        drawArc(c.accent, -90f, 360f * left / total, false, style = Stroke(4.dp.toPx(), cap = StrokeCap.Round))
                    }
                    Text("$left", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.semantics { contentDescription = "$left seconds left" })
                }
            }

            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                if (!still) {
                    Canvas(Modifier.size(260.dp)) {
                        listOf(0f, 0.5f).forEach { offset ->
                            val t = (ring + offset) % 1f
                            drawCircle(c.primary.copy(alpha = (1f - t) * 0.6f), radius = size.minDimension / 2 * (0.45f + 0.55f * t), style = Stroke(3.dp.toPx()))
                        }
                    }
                }
                Box(
                    Modifier.graphicsLayer { translationY = if (still) 0f else -8.dp.toPx() * hover }
                        .size(120.dp).clip(CircleShape).background(c.primary.copy(alpha = 0.25f)),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.PanTool, contentDescription = null, tint = Color.White, modifier = Modifier.size(56.dp)) }
            }

            Text("Open your hand over the phone", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
            Spacer(Modifier.height(6.dp))
            Text("Hold it 10–30 cm above the screen, then spread your fingers.", color = Color(0xFFC7CEEA), fontSize = 15.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Hand detection:", color = Color(0xFF8B94B8), fontSize = 13.sp)
                PhaseBadge(6)
            }
            Spacer(Modifier.height(20.dp))
            PrimaryButton("Accept without gesture", onClick = onAccept, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
            SecondaryButton("Decline", onClick = onDecline, modifier = Modifier.fillMaxWidth())
        }
    }
}

// ---------- Receiving ----------

/** What the Receiving screen draws; shared by the real transfer and the demo preview. */
data class ReceivingInfo(
    val label: String,
    val pcName: String,
    val fraction: Float,
    val filesDone: Int,
    val fileCount: Int,
    val bytesDone: Long,
    val totalBytes: Long,
    val bytesPerSec: Long,
    val paused: Boolean,
    val isDemo: Boolean,
)

/** Demo preview: a pretend folder fills up over ~5 s, then the Arrived preview plays. */
@Composable
fun ReceivingScreen(pcName: String, onDone: () -> Unit, onHide: () -> Unit, onCancel: () -> Unit) {
    val context = LocalContext.current
    val still = remember { context.animationsOff() }
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        Notifications.cancelIncomingDemo(context)
        progress.animateTo(1f, tween(if (still) 1500 else 5200, easing = LinearEasing))
        delay(250)
        onDone()
    }
    val p = progress.value
    val total = DemoItem.MB * 1024L * 1024L
    ReceivingView(
        ReceivingInfo(
            DemoItem.FOLDER, pcName, p, (p * DemoItem.FILES).toInt().coerceAtMost(DemoItem.FILES), DemoItem.FILES,
            (p * total).toLong(), total, 21L * 1024 * 1024, paused = false, isDemo = true,
        ),
        onHide, onCancel,
    )
}

/** The real thing: progress of the transfer that's arriving now. */
@Composable
fun LiveReceivingScreen(onHide: () -> Unit, onCancel: () -> Unit) {
    val p by Receiver.progress.collectAsStateWithLifecycle()
    val cur = p
    if (cur == null) {
        // Nothing arriving (finished or cancelled) — go back.
        LaunchedEffect(Unit) { onHide() }
        return
    }
    ReceivingView(
        ReceivingInfo(
            cur.label, cur.pcName,
            if (cur.totalBytes > 0) cur.bytesDone.toFloat() / cur.totalBytes else 0f,
            cur.filesDone, cur.fileCount, cur.bytesDone, cur.totalBytes, cur.bytesPerSec, cur.paused, isDemo = false,
        ),
        onHide, onCancel,
    )
}

@Composable
fun ReceivingView(info: ReceivingInfo, onHide: () -> Unit, onCancel: () -> Unit) {
    val c = Pd.colors
    val context = LocalContext.current
    val still = remember { context.animationsOff() }
    val fall = rememberInfiniteTransition(label = "fall")
    val t by fall.animateFloat(0f, 1f, infiniteRepeatable(tween(1300, easing = FastOutSlowInEasing)), label = "t")
    val breath by fall.animateFloat(1f, 1.06f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "breath")
    val p = info.fraction.coerceIn(0f, 1f)
    val pct = (p * 100).toInt()
    var confirmCancel by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("from ${info.pcName}", color = c.muted, fontSize = 14.sp)
            if (info.isDemo) DemoTag()
        }
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            Box(
                Modifier.size(230.dp).graphicsLayer { val s = if (still || info.paused) 1f else breath; scaleX = s; scaleY = s },
                contentAlignment = Alignment.Center,
            ) {
                Canvas(Modifier.fillMaxSize()) {
                    val sw = 12.dp.toPx()
                    drawCircle(c.surface2, style = Stroke(sw))
                    drawArc(
                        if (info.paused) Brush.linearGradient(listOf(c.warn, c.warn)) else Brush.sweepGradient(listOf(c.primary, c.accent, c.primary)),
                        -90f, 360f * p, false, style = Stroke(sw, cap = StrokeCap.Round),
                        topLeft = Offset(sw / 2, sw / 2), size = Size(size.width - sw, size.height - sw),
                    )
                }
                Text("$pct%", color = c.text, fontSize = 40.sp, fontWeight = FontWeight.Bold)
            }
            if (!still && !info.paused && p < 1f) {
                Icon(
                    Icons.AutoMirrored.Filled.InsertDriveFile, contentDescription = null, tint = c.accent,
                    modifier = Modifier.size(40.dp).graphicsLayer {
                        translationY = (-260f + 260f * t).dp.toPx()
                        rotationZ = -12f * (1f - t)
                        val s = if (t < 0.85f) 0.6f + 0.3f * (t / 0.85f) else 0.9f - 0.6f * ((t - 0.85f) / 0.15f)
                        scaleX = s; scaleY = s
                        alpha = when {
                            t < 0.25f -> t / 0.25f
                            t > 0.85f -> 1f - (t - 0.85f) / 0.15f
                            else -> 1f
                        }
                    },
                )
            }
        }
        Text("Receiving “${info.label}”", color = c.text, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        Text(
            if (info.paused) "Paused — resumes when ${info.pcName} is back on this Wi-Fi"
            else "${info.filesDone} of ${info.fileCount} files · ${formatBytes(info.bytesDone)} / ${formatBytes(info.totalBytes)}" +
                if (info.bytesPerSec > 0) " · ${formatBytes(info.bytesPerSec)}/s" else "",
            color = if (info.paused) c.warn else c.muted, fontSize = 14.sp, textAlign = TextAlign.Center,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        Spacer(Modifier.height(20.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SecondaryButton("Hide (keeps going)", onClick = onHide, modifier = Modifier.weight(1f))
            SecondaryButton("Cancel", onClick = { if (info.isDemo) onCancel() else confirmCancel = true }, modifier = Modifier.weight(1f), danger = true)
        }
    }
    if (confirmCancel) {
        AlertDialog(
            onDismissRequest = { confirmCancel = false },
            title = { Text("Stop receiving?") },
            text = { Text("Files that already arrived stay on this phone. The one in progress is removed.") },
            confirmButton = { TextButton(onClick = { confirmCancel = false; onCancel() }) { Text("Stop", color = c.danger) } },
            dismissButton = { TextButton(onClick = { confirmCancel = false }) { Text("Keep going") } },
            containerColor = c.surface, titleContentColor = c.text, textContentColor = c.soft,
        )
    }
}

// ---------- Arrived ----------

/**
 * Sequence (design M-Arrived): drops from the top, blurred → lands with a bounce + haptic tap →
 * sharpens and grows → green check pops → chime. Honours the Arrival animation / sound / vibrate settings
 * and Android's "remove animations". [arrived] null = the demo preview.
 */
@Composable
fun ArrivedScreen(settings: AppSettings, pcName: String, onClose: () -> Unit, arrived: Receiver.Arrived? = null) {
    val c = Pd.colors
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val animate = settings.arrivalAnimation && !remember { context.animationsOff() }
    var run by remember { mutableIntStateOf(0) }
    val isDemo = arrived == null
    val thumb = remember(arrived?.uri) { arrived?.takeIf { it.kind == ItemKind.PHOTO }?.uri?.let { loadThumbnail(context, it) } }

    val y = remember { Animatable(0f) }
    val scale = remember { Animatable(1f) }
    val squash = remember { Animatable(1f) }
    val blur = remember { Animatable(0f) }
    val badge = remember { Animatable(1f) }
    val text = remember { Animatable(1f) }
    val glow = remember { Animatable(0f) }
    var glowAlpha by remember { mutableFloatStateOf(0f) }

    LaunchedEffect(run) {
        if (!animate) {
            y.snapTo(0f); scale.snapTo(1f); squash.snapTo(1f); blur.snapTo(0f); badge.snapTo(1f); text.snapTo(1f)
            if (settings.vibrate) haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            if (settings.arrivalSound) chime()
            return@LaunchedEffect
        }
        y.snapTo(-520f); scale.snapTo(0.45f); squash.snapTo(1f); blur.snapTo(8f); badge.snapTo(0f); text.snapTo(0f); glowAlpha = 0f
        launch { scale.animateTo(0.55f, tween(500)) }
        y.animateTo(0f, tween(520, easing = FastOutSlowInEasing))
        if (settings.vibrate) haptics.performHapticFeedback(HapticFeedbackType.Confirm)
        squash.animateTo(0.82f, tween(90))
        launch { squash.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy)) }
        y.animateTo(-14f, tween(120)); y.animateTo(0f, spring(dampingRatio = Spring.DampingRatioMediumBouncy))
        launch { blur.animateTo(0f, tween(420)) }
        scale.animateTo(1f, spring(dampingRatio = 0.7f, stiffness = Spring.StiffnessLow))
        launch {
            glowAlpha = 0.8f
            glow.snapTo(0.6f); glow.animateTo(1.4f, tween(700))
            glowAlpha = 0f
        }
        if (settings.arrivalSound) chime()
        badge.animateTo(1f, spring(dampingRatio = 0.4f, stiffness = Spring.StiffnessMedium))
        text.animateTo(1f, tween(320, easing = FastOutSlowInEasing))
        if (arrived?.openFirst == true && arrived.uri != null) openUri(context, arrived.uri)
    }

    val title = when {
        arrived == null -> "trip.jpg arrived"
        arrived.kind == ItemKind.TEXT -> "${arrived.name} from ${arrived.pcName}"
        else -> "${arrived.name} arrived"
    }
    val subtitle = when {
        arrived == null -> "From $pcName · 4.2 MB · saved to Gallery › PinchDrop"
        arrived.kind == ItemKind.TEXT -> "Copied to the clipboard"
        arrived.fileCount > 1 -> "From ${arrived.pcName} · ${arrived.fileCount} files · ${formatBytes(arrived.size)} · ${arrived.location}"
        else -> "From ${arrived.pcName} · ${formatBytes(arrived.size)} · saved to ${arrived.location}"
    }

    Column(Modifier.fillMaxSize().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        if (isDemo) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DemoTag()
                Text("Preview of what you'll see when a photo lands", color = c.muted, fontSize = 13.sp)
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            Box(
                Modifier.size(300.dp).graphicsLayer { scaleX = glow.value; scaleY = glow.value; alpha = glowAlpha }
                    .clip(CircleShape).background(Brush.radialGradient(listOf(c.success.copy(alpha = 0.5f), Color.Transparent))),
            )
            Box(
                Modifier.graphicsLayer {
                    translationY = y.value.dp.toPx()
                    scaleX = scale.value * (2f - squash.value)
                    scaleY = scale.value * squash.value
                    transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0.5f, 1f)
                },
            ) {
                val m = Modifier.size(260.dp, 300.dp).blur(blur.value.dp)
                when {
                    isDemo -> DemoPhoto(m)
                    thumb != null -> Image(
                        thumb, contentDescription = arrived?.name, contentScale = ContentScale.Crop,
                        modifier = m.clip(RoundedCornerShape(22.dp)),
                    )
                    else -> KindCard(arrived!!, m)
                }
                Box(
                    Modifier.align(Alignment.BottomEnd).padding(10.dp).size(44.dp)
                        .graphicsLayer { scaleX = badge.value; scaleY = badge.value }
                        .clip(CircleShape).background(c.success),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White) }
            }
        }
        Column(
            Modifier.graphicsLayer { translationY = (24f * (1f - text.value)).dp.toPx(); alpha = text.value },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(title, color = c.text, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            Spacer(Modifier.height(4.dp))
            Text(subtitle, color = c.muted, fontSize = 14.sp, textAlign = TextAlign.Center)
            if (isDemo) {
                Spacer(Modifier.height(6.dp))
                Text("Demo — nothing was actually saved.", color = c.warn, fontSize = 13.sp)
            }
        }
        Spacer(Modifier.height(18.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            when {
                isDemo -> SecondaryButton("Replay", onClick = { run++ }, modifier = Modifier.weight(1f))
                arrived?.uri != null && arrived.fileCount <= 1 -> {
                    SecondaryButton("Open", onClick = { openUri(context, arrived.uri) }, modifier = Modifier.weight(1f))
                    SecondaryButton("Share", onClick = { shareUri(context, arrived.uri) }, modifier = Modifier.weight(1f))
                }
                arrived?.text != null && isLink(arrived.text) ->
                    SecondaryButton("Open link", onClick = { openUri(context, arrived.text.trim()) }, modifier = Modifier.weight(1f))
            }
            PrimaryButton("Done", onClick = onClose, modifier = Modifier.weight(1f))
        }
    }
}

/** Big icon card for things that aren't photos (folders, files, notes). */
@Composable
private fun KindCard(a: Receiver.Arrived, modifier: Modifier) {
    val c = Pd.colors
    val icon = when (a.kind) {
        ItemKind.FOLDER -> Icons.Filled.Folder
        ItemKind.TEXT -> Icons.AutoMirrored.Filled.Notes
        ItemKind.VIDEO -> Icons.Filled.Movie
        ItemKind.PHOTO -> Icons.Filled.Image
        ItemKind.FILE -> Icons.AutoMirrored.Filled.InsertDriveFile
    }
    Box(modifier.clip(RoundedCornerShape(22.dp)).background(Brush.linearGradient(listOf(c.primary, c.accent))), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(96.dp))
    }
}

/** A drawn stand-in for the received photo (a sunset over hills), so the demo needs no bundled image. */
@Composable
private fun DemoPhoto(modifier: Modifier) {
    Box(modifier.clip(RoundedCornerShape(22.dp)).semantics { contentDescription = "Demo photo of a sunset" }) {
        Canvas(Modifier.fillMaxSize()) {
            drawRect(Brush.verticalGradient(listOf(Color(0xFF3B2A8F), Color(0xFFE0607E), Color(0xFFFFB86B))))
            drawCircle(Color(0xFFFFE3A3), radius = size.width * 0.13f, center = Offset(size.width * 0.68f, size.height * 0.52f))
            val back = Path().apply {
                moveTo(0f, size.height * 0.7f)
                quadraticTo(size.width * 0.3f, size.height * 0.5f, size.width * 0.6f, size.height * 0.68f)
                quadraticTo(size.width * 0.85f, size.height * 0.8f, size.width, size.height * 0.62f)
                lineTo(size.width, size.height); lineTo(0f, size.height); close()
            }
            drawPath(back, Color(0xFF2A1E5C))
            val front = Path().apply {
                moveTo(0f, size.height * 0.85f)
                quadraticTo(size.width * 0.45f, size.height * 0.7f, size.width, size.height * 0.88f)
                lineTo(size.width, size.height); lineTo(0f, size.height); close()
            }
            drawPath(front, Color(0xFF151033))
        }
    }
}
