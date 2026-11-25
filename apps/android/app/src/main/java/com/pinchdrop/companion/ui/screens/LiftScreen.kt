package com.pinchdrop.companion.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.automirrored.filled.Notes
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.PanTool
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pinchdrop.companion.data.AppSettings
import com.pinchdrop.companion.data.ItemKind
import com.pinchdrop.companion.data.formatBytes
import com.pinchdrop.companion.transfer.Lifter
import com.pinchdrop.companion.ui.PrimaryButton
import com.pinchdrop.companion.ui.SecondaryButton
import com.pinchdrop.companion.ui.rememberThumbnail
import com.pinchdrop.companion.ui.theme.Pd
import com.pinchdrop.companion.vision.CatchCamera
import com.pinchdrop.companion.vision.CatchCameraError
import com.pinchdrop.companion.vision.LiftDetector
import com.pinchdrop.companion.vision.LiftHint
import kotlinx.coroutines.delay

/**
 * v2 · Lift: something shared into PinchDrop. Pinch in front of the phone to lift it into the
 * air, then open your hand at the laptop's webcam to drop it there.
 */
@Composable
fun LiftScreen(settings: AppSettings, pcName: String?, onClose: () -> Unit) {
    val c = Pd.colors
    val state by Lifter.state.collectAsStateWithLifecycle()

    Column(Modifier.fillMaxSize().background(c.bg).statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { Lifter.cancel(); onClose() }) {
                Icon(Icons.Filled.Close, contentDescription = "Close", tint = c.text)
            }
            Text("Send to ${pcName ?: "your PC"}", color = c.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        }
        AnimatedContent(
            targetState = state,
            contentKey = { it::class },
            transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(120)) },
            label = "lift",
            modifier = Modifier.weight(1f),
        ) { s ->
            when (s) {
                Lifter.State.Idle, Lifter.State.Preparing -> Centered { Text("Getting it ready…", color = c.muted, fontSize = 15.sp) }
                is Lifter.State.Ready -> ReadyBody(s, settings, pcName)
                is Lifter.State.InAir -> InAirBody(s, pcName)
                is Lifter.State.Sending -> SendingBody(s, pcName)
                is Lifter.State.Done -> DoneBody(s.item, pcName, onClose)
                is Lifter.State.Failed -> Centered {
                    Text(s.message, color = c.text, fontSize = 16.sp, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(18.dp))
                    if (s.item != null) PrimaryButton("Try again", onClick = { Lifter.lift() }, modifier = Modifier.fillMaxWidth())
                    SecondaryButton("Close", onClick = { Lifter.reset(); onClose() }, modifier = Modifier.fillMaxWidth().padding(top = 10.dp))
                }
            }
        }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().padding(28.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        content()
    }
}

