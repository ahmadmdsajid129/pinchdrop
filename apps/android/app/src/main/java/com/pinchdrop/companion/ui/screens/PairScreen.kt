package com.pinchdrop.companion.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Laptop
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pinchdrop.companion.data.AppSettings
import com.pinchdrop.companion.link.Discovery
import com.pinchdrop.companion.link.FoundPc
import com.pinchdrop.companion.link.PcLink
import com.pinchdrop.companion.link.Proto
import com.pinchdrop.companion.ui.PdCard
import com.pinchdrop.companion.ui.PrimaryButton
import com.pinchdrop.companion.ui.QrScanner
import com.pinchdrop.companion.ui.SecondaryButton
import com.pinchdrop.companion.ui.ToggleRow
import com.pinchdrop.companion.ui.theme.Pd

/**
 * Pair with a PC (LINK-v1): scan its QR code, or pick it from the PCs found on this
 * Wi-Fi. Both screens then show a 6-digit code; the user presses Pair only if they match.
 */
@Composable
fun PairScreen(
    settings: AppSettings,
    update: ((AppSettings) -> AppSettings) -> Unit,
    onboarding: Boolean,
    onDone: () -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val pairing by PcLink.pairing.collectAsStateWithLifecycle()
    val found by Discovery.found.collectAsStateWithLifecycle()

    DisposableEffect(Unit) {
        Discovery.acquire(context)
        onDispose {
            Discovery.release()
            // Leaving mid-pairing cancels it; a finished pairing just resets the screen.
            PcLink.cancelPairing()
        }
    }
    val leave = { PcLink.cancelPairing(); onBack() }

    Column(Modifier.fillMaxSize()) {
        ScreenHeader(title = "Pair with your PC", onBack = leave, eyebrow = if (onboarding) "STEP 2 OF 2" else null)
        when (val p = pairing) {
            is PcLink.Pairing.Code -> CodeStep(p)
            is PcLink.Pairing.Connecting -> Busy("Connecting to ${p.pcName}…")
            is PcLink.Pairing.Done -> DoneStep(p.pcName, onboarding, onDone)
            PcLink.Pairing.Idle, is PcLink.Pairing.Failed -> ScanStep(
                failure = (p as? PcLink.Pairing.Failed)?.message,
                found = found.values.sortedBy { it.name },
                settings = settings,
                update = update,
                onboarding = onboarding,
                onSkip = onDone,
            )
        }
    }
}

