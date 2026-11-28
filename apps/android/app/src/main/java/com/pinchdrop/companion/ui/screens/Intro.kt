package com.pinchdrop.companion.ui.screens

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.BackHand
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Laptop
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.TouchApp
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pinchdrop.companion.ui.PdCard
import com.pinchdrop.companion.ui.PrimaryButton
import com.pinchdrop.companion.ui.theme.Pd
import kotlinx.coroutines.launch

// ---------- Welcome: three animated slides ----------

private class Slide(val title: String, val body: String, val art: @Composable () -> Unit)

/** v2 · First screen after install: what PinchDrop does, in three short animated slides. */
@Composable
fun WelcomeScreen(onStart: () -> Unit) {
    val c = Pd.colors
    val slides = listOf(
        Slide("Pinch it on your PC", "Select a file, photo or link on your laptop and pinch in front of its camera. It lifts into the air.") { PcToPhoneArt() },
        Slide("Open your hand to catch", "Hold your open hand over this phone and it lands here: Gallery for photos, Downloads for the rest.") { CatchArt() },
        Slide("Your phone, on your PC", "Notifications, messages, calls, photos and files from this phone, right on your PC. Only what you turn on.") { PhoneOnPcArt() },
    )
    val pager = rememberPagerState(pageCount = { slides.size })
    val scope = rememberCoroutineScope()
    val last = pager.currentPage == slides.lastIndex
    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp, vertical = 16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("PinchDrop", color = c.text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            if (!last) TextButton(onClick = onStart) { Text("Skip", color = c.muted) }
        }
        HorizontalPager(state = pager, modifier = Modifier.weight(1f).fillMaxWidth()) { i ->
            val s = slides[i]
            // Small phones and big text: the picture shrinks so the words always fit.
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val compact = maxHeight < 420.dp
                val artH = (maxHeight * 0.48f).coerceIn(110.dp, 260.dp)
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Box(Modifier.fillMaxWidth().height(artH), contentAlignment = Alignment.Center) { s.art() }
                    Spacer(Modifier.height(if (compact) 12.dp else 24.dp))
                    Text(
                        s.title, color = c.text, fontSize = if (compact) 22.sp else 28.sp, fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center, lineHeight = if (compact) 28.sp else 34.sp, modifier = Modifier.semantics { heading() },
                    )
                    Spacer(Modifier.height(if (compact) 6.dp else 10.dp))
                    Text(s.body, color = c.muted, fontSize = if (compact) 14.sp else 16.sp, textAlign = TextAlign.Center, lineHeight = if (compact) 20.sp else 23.sp)
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalArrangement = Arrangement.Center) {
            repeat(slides.size) { i ->
                val on = i == pager.currentPage
                Box(
                    Modifier.padding(horizontal = 4.dp).height(8.dp).width(if (on) 22.dp else 8.dp).clip(CircleShape)
                        .background(if (on) c.primary else c.line),
                )
            }
        }
        PrimaryButton(
            if (last) "Get started" else "Next",
            onClick = { if (last) onStart() else scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Free · works on your Wi-Fi · no account",
            color = c.muted, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
        )
    }
}

// ---------- Illustrations (drawn, no image files) ----------

@Composable
private fun Laptop(modifier: Modifier = Modifier, content: @Composable () -> Unit = {}) {
    val c = Pd.colors
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(150.dp, 96.dp).clip(RoundedCornerShape(10.dp)).background(c.surface)
                .border(5.dp, c.text.copy(alpha = 0.85f), RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center,
        ) { content() }
        Box(Modifier.size(176.dp, 9.dp).clip(RoundedCornerShape(bottomStart = 8.dp, bottomEnd = 8.dp)).background(c.text.copy(alpha = 0.85f)))
    }
}