/** The thing being sent, in its own look: the photo / video frame, or a tile for its kind. */
@Composable
private fun ItemCard(item: Lifter.Item, modifier: Modifier = Modifier, big: Boolean = true) {
    val c = Pd.colors
    val thumb = rememberThumbnail(item.thumbUri, 720)
    val w = if (big) 220.dp else 120.dp
    Column(
        modifier.shadow(18.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp)).background(c.surface).padding(10.dp).width(w),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (thumb != null) {
            Image(thumb, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().height(w * 0.72f).clip(RoundedCornerShape(16.dp)))
        } else {
            val (icon, tint) = when (item.kind) {
                ItemKind.FOLDER -> Icons.Filled.Folder to Color(0xFF2F8EF5)
                ItemKind.VIDEO -> Icons.Filled.Movie to Color(0xFFAF52DE)
                ItemKind.TEXT -> (if (item.texts.firstOrNull()?.startsWith("http") == true) Icons.Filled.Link else Icons.AutoMirrored.Filled.Notes) to Color(0xFF007AFF)
                else -> Icons.AutoMirrored.Filled.InsertDriveFile to Color(0xFF8E8E93)
            }
            Box(Modifier.fillMaxWidth().height(w * 0.72f).clip(RoundedCornerShape(16.dp)).background(tint.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(if (big) 64.dp else 36.dp))
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(item.label, color = c.text, fontSize = if (big) 15.sp else 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
            when {
                item.files.isEmpty() -> item.texts.firstOrNull()?.take(60) ?: ""
                item.files.size == 1 -> formatBytes(item.totalBytes)
                else -> "${item.files.size} files · ${formatBytes(item.totalBytes)}"
            },
            color = c.muted, fontSize = if (big) 12.sp else 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun ReadyBody(s: Lifter.State.Ready, settings: AppSettings, pcName: String?) {
    val c = Pd.colors
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    var cameraOk by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val askCamera = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { cameraOk = it }
    val detector = remember(settings.handDetection) { LiftDetector(LiftDetector.configFor(settings.handDetection)) }
    var hint by remember { mutableStateOf(LiftHint.LOOKING) }
    var progress by remember { mutableStateOf(0f) }
    var cameraError by remember { mutableStateOf<CatchCameraError?>(null) }
    val connected = Lifter.connected
    val useHand = settings.catchWithHand && cameraOk && cameraError == null && connected

    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(8.dp))
        ItemCard(s.item)
        Spacer(Modifier.height(20.dp))
        if (useHand) {
            Box(Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(28.dp)).background(Color.Black)) {
                CatchCamera(
                    modifier = Modifier.fillMaxSize().graphicsLayer { alpha = 0.55f },
                    onFrame = { f ->
                        if (detector.step(f?.t ?: android.os.SystemClock.uptimeMillis(), f)) {
                            if (settings.vibrate) haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                            Lifter.lift()
                        }
                        hint = detector.hint
                        progress = detector.progress
                    },
                    onError = { cameraError = it },
                )
                Column(Modifier.align(Alignment.Center).padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(contentAlignment = Alignment.Center) {
                        Canvas(Modifier.size(84.dp)) {
                            drawCircle(Color.White.copy(alpha = 0.25f), style = Stroke(6.dp.toPx()))
                            if (progress > 0f) drawArc(Color(0xFF30D158), -90f, 360f * progress, false, style = Stroke(6.dp.toPx(), cap = StrokeCap.Round))
                        }
                        Icon(Icons.Filled.PanTool, contentDescription = null, tint = Color.White, modifier = Modifier.size(34.dp))
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        when (hint) {
                            LiftHint.LOOKING -> "Show your open hand to the camera"
                            LiftHint.TOO_FAR -> "Bring your hand a little closer"
                            LiftHint.OPEN_SEEN -> "Now pinch to lift it"
                            LiftHint.PINCHING -> "Hold the pinch…"
                            LiftHint.LIFTED -> "Lifted!"
                        },
                        color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                    )
                }
            }
        } else {
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                Text(
                    when {
                        !connected -> "Your PC isn't connected. Open PinchDrop on the PC (same Wi-Fi)."
                        !cameraOk && settings.catchWithHand -> "Allow the camera to lift with a pinch, or send it straight away."
                        cameraError != null -> "The camera isn't available right now. You can still send it."
                        else -> "Send it to ${pcName ?: "your PC"}, then catch it there with an open hand."
                    },
                    color = c.muted, fontSize = 15.sp, textAlign = TextAlign.Center,
                )
            }
        }
        s.note?.let { Text(it, color = c.warn, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 10.dp)) }
        Spacer(Modifier.height(12.dp))
        if (!cameraOk && settings.catchWithHand) {
            PrimaryButton("Allow camera", onClick = { askCamera.launch(Manifest.permission.CAMERA) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SecondaryButton("Lift without gesture", onClick = { Lifter.lift() }, modifier = Modifier.weight(1f))
            SecondaryButton("Send now", onClick = { Lifter.lift(sendNow = true) }, modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun InAirBody(s: Lifter.State.InAir, pcName: String?) {
    val c = Pd.colors
    var left by remember(s.id) { mutableIntStateOf(((s.expiresAtMs - System.currentTimeMillis()) / 1000).toInt().coerceAtLeast(0)) }
    LaunchedEffect(s.id) {
        while (left > 0) { delay(1000); left-- }
    }
    // Rises off the screen, then floats there.
    val rise = remember(s.id) { Animatable(0f) }
    LaunchedEffect(s.id) { rise.animateTo(1f, spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessLow)) }
    val bob by rememberInfiniteTransition(label = "bob").animateFloat(-6f, 6f, infiniteRepeatable(tween(1300, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "y")

    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        ItemCard(
            s.item,
            Modifier.graphicsLayer {
                translationY = (1f - rise.value) * 220f + bob * rise.value
                scaleX = 0.8f + 0.2f * rise.value
                scaleY = scaleX
                rotationZ = (1f - rise.value) * -6f
            },
        )
        Spacer(Modifier.height(34.dp))
        Text("It's in the air", color = c.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text(
            "Open your hand at ${pcName ?: "your laptop"}'s camera to catch it",
            color = c.muted, fontSize = 15.sp, textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(18.dp))
        Box(contentAlignment = Alignment.Center) {
            val frac = left / s.totalSecs.toFloat()
            val shown by animateFloatAsState(frac, tween(900), label = "left")
            Canvas(Modifier.size(64.dp)) {
                drawCircle(c.surface2, style = Stroke(6.dp.toPx()))
                drawArc(c.primary, -90f, 360f * shown, false, style = Stroke(6.dp.toPx(), cap = StrokeCap.Round))
            }
            Text("$left", color = c.text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(28.dp))
        SecondaryButton("Take it back", onClick = { Lifter.cancel() }, modifier = Modifier.fillMaxWidth(), danger = true)
    }
}

@Composable
private fun SendingBody(s: Lifter.State.Sending, pcName: String?) {
    val c = Pd.colors
    val frac = if (s.item.totalBytes > 0) (s.bytesSent.toFloat() / s.item.totalBytes).coerceIn(0f, 1f) else 0f
    val shown by animateFloatAsState(frac, tween(250), label = "sent")
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        ItemCard(s.item, big = false)
        Spacer(Modifier.height(26.dp))
        Text("Caught! Sending to ${pcName ?: "your PC"}", color = c.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(16.dp))
        Box(Modifier.fillMaxWidth().height(8.dp).clip(CircleShape).background(c.surface2)) {
            Box(Modifier.fillMaxWidth(shown).height(8.dp).clip(CircleShape).background(c.primary))
        }
        Spacer(Modifier.height(8.dp))
        Text(
            if (s.item.files.isEmpty()) "Opening on your PC…" else "${(shown * 100).toInt()}% · ${formatBytes(s.bytesSent)} of ${formatBytes(s.item.totalBytes)}",
            color = c.muted, fontSize = 13.sp,
        )
        Spacer(Modifier.height(24.dp))
        SecondaryButton("Cancel", onClick = { Lifter.cancel() }, modifier = Modifier.fillMaxWidth(), danger = true)
    }
}

@Composable
private fun DoneBody(item: Lifter.Item, pcName: String?, onClose: () -> Unit) {
    val c = Pd.colors
    val tick = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        tick.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessMediumLow))
        delay(2200)
        Lifter.reset()
        onClose()
    }
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Box(Modifier.size(96.dp).scale(tick.value).shadow(12.dp, CircleShape).clip(CircleShape).background(Brush.linearGradient(listOf(Color(0xFF4CD964), Color(0xFF30B94D)), Offset.Zero, Offset(200f, 200f))), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(56.dp))
        }
        Spacer(Modifier.height(20.dp))
        Text("Landed on ${pcName ?: "your PC"}", color = c.text, fontSize = 22.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(
            when {
                item.files.isEmpty() && item.texts.firstOrNull()?.startsWith("http") == true -> "Opened in the PC's browser"
                item.files.isEmpty() -> "On the PC's clipboard"
                else -> "Saved in Downloads\\PinchDrop and opened"
            },
            color = c.muted, fontSize = 15.sp, textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(28.dp))
        PrimaryButton("Done", onClick = { Lifter.reset(); onClose() }, modifier = Modifier.fillMaxWidth())
    }
}