@Composable
private fun ScanStep(
    failure: String?,
    found: List<FoundPc>,
    settings: AppSettings,
    update: ((AppSettings) -> AppSettings) -> Unit,
    onboarding: Boolean,
    onSkip: () -> Unit,
) {
    val c = Pd.colors
    val context = LocalContext.current
    var cameraOk by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val askCamera = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { cameraOk = it }
    var badQr by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                Modifier.fillMaxWidth().height(280.dp).clip(RoundedCornerShape(22.dp)).background(Color.Black)
                    .border(2.dp, c.line, RoundedCornerShape(22.dp)),
                contentAlignment = Alignment.Center,
            ) {
                if (cameraOk) {
                    QrScanner(Modifier.fillMaxSize()) { text ->
                        val qr = Proto.parsePairingQr(text)
                        if (qr == null) {
                            badQr = true
                            false
                        } else {
                            PcLink.startPairing(PcLink.PairTarget(qr.pcId, qr.pcName, qr.hosts, qr.port, qr.fingerprint, qr.token))
                            true
                        }
                    }
                    ScanFrame()
                } else {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Filled.CameraAlt, contentDescription = null, tint = c.muted, modifier = Modifier.size(48.dp))
                        Text("The camera is needed to scan the QR code", color = Color(0xFFC7CEEA), fontSize = 14.sp)
                        SecondaryButton("Allow camera", onClick = { askCamera.launch(Manifest.permission.CAMERA) })
                    }
                }
            }

            if (failure != null) {
                Text(
                    failure, color = c.text, fontSize = 14.sp, lineHeight = 20.sp,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.danger.copy(alpha = 0.14f)).padding(14.dp)
                        .semantics { liveRegion = LiveRegionMode.Polite },
                )
            } else if (badQr) {
                Text("That isn't a PinchDrop pairing code.", color = c.warn, fontSize = 13.sp)
            }

            Text("Point at the QR code on your PC", color = c.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Text(
                "On the PC: PinchDrop → Devices → Pair a new phone. Both must be on the same Wi-Fi.",
                color = c.muted, fontSize = 14.sp, lineHeight = 20.sp,
            )

            Text("FOUND ON THIS WI-FI", color = c.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp)
            if (found.isEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = c.muted)
                    Text("Looking for PCs running PinchDrop…", color = c.muted, fontSize = 13.sp)
                }
            } else {
                found.forEach { pc ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(14.dp)).background(c.surface)
                            .clickable(role = Role.Button, onClickLabel = "Pair with ${pc.name}") {
                                PcLink.startPairing(PcLink.PairTarget(pc.pcId, pc.name, listOf(pc.host), pc.port, pc.fingerprint, null))
                            }
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Icon(Icons.Filled.Laptop, contentDescription = null, tint = c.accent)
                        Column(Modifier.weight(1f)) {
                            Text(pc.name, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            Text(pc.host, color = c.muted, fontSize = 12.sp)
                        }
                        Text("Pair", color = c.accent, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Text("Picking from the list works without the camera — you'll compare a 6-digit code instead.", color = c.muted, fontSize = 12.sp)
            }

            PdCard {
                ToggleRow(
                    title = "Preview with a demo PC",
                    description = "Shows a pretend PC (marked DEMO) when none is paired. Nothing is sent.",
                    checked = settings.demoPc,
                    onChange = { v -> update { it.copy(demoPc = v) } },
                    last = true,
                )
            }
        }
        if (onboarding) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SecondaryButton("Skip for now", onClick = onSkip, modifier = Modifier.fillMaxWidth())
                Text(
                    "You can pair later from Settings.", color = c.muted, fontSize = 13.sp,
                    textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

/** Corner brackets and a moving scan line over the camera view. */
@Composable
private fun ScanFrame() {
    val c = Pd.colors
    val t = rememberInfiniteTransition(label = "scan")
    val y by t.animateFloat(0.12f, 0.84f, infiniteRepeatable(tween(1800), RepeatMode.Reverse), label = "y")
    BoxWithConstraints(Modifier.fillMaxSize().padding(36.dp)) {
        Box(Modifier.fillMaxSize().border(3.dp, Color.White.copy(alpha = 0.7f), RoundedCornerShape(18.dp)))
        Box(
            Modifier.fillMaxWidth().height(2.dp).offset(y = maxHeight * y).background(c.accent),
        )
    }
}

@Composable
private fun Busy(text: String) {
    val c = Pd.colors
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        CircularProgressIndicator(color = c.primary)
        Text(text, color = c.soft, fontSize = 16.sp, modifier = Modifier.padding(top = 16.dp).semantics { liveRegion = LiveRegionMode.Polite })
        SecondaryButton("Cancel", onClick = { PcLink.cancelPairing() }, modifier = Modifier.padding(top = 24.dp))
    }
}

@Composable
private fun CodeStep(p: PcLink.Pairing.Code) {
    val c = Pd.colors
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Icon(Icons.Filled.Shield, contentDescription = null, tint = c.accent, modifier = Modifier.size(44.dp))
        Text("Does your PC show this code?", color = c.text, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        Text("Pairing with ${p.pcName}", color = c.muted, fontSize = 15.sp)
        Text(
            "${p.code.take(3)} ${p.code.drop(3)}",
            color = c.text, fontSize = 46.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, letterSpacing = 4.sp,
            modifier = Modifier.semantics { contentDescription = "Code ${p.code.toList().joinToString(" ")}" },
        )
        Text(
            "If the codes match, press Pair on both. This stops anyone else on the Wi-Fi from pretending to be your PC.",
            color = c.muted, fontSize = 14.sp, lineHeight = 20.sp, textAlign = TextAlign.Center,
        )
        if (p.phoneConfirmed) {
            Text(
                "Now press Pair on the PC…", color = c.success, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
            CircularProgressIndicator(Modifier.size(24.dp), color = c.success, strokeWidth = 2.dp)
        } else {
            PrimaryButton("Codes match — Pair", onClick = { PcLink.answerCode(true) }, modifier = Modifier.fillMaxWidth())
            SecondaryButton("They don't match", onClick = { PcLink.answerCode(false) }, modifier = Modifier.fillMaxWidth(), danger = true)
        }
    }
}

@Composable
private fun DoneStep(pcName: String, onboarding: Boolean, onDone: () -> Unit) {
    val c = Pd.colors
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = c.success, modifier = Modifier.size(72.dp))
        Text(
            "Paired with $pcName", color = c.text, fontSize = 24.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(top = 16.dp).semantics { liveRegion = LiveRegionMode.Polite },
        )
        Text(
            "Your PC's pill now shows this phone and its battery. They reconnect by themselves on the same Wi-Fi.",
            color = c.muted, fontSize = 15.sp, lineHeight = 22.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp),
        )
        PrimaryButton(if (onboarding) "Continue" else "Done", onClick = { PcLink.cancelPairing(); onDone() }, modifier = Modifier.fillMaxWidth().padding(top = 28.dp))
    }
}