@Composable
private fun Phone(modifier: Modifier = Modifier, content: @Composable () -> Unit = {}) {
    val c = Pd.colors
    Box(
        modifier.size(70.dp, 130.dp).clip(RoundedCornerShape(16.dp)).background(c.surface)
            .border(4.dp, c.text.copy(alpha = 0.85f), RoundedCornerShape(16.dp)),
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun FileChip(icon: ImageVector = Icons.Filled.Folder, modifier: Modifier = Modifier) {
    val c = Pd.colors
    Box(
        modifier.size(40.dp, 48.dp).clip(RoundedCornerShape(10.dp)).background(c.primary),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, contentDescription = null, tint = c.onPrimary, modifier = Modifier.size(22.dp)) }
}

/** A file lifts off the laptop, arcs across and drops into the phone. Loops. */
@Composable
private fun PcToPhoneArt() {
    val c = Pd.colors
    val t by rememberInfiniteTransition(label = "fly").animateFloat(
        0f, 1f, infiniteRepeatable(tween(2600, easing = LinearEasing), RepeatMode.Restart), label = "t",
    )
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val w = maxWidth
        Box(Modifier.fillMaxSize().background(Brush.radialGradient(listOf(c.primary.copy(alpha = 0.16f), Color.Transparent))))
        Laptop(Modifier.align(Alignment.CenterStart).offset(x = 0.dp, y = 20.dp)) {
            Icon(Icons.Filled.PanTool, contentDescription = null, tint = c.primary.copy(alpha = if (t < 0.25f) 1f else 0.35f), modifier = Modifier.size(30.dp))
        }
        Phone(Modifier.align(Alignment.CenterEnd).offset(y = 10.dp)) {
            val landed = t > 0.82f
            Icon(
                if (landed) Icons.Filled.CheckCircle else Icons.Filled.PhoneAndroid, contentDescription = null,
                tint = if (landed) c.success else c.muted.copy(alpha = 0.4f), modifier = Modifier.size(26.dp),
            )
        }
        // 0–0.2 lift, 0.2–0.8 arc across, 0.8–1 settle into the phone.
        val p = ((t - 0.15f) / 0.65f).coerceIn(0f, 1f)
        val ease = FastOutSlowInEasing.transform(p)
        val startX = 55f
        val endX = w.value - 55f
        val x = startX + (endX - startX) * ease
        val arc = -90f * 4f * ease * (1f - ease)
        val lift = if (t < 0.15f) -t / 0.15f * 20f else -20f
        val y = 120f + lift + arc + (if (t > 0.8f) (t - 0.8f) / 0.2f * 30f else 0f)
        val alpha = if (t > 0.9f) (1f - (t - 0.9f) / 0.1f) else 1f
        FileChip(
            modifier = Modifier.offset(x = (x - 20f).dp, y = (y - 24f).dp)
                .graphicsLayer { this.alpha = alpha; rotationZ = -12f + 24f * ease; val s = 1f - 0.25f * ease; scaleX = s; scaleY = s },
        )
    }
}

/** An open hand hovers over the phone, a file drops in, a tick appears. */
@Composable
private fun CatchArt() {
    val c = Pd.colors
    val t by rememberInfiniteTransition(label = "catch").animateFloat(
        0f, 1f, infiniteRepeatable(tween(2400, easing = LinearEasing), RepeatMode.Restart), label = "t",
    )
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Box(Modifier.size(240.dp).background(Brush.radialGradient(listOf(c.accent.copy(alpha = 0.18f), Color.Transparent))))
        Phone(Modifier.offset(y = 40.dp)) {
            if (t > 0.6f) Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = c.success, modifier = Modifier.size(30.dp))
        }
        // The hand opens (scales up) above the phone.
        val open = (t / 0.25f).coerceIn(0f, 1f)
        Icon(
            Icons.Filled.BackHand, contentDescription = null, tint = c.primary,
            modifier = Modifier.offset(y = (-70).dp).size(64.dp).graphicsLayer { val s = 0.7f + 0.3f * open; scaleX = s; scaleY = s; alpha = 1f - (t - 0.8f).coerceAtLeast(0f) * 5f },
        )
        val drop = ((t - 0.25f) / 0.35f).coerceIn(0f, 1f)
        if (t in 0.2f..0.62f) {
            FileChip(
                icon = Icons.Filled.Image,
                modifier = Modifier.offset(y = (-20 + 60 * FastOutSlowInEasing.transform(drop)).dp)
                    .graphicsLayer { val s = 1f - 0.4f * drop; scaleX = s; scaleY = s },
            )
        }
    }
}

