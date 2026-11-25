package com.pinchdrop.companion.vision

import com.pinchdrop.companion.data.HandDetection
import kotlin.math.hypot

/** One camera frame's worth of hand facts (from MediaPipe's 21 landmarks). */
data class HandFrame(
    /** Milliseconds, monotonic. */
    val t: Long,
    /** Index/middle/ring/pinky extended (0..4). */
    val extended: Int,
    /** dist(thumb tip, index tip) / dist(wrist, middle knuckle). */
    val pinchRatio: Float,
    /** Hand size in the image, wrist → middle knuckle (0..1). Big = close to the phone. */
    val scale: Float,
    /** Tracker confidence (0..1). */
    val score: Float,
    /** Hand centre in the image (0..1). */
    val x: Float,
    val y: Float,
)

/** What the Catch screen tells the user. */
enum class CatchHint { LOOKING, TOO_FAR, HAND_SEEN, OPENING, CAUGHT }

/**
 * Decides when an open hand over the phone means "catch".
 *
 * Only one gesture acts: a hand **close** to the phone (10–30 cm) that **opens**:
 *  * closed/pinched hand seen, then fingers spread for [Config.openAfterClosedMs] → catch, or
 *  * an already-open, steady palm held for [Config.openSteadyMs] → catch.
 * Everything else — far hands, people walking past, fists, pointing, waving, unsure
 * tracking — is ignored. Pure logic, unit-tested on the JVM.
 */
class CatchDetector(private val config: Config) {
    data class Config(
        val minScale: Float,
        val minScore: Float,
        val openFingers: Int,
        val openRatio: Float,
        val closedRatio: Float,
        val openAfterClosedMs: Long,
        val openSteadyMs: Long,
        /** A closed hand counts as "seen closed" for this long. */
        val closedMemoryMs: Long,
        /** Image widths per second; faster = waving, ignored. */
        val maxSpeed: Float,
    )

    companion object {
        /** Hand-detection setting → thresholds. */
        fun configFor(level: HandDetection): Config = when (level) {
            HandDetection.EASY -> Config(0.14f, 0.6f, 3, 0.55f, 0.45f, 120, 450, 4000, 3.0f)
            HandDetection.NORMAL -> Config(0.18f, 0.7f, 4, 0.6f, 0.4f, 150, 600, 3000, 2.2f)
            HandDetection.STRICT -> Config(0.22f, 0.8f, 4, 0.7f, 0.35f, 220, 900, 2500, 1.6f)
        }
    }

    private var lastClosedAt = Long.MIN_VALUE / 2
    private var openSince: Long? = null
    private var last: HandFrame? = null
    private var caught = false

    var hint: CatchHint = CatchHint.LOOKING
        private set

    fun reset() {
        lastClosedAt = Long.MIN_VALUE / 2
        openSince = null
        last = null
        caught = false
        hint = CatchHint.LOOKING
    }

    /** Feed one frame (null = no hand). Returns true exactly once, when the catch happens. */
    fun step(t: Long, frame: HandFrame?): Boolean {
        if (caught) return false
        val c = config
        val prev = last
        if (frame == null || frame.score < c.minScore) {
            openSince = null
            last = null
            hint = CatchHint.LOOKING
            return false
        }
        last = frame
        if (frame.scale < c.minScale) {
            // Someone in the room, or the hand is still far above the phone.
            openSince = null
            hint = CatchHint.TOO_FAR
            return false
        }
        val speed = if (prev != null && frame.t > prev.t) {
            hypot((frame.x - prev.x).toDouble(), (frame.y - prev.y).toDouble()).toFloat() * 1000f / (frame.t - prev.t)
        } else 0f

        val closed = frame.pinchRatio <= c.closedRatio || frame.extended <= 1
        val open = frame.extended >= c.openFingers && frame.pinchRatio >= c.openRatio
        when {
            closed -> {
                lastClosedAt = t
                openSince = null
                hint = CatchHint.HAND_SEEN
            }
            open && speed <= c.maxSpeed -> {
                val since = openSince ?: t.also { openSince = it }
                val afterClosed = t - lastClosedAt <= c.closedMemoryMs
                val needed = if (afterClosed) c.openAfterClosedMs else c.openSteadyMs
                hint = CatchHint.OPENING
                if (t - since >= needed) {
                    caught = true
                    hint = CatchHint.CAUGHT
                    return true
                }
            }
            else -> {
                // Half-open, pointing, waving: not a catch.
                openSince = null
                hint = CatchHint.HAND_SEEN
            }
        }
        return false
    }
}

/** Landmark helpers shared by the camera code and tests (same rules as gesture-core on the PC). */
object HandMath {
    data class P(val x: Float, val y: Float, val z: Float)

    private fun d(a: P, b: P) = hypot(hypot((a.x - b.x).toDouble(), (a.y - b.y).toDouble()), (a.z - b.z).toDouble()).toFloat()

    fun extended(lm: List<P>): Int {
        if (lm.size < 21) return 0
        return listOf(8 to 6, 12 to 10, 16 to 14, 20 to 18).count { (tip, pip) -> d(lm[0], lm[tip]) > d(lm[0], lm[pip]) * 1.05f }
    }

    fun pinchRatio(lm: List<P>): Float {
        if (lm.size < 21) return 1f
        val palm = d(lm[0], lm[9])
        return if (palm <= 0f) 1f else d(lm[4], lm[8]) / palm
    }

    fun scale(lm: List<P>): Float =
        if (lm.size < 21) 0f else hypot((lm[0].x - lm[9].x).toDouble(), (lm[0].y - lm[9].y).toDouble()).toFloat()
}
