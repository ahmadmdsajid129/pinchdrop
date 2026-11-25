package com.pinchdrop.companion.ui.screens

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
private fun Context.animationsOff(): Boolean =
    Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

/** A short two-note chime from the system tone generator — no bundled audio needed. */
private fun chime() {
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
fun CatchScreen(pcName: String, onAccept: () -> Unit, onDecline: () -> Unit) {
    val c = Pd.colors
    val context = LocalContext.current
    val total = 30
    var left by remember { mutableIntStateOf(total) }
    LaunchedEffect(Unit) {
        Notifications.cancelIncomingDemo(context)
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
                Icon(Icons.Filled.Folder, contentDescription = null, tint = c.accent)
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(DemoItem.FOLDER, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        DemoTag()
                    }
                    Text("from $pcName · ${DemoItem.FILES} files · ${DemoItem.MB} MB", color = Color(0xFFC7CEEA), fontSize = 13.sp)
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

@Composable
fun ReceivingScreen(pcName: String, onDone: () -> Unit, onHide: () -> Unit, onCancel: () -> Unit) {
    val c = Pd.colors
    val context = LocalContext.current
    val still = remember { context.animationsOff() }
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        Notifications.cancelIncomingDemo(context)
        progress.animateTo(1f, tween(if (still) 1500 else 5200, easing = LinearEasing))
        delay(250)
        onDone()
    }
    val fall = rememberInfiniteTransition(label = "fall")
    val t by fall.animateFloat(0f, 1f, infiniteRepeatable(tween(1300, easing = FastOutSlowInEasing)), label = "t")
    val breath by fall.animateFloat(1f, 1.06f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "breath")

    val p = progress.value
    val pct = (p * 100).toInt()
    val filesDone = (p * DemoItem.FILES).toInt().coerceAtMost(DemoItem.FILES)
    val mbDone = (p * DemoItem.MB).toInt()

    Column(Modifier.fillMaxSize().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("from $pcName", color = c.muted, fontSize = 14.sp)
            DemoTag()
        }
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            Box(Modifier.size(230.dp).graphicsLayer { scaleX = if (still) 1f else breath; scaleY = scaleX }, contentAlignment = Alignment.Center) {
                Canvas(Modifier.fillMaxSize()) {
                    val sw = 12.dp.toPx()
                    drawCircle(c.surface2, style = Stroke(sw))
                    drawArc(
                        Brush.sweepGradient(listOf(c.primary, c.accent, c.primary)),
                        -90f, 360f * p, false, style = Stroke(sw, cap = StrokeCap.Round),
                        topLeft = Offset(sw / 2, sw / 2), size = Size(size.width - sw, size.height - sw),
                    )
                }
                Text("$pct%", color = c.text, fontSize = 40.sp, fontWeight = FontWeight.Bold)
            }
            if (!still && p < 1f) {
                // A file card falling into the ring, over and over.
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
        Text("Receiving “${DemoItem.FOLDER}”", color = c.text, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "$filesDone of ${DemoItem.FILES} files · $mbDone / ${DemoItem.MB} MB · 21 MB/s",
            color = c.muted, fontSize = 14.sp,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        Spacer(Modifier.height(20.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SecondaryButton("Hide (keeps going)", onClick = onHide, modifier = Modifier.weight(1f))
            SecondaryButton("Cancel", onClick = onCancel, modifier = Modifier.weight(1f), danger = true)
        }
    }
}

// ---------- Photo arrived ----------

/**
 * Sequence (design M-Arrived): drops from the top, blurred → lands with a bounce + haptic tap →
 * sharpens and grows → green check pops → chime. Honours the Arrival animation / sound / vibrate settings
 * and Android's "remove animations".
 */
@Composable
fun ArrivedScreen(settings: AppSettings, pcName: String, onClose: () -> Unit) {
    val c = Pd.colors
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val animate = settings.arrivalAnimation && !remember { context.animationsOff() }
    var run by remember { mutableIntStateOf(0) }

    val y = remember { Animatable(0f) }      // dp offset
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
        // 1. Fall in, blurred.
        launch { scale.animateTo(0.55f, tween(500)) }
        y.animateTo(0f, tween(520, easing = FastOutSlowInEasing))
        // 2. Land: squash, tap, small bounce.
        if (settings.vibrate) haptics.performHapticFeedback(HapticFeedbackType.Confirm)
        squash.animateTo(0.82f, tween(90))
        launch { squash.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy)) }
        y.animateTo(-14f, tween(120)); y.animateTo(0f, spring(dampingRatio = Spring.DampingRatioMediumBouncy))
        // 3. Sharpen and grow.
        launch { blur.animateTo(0f, tween(420)) }
        scale.animateTo(1f, spring(dampingRatio = 0.7f, stiffness = Spring.StiffnessLow))
        // 4. Check pops + glow + chime, then the text slides up.
        launch {
            glowAlpha = 0.8f
            glow.snapTo(0.6f); glow.animateTo(1.4f, tween(700))
            glowAlpha = 0f
        }
        if (settings.arrivalSound) chime()
        badge.animateTo(1f, spring(dampingRatio = 0.4f, stiffness = Spring.StiffnessMedium))
        text.animateTo(1f, tween(320, easing = FastOutSlowInEasing))
    }
    Column(Modifier.fillMaxSize().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DemoTag()
            Text("Preview of what you'll see when a photo lands", color = c.muted, fontSize = 13.sp)
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
                DemoPhoto(Modifier.size(260.dp, 300.dp).blur(blur.value.dp))
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
            Text("trip.jpg arrived", color = c.text, fontSize = 24.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            Spacer(Modifier.height(4.dp))
            Text("From $pcName · 4.2 MB · saved to Gallery › PinchDrop", color = c.muted, fontSize = 14.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(6.dp))
            Text("Demo — nothing was actually saved.", color = c.warn, fontSize = 13.sp)
        }
        Spacer(Modifier.height(18.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SecondaryButton("Replay", onClick = { run++ }, modifier = Modifier.weight(1f))
            PrimaryButton("Done", onClick = onClose, modifier = Modifier.weight(1f))
        }
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