/** Notification bubbles pop onto the laptop from the phone. */
@Composable
private fun PhoneOnPcArt() {
    val c = Pd.colors
    val t by rememberInfiniteTransition(label = "pop").animateFloat(
        0f, 3f, infiniteRepeatable(tween(3600, easing = LinearEasing), RepeatMode.Restart), label = "t",
    )
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Box(Modifier.size(260.dp).background(Brush.radialGradient(listOf(c.primary.copy(alpha = 0.14f), Color.Transparent))))
        Laptop(Modifier.offset(y = 30.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf(Icons.Filled.Chat to "Message", Icons.Filled.Call to "Call", Icons.Filled.Image to "Photo").forEachIndexed { i, (ic, label) ->
                    val shown = (t - i).coerceIn(0f, 1f)
                    Row(
                        Modifier.graphicsLayer { alpha = shown; translationX = (1f - shown) * 40f }
                            .clip(RoundedCornerShape(8.dp)).background(c.bg2).padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(ic, contentDescription = null, tint = c.primary, modifier = Modifier.size(12.dp))
                        Text(label, color = c.text, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        Phone(Modifier.align(Alignment.CenterEnd).offset(x = (-8).dp, y = (-40).dp).graphicsLayer { scaleX = 0.7f; scaleY = 0.7f }) {
            Icon(Icons.Filled.Notifications, contentDescription = null, tint = c.accent, modifier = Modifier.size(26.dp))
        }
    }
}

// ---------- How to use ----------

private class GuideStep(val icon: ImageVector, val title: String, val body: String)

private val phoneGuide = listOf(
    GuideStep(Icons.Filled.PanTool, "Catch from your PC", "On the PC, select something and pinch in front of the camera (or press Ctrl+Shift+Space). Open your hand over this phone: it lands here. No camera? Tap Accept instead."),
    GuideStep(Icons.Filled.Share, "Send from this phone", "In any app tap Share → PinchDrop, then pinch the phone screen to lift it. Open your hand at the PC (or click Catch on its pill)."),
    GuideStep(Icons.Filled.Image, "Photos and videos", "Arrive in your Gallery in the PinchDrop album. Other files go to Downloads/PinchDrop. Everything is listed under Received."),
    GuideStep(Icons.Filled.Notifications, "Notifications and messages", "Turn them on under Settings → Features. They show on the PC's pill; reply or clear them from either side."),
    GuideStep(Icons.Filled.Call, "Calls", "Calls ring on the PC too. Answer with an open palm held still, reject by swiping your hand sideways, silence with a fist, or just click."),
    GuideStep(Icons.Filled.ContentPaste, "Clipboard", "Copy on one, paste on the other (turn on Clipboard sync on the PC). Codes from texts are copied for you."),
    GuideStep(Icons.Filled.Wifi, "Stay connected", "Keep both on the same Wi-Fi. They find each other again by themselves; nothing goes through the internet."),
)

private val pcGuide = listOf(
    GuideStep(Icons.Filled.Laptop, "The pill", "The small pill at the top of your PC screen shows your phones. Click it to open the Island: calls, messages, music, photos."),
    GuideStep(Icons.Filled.TouchApp, "Pinch to grab", "Select files in Explorer, then pinch in front of the webcam. Drop by opening your hand over a phone; the phone catches it."),
    GuideStep(Icons.AutoMirrored.Filled.Send, "Send without gestures", "Drag files onto the PinchDrop window, or right-click → Send to → PinchDrop."),
    GuideStep(Icons.Filled.PhoneAndroid, "Several phones", "Pair more than one phone. Drop on a phone's chip to send to it, or drag files between phones on the Phone files page."),
)

/** v2 · How to use PinchDrop, on this phone and on the PC. From onboarding, Home and Settings. */
@Composable
fun GuideScreen(onDone: () -> Unit, onBack: (() -> Unit)?, onboarding: Boolean) {
    val c = Pd.colors
    Column(Modifier.fillMaxSize()) {
        ScreenHeader(title = if (onboarding) "You're all set" else "How to use PinchDrop", onBack = onBack, eyebrow = if (onboarding) "QUICK GUIDE" else null)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.fillMaxWidth().height(if (androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp < 700) 130.dp else 200.dp)) { PcToPhoneArt() }
            Text("On this phone", color = c.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            phoneGuide.forEachIndexed { i, s -> GuideCard(i + 1, s) }
            Text("On your PC", color = c.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
            pcGuide.forEachIndexed { i, s -> GuideCard(phoneGuide.size + i + 1, s) }
            Text(
                "You can open this guide any time from Settings → How to use.",
                color = c.muted, fontSize = 13.sp, modifier = Modifier.padding(vertical = 8.dp),
            )
        }
        PrimaryButton(if (onboarding) "Start using PinchDrop" else "Done", onClick = onDone, modifier = Modifier.fillMaxWidth().padding(20.dp))
    }
}

@Composable
private fun GuideCard(n: Int, s: GuideStep) {
    val c = Pd.colors
    PdCard {
        Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(c.primary.copy(alpha = 0.10f)), contentAlignment = Alignment.Center) {
                Icon(s.icon, contentDescription = null, tint = c.primary)
            }
            Column(Modifier.weight(1f)) {
                Text("$n. ${s.title}", color = c.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(2.dp))
                Text(s.body, color = c.muted, fontSize = 13.5.sp, lineHeight = 19.sp)
            }
        }
    }
}
