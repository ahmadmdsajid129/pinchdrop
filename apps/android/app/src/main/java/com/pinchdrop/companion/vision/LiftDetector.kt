package com.pinchdrop.companion.vision

import com.pinchdrop.companion.data.HandDetection
import kotlin.math.hypot

/** What the Lift screen tells the user. */
enum class LiftHint { LOOKING, TOO_FAR, OPEN_SEEN, PINCHING, LIFTED }

/**
 * v2 · Lift: decides when a pinch in front of the phone means "pick this up".
 *
 * An open hand close to the phone, then thumb and index tips coming together and staying
 * together for [Config.pinchMs] → lift. The open hand must have been seen within
 * [Config.openMemoryMs] first, so a fist that was already closed, or a hand drifting into
 * view half-closed, never lifts. Far hands, fast waving and unsure tracking are ignored.
 * Pure logic, unit-tested on the JVM.
 */
class LiftDetector(private val config: Config) {
    data class Config(
        val minScale: Float,
        val minScore: Float,
        /** Thumb–index distance / palm size at or below which it's a pinch. */
        val pinchRatio: Float,
        /** At or above this (with 3+ fingers out) the hand counts as open. */
        val openRatio: Float,
        val pinchMs: Long,
        val openMemoryMs: Long,
        /** Image widths per second; faster = waving, ignored. */
        val maxSpeed: Float,
    )

    companion object {
        fun configFor(level: HandDetection): Config = when (level) {
            HandDetection.EASY -> Config(0.14f, 0.6f, 0.38f, 0.5f, 120, 4000, 3.0f)
            HandDetection.NORMAL -> Config(0.18f, 0.7f, 0.32f, 0.55f, 150, 3000, 2.2f)
            HandDetection.STRICT -> Config(0.22f, 0.8f, 0.26f, 0.6f, 220, 2500, 1.6f)
        }
    }

    private var lastOpenAt = Long.MIN_VALUE / 2
    private var pinchSince: Long? = null
    private var last: HandFrame? = null
    private var lifted = false

    var hint: LiftHint = LiftHint.LOOKING
        private set

    /** 0..1 while pinching (for a progress ring). */
    var progress: Float = 0f
        private set

    fun reset() {
        lastOpenAt = Long.MIN_VALUE / 2
        pinchSince = null
        last = null
        lifted = false
        hint = LiftHint.LOOKING
        progress = 0f
    }

    /** Feed one frame (null = no hand). Returns true exactly once, when the lift happens. */
    fun step(t: Long, frame: HandFrame?): Boolean {
        if (lifted) return false
        val c = config
        val prev = last
        progress = 0f
        if (frame == null || frame.score < c.minScore) {
            pinchSince = null
            last = null
            hint = LiftHint.LOOKING
            return false
        }
        last = frame
        if (frame.scale < c.minScale) {
            pinchSince = null
            hint = LiftHint.TOO_FAR
            return false
        }
        val speed = if (prev != null && frame.t > prev.t) {
            hypot((frame.x - prev.x).toDouble(), (frame.y - prev.y).toDouble()).toFloat() * 1000f / (frame.t - prev.t)
        } else 0f
        val open = frame.extended >= 3 && frame.pinchRatio >= c.openRatio
        val pinched = frame.pinchRatio <= c.pinchRatio
        when {
            open -> {
                lastOpenAt = t
                pinchSince = null
                hint = LiftHint.OPEN_SEEN
            }
            pinched && speed <= c.maxSpeed && t - lastOpenAt <= c.openMemoryMs -> {
                val since = pinchSince ?: t.also { pinchSince = it }
                hint = LiftHint.PINCHING
                progress = ((t - since).toFloat() / c.pinchMs).coerceIn(0f, 1f)
                if (t - since >= c.pinchMs) {
                    lifted = true
                    hint = LiftHint.LIFTED
                    progress = 1f
                    return true
                }
            }
            else -> {
                pinchSince = null
                if (hint != LiftHint.OPEN_SEEN || t - lastOpenAt > c.openMemoryMs) hint = LiftHint.LOOKING
            }
        }
        return false
    }
}
