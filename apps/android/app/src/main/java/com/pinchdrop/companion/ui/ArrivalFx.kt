package com.pinchdrop.companion.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.pinchdrop.companion.ui.screens.animationsOff
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/*
 * v2 · The phone half of the PC's animation packs (Pill Studio → Send & receive animations).
 * The PC names the pack in its offer; when the send lands, the receive sheet plays the match:
 *   plane  – a paper plane glides in on a curve, then unfolds into the file.
 *   portal – a swirling portal opens and the file drops out of it.
 *   comet  – a comet streaks in and bursts into the file.
 * "default" (and reduced motion) shows the file straight away, as before.
 */

/** How long a pack's arrival takes before the file and the tick settle (ms). */
fun arrivalMillis(fx: String): Long = if (fx == "default") 0L else 1100L

private fun seg(t: Float, from: Float, to: Float) = ((t - from) / (to - from)).coerceIn(0f, 1f)
private fun ease(x: Float) = FastOutSlowInEasing.transform(x)
/** A little overshoot for the "pop". */
private fun pop(x: Float): Float = if (x <= 0f) 0f else 1f + 0.15f * sin(x * PI).toFloat() * (1f - x) * 2f

@Composable
fun ArrivalArt(fx: String, content: @Composable () -> Unit) {
    val reduced = LocalContext.current.animationsOff()
    val pack = if (reduced) "default" else fx
    val t = remember(pack) { Animatable(if (pack == "default") 1f else 0f) }
    LaunchedEffect(pack) {
        if (pack != "default") t.animateTo(1f, tween(arrivalMillis(pack).toInt(), easing = LinearEasing))
    }
    val v = t.value
    Box(Modifier.size(width = 220.dp, height = 140.dp), contentAlignment = Alignment.Center) {
        when (pack) {
            "plane" -> {
                // Plane glides in (0–0.6), folds away (0.6–0.72); the file unfolds in (0.6–0.9).
                Canvas(Modifier.fillMaxSize()) {
                    val p = ease(seg(v, 0f, 0.6f))
                    val fade = 1f - seg(v, 0.6f, 0.72f)
                    if (fade > 0f) {
                        val x = -size.width * 0.55f * (1f - p)
                        val y = -size.height * 0.55f * (1f - p) - sin(p * PI).toFloat() * size.height * 0.25f
                        // dashed trail behind it
                        for (i in 1..6) {
                            val q = (p - i * 0.07f).coerceAtLeast(0f)
                            val tx = -size.width * 0.55f * (1f - q)
                            val ty = -size.height * 0.55f * (1f - q) - sin(q * PI).toFloat() * size.height * 0.25f
                            drawCircle(Color(0xFF0A84FF).copy(alpha = 0.35f * fade * (1f - i / 7f)), radius = 3.dp.toPx(), center = center + Offset(tx, ty))
                        }
                        translate(x, y) {
                            rotate(-25f + 35f * p, pivot = center) {
                                val s = 30.dp.toPx() * (1f - 0.3f * seg(v, 0.55f, 0.72f))
                                val plane = Path().apply {
                                    moveTo(center.x - s, center.y)
                                    lineTo(center.x + s, center.y - s * 0.75f)
                                    lineTo(center.x + s * 0.2f, center.y + s * 0.95f)
                                    lineTo(center.x - s * 0.1f, center.y + s * 0.2f)
                                    close()
                                }
                                drawPath(plane, Color.White.copy(alpha = fade))
                                drawPath(plane, Color(0xFF0A84FF).copy(alpha = fade), style = Stroke(2.dp.toPx(), join = StrokeJoin.Round))
                                drawLine(Color(0xFF0A84FF).copy(alpha = fade), center + Offset(s, -s * 0.75f), center + Offset(-s * 0.1f, s * 0.2f), 2.dp.toPx())
                            }
                        }
                    }
                }
                val r = seg(v, 0.6f, 0.9f)
                Box(Modifier.graphicsLayer { alpha = r; scaleX = (0.4f + 0.6f * pop(r)) * (0.6f + 0.4f * r); scaleY = pop(r); rotationZ = -8f * (1f - r) }) { content() }
            }
            "portal" -> {
                // Portal opens (0–0.25), the file drops out (0.25–0.65), portal closes (0.75–1).
                Canvas(Modifier.fillMaxSize()) {
                    val open = ease(seg(v, 0f, 0.25f)) * (1f - ease(seg(v, 0.75f, 1f)))
                    if (open > 0f) {
                        val c = center + Offset(0f, -size.height * 0.28f)
                        val rad = size.height * 0.3f * open
                        rotate(v * 720f, pivot = c) {
                            drawCircle(
                                Brush.sweepGradient(listOf(Color(0xFF22D3EE), Color(0xFF8B5CF6), Color(0xFFEC4899), Color(0xFF22D3EE)), center = c),
                                radius = rad, center = c, style = Stroke(9.dp.toPx() * open),
                            )
                        }
                        drawCircle(Brush.radialGradient(listOf(Color(0xFF1E1B4B), Color(0x004C1D95)), center = c, radius = rad), radius = rad * 0.85f, center = c)
                    }
                }
                val d = seg(v, 0.25f, 0.65f)
                Box(
                    Modifier.graphicsLayer {
                        alpha = seg(v, 0.25f, 0.4f)
                        translationY = -size.height * 0.45f * (1f - ease(d))
                        val s = 0.3f + 0.7f * pop(d)
                        scaleX = s; scaleY = s
                        rotationZ = 180f * (1f - ease(d))
                    },
                ) { content() }
            }
            "comet" -> {
                // Comet streaks in (0–0.45), bursts (0.45–0.85), the file pops (0.45–0.7).
                Canvas(Modifier.fillMaxSize()) {
                    val p = ease(seg(v, 0f, 0.45f))
                    val start = center + Offset(size.width * 0.6f, -size.height * 0.75f)
                    if (v < 0.47f) {
                        val head = start + (center - start) * p
                        val tail = head + (start - head) * 0.55f
                        drawLine(
                            Brush.linearGradient(listOf(Color.White, Color(0xAAFFAA3C), Color(0x00FFC857)), start = head, end = tail),
                            head, tail, 10.dp.toPx(), cap = StrokeCap.Round,
                        )
                        drawCircle(Brush.radialGradient(listOf(Color(0xCCFFBE50), Color(0x00FF8C28)), center = head, radius = 26.dp.toPx()), radius = 26.dp.toPx(), center = head)
                        drawCircle(Color.White, radius = 8.dp.toPx(), center = head)
                    }
                    val b = seg(v, 0.45f, 0.85f)
                    if (b > 0f && b < 1f) {
                        for (i in 0 until 12) {
                            val a = (i / 12f) * 2f * PI.toFloat()
                            val dist = 70.dp.toPx() * ease(b)
                            drawCircle(
                                Color(0xFFFFC857).copy(alpha = 1f - b),
                                radius = (4.dp.toPx() * (1f - b * 0.5f)),
                                center = center + Offset(cos(a) * dist, sin(a) * dist),
                            )
                        }
                        drawCircle(Color(0xFFFFC857).copy(alpha = (1f - b) * 0.8f), radius = 60.dp.toPx() * ease(b), center = center, style = Stroke(2.dp.toPx()))
                    }
                }
                val r = seg(v, 0.45f, 0.7f)
                Box(Modifier.graphicsLayer { alpha = r; val s = pop(r) * r.coerceAtLeast(0.01f).let { 0.3f + 0.7f * it }; scaleX = s; scaleY = s }) { content() }
            }
            else -> content()
        }
    }
}
