package com.pinchdrop.companion.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Notes
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pinchdrop.companion.data.ItemKind
import com.pinchdrop.companion.data.formatBytes
import com.pinchdrop.companion.transfer.Receiver
import com.pinchdrop.companion.ui.theme.Pd

/** What the bottom sheet shows: a send arriving (live), or what just landed. */
sealed interface SheetState {
    data class Receiving(val p: Receiver.Progress) : SheetState
    data class Done(val a: Receiver.Arrived) : SheetState
}

/**
 * The receive sheet: slides up from the bottom the moment the PC starts sending, shows live
 * progress, then turns into a green tick when everything has landed. Tapping outside hides it
 * (the send carries on; the notification keeps the progress).
 */
@Composable
fun ReceiveSheet(state: SheetState?, onHide: () -> Unit, onCancel: () -> Unit, sound: Boolean = false, vibrate: Boolean = true) {
    val c = Pd.colors
    Box(Modifier.fillMaxSize()) {
        AnimatedVisibility(state != null, enter = fadeIn(tween(200)), exit = fadeOut(tween(200))) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = if (c.isDark) 0.45f else 0.22f))
                    .clickable(remember { MutableInteractionSource() }, indication = null, onClick = onHide),
            )
        }
        AnimatedVisibility(
            state != null,
            modifier = Modifier.align(Alignment.BottomCenter),
            enter = slideInVertically(spring(dampingRatio = 0.86f, stiffness = Spring.StiffnessMediumLow)) { it } + fadeIn(tween(120)),
            exit = slideOutVertically(tween(260, easing = FastOutSlowInEasing)) { it } + fadeOut(tween(200)),
        ) {
            // Keep showing the last state while sliding away.
            val last = remember { arrayOfNulls<SheetState>(1) }
            if (state != null) last[0] = state
            val s = state ?: last[0] ?: return@AnimatedVisibility
            Column(
                Modifier
                    .fillMaxWidth()
                    .shadow(24.dp, RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                    .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                    .background(c.surface)
                    .clickable(remember { MutableInteractionSource() }, indication = null) { }
                    .navigationBarsPadding()
                    .padding(horizontal = 24.dp)
                    .padding(top = 10.dp, bottom = 22.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.width(38.dp).height(5.dp).clip(CircleShape).background(c.line))
                Spacer(Modifier.height(18.dp))
                AnimatedContent(
                    targetState = s,
                    contentKey = { it is SheetState.Done },
                    transitionSpec = { fadeIn(tween(220, delayMillis = 60)) togetherWith fadeOut(tween(120)) },
                    label = "sheet",
                ) { st ->
                    when (st) {
                        is SheetState.Receiving -> ReceivingBody(st.p, onHide, onCancel)
                        is SheetState.Done -> DoneBody(st.a, onHide, sound, vibrate)
                    }
                }
            }
        }
    }
}

@Composable
private fun ReceivingBody(p: Receiver.Progress, onHide: () -> Unit, onCancel: () -> Unit) {
    val c = Pd.colors
    val frac = if (p.totalBytes > 0) (p.bytesDone.toFloat() / p.totalBytes).coerceIn(0f, 1f) else 0f
    val shown by animateFloatAsState(frac, tween(260), label = "progress")
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(
                Modifier.size(52.dp).clip(RoundedCornerShape(16.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFF5AC8FA), Color(0xFF007AFF)))),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Download, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp)) }
            Column(Modifier.weight(1f)) {
                Text("Receiving “${p.label}”", color = c.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "from ${p.pcName}" + if (p.fileCount > 1) " · ${minOf(p.filesDone + 1, p.fileCount)} of ${p.fileCount} files" else "",
                    color = c.muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            Text("${(shown * 100).toInt()}%", color = c.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(18.dp))
        Box(Modifier.fillMaxWidth().height(8.dp).clip(CircleShape).background(c.surface2)) {
            Box(Modifier.fillMaxWidth(shown).height(8.dp).clip(CircleShape).background(c.primary))
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "${formatBytes(p.bytesDone)} of ${formatBytes(p.totalBytes)}" + if (p.bytesPerSec > 0) " · ${formatBytes(p.bytesPerSec)}/s" else "",
            color = c.muted, fontSize = 13.sp,
        )
        Spacer(Modifier.height(18.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SecondaryButton("Hide", onClick = onHide, modifier = Modifier.weight(1f))
            SecondaryButton("Cancel", onClick = onCancel, modifier = Modifier.weight(1f), danger = true)
        }
    }
}

@Composable
private fun DoneBody(a: Receiver.Arrived, onClose: () -> Unit, sound: Boolean, vibrate: Boolean) {
    val c = Pd.colors
    val context = LocalContext.current
    val tick = remember(a) { Animatable(0f) }
    LaunchedEffect(a) {
        // The pack's own vibration and sound, in time with its animation.
        PackFeedback.arrival(context, a.fx, sound, vibrate)
        // With an animation pack, the tick pops once the arrival has played.
        val wait = arrivalMillis(a.fx)
        if (wait > 0) kotlinx.coroutines.delay(wait - 150)
        tick.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessMediumLow))
    }
    val thumb = rememberThumbnail(a.uri?.takeIf { a.kind == ItemKind.PHOTO }, 480)
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        ArrivalArt(a.fx) {
        Box(contentAlignment = Alignment.Center) {
            if (thumb != null) {
                Image(
                    thumb, contentDescription = null, contentScale = ContentScale.Crop,
                    modifier = Modifier.size(width = 150.dp, height = 110.dp).clip(RoundedCornerShape(16.dp)),
                )
            } else {
                Box(Modifier.size(84.dp).clip(RoundedCornerShape(22.dp)).background(c.surface2), contentAlignment = Alignment.Center) {
                    Icon(kindIcon(a.kind), contentDescription = null, tint = c.primary, modifier = Modifier.size(42.dp))
                }
            }
            // The green tick pops onto the corner.
            Box(
                Modifier.align(Alignment.BottomEnd).padding(0.dp).scale(tick.value)
                    .size(38.dp).shadow(8.dp, CircleShape).clip(CircleShape).background(Color(0xFF34C759)),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Check, contentDescription = "Received", tint = Color.White, modifier = Modifier.size(24.dp)) }
        }
        }
        Spacer(Modifier.height(14.dp))
        Text(
            if (a.kind == ItemKind.TEXT) "${a.name} received" else "“${a.name}” received",
            color = c.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        Text(
            listOfNotNull(
                if (a.kind != ItemKind.TEXT) (if (a.fileCount > 1) "${a.fileCount} files · " else "") + formatBytes(a.size) else null,
                a.location,
            ).joinToString(" · "),
            color = c.muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(18.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val target = a.uri ?: a.text?.takeIf { isLink(it) }
            if (target != null) {
                PrimaryButton("Open", onClick = { openUri(context, target); onClose() }, modifier = Modifier.weight(1f))
            }
            SecondaryButton("Done", onClick = onClose, modifier = Modifier.weight(1f))
        }
    }
}

private fun kindIcon(k: ItemKind) = when (k) {
    ItemKind.PHOTO -> Icons.Filled.Image
    ItemKind.VIDEO -> Icons.Filled.Movie
    ItemKind.FOLDER -> Icons.Filled.Folder
    ItemKind.TEXT -> @Suppress("DEPRECATION") Icons.Filled.Notes
    ItemKind.FILE -> Icons.Filled.Description
}
