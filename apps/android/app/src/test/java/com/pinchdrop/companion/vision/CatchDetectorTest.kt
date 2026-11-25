package com.pinchdrop.companion.vision

import com.pinchdrop.companion.data.HandDetection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CatchDetectorTest {
    private val cfg = CatchDetector.configFor(HandDetection.NORMAL)

    private fun frame(t: Long, extended: Int = 4, pinch: Float = 0.9f, scale: Float = 0.3f, score: Float = 0.95f, x: Float = 0.5f) =
        HandFrame(t, extended, pinch, scale, score, x, 0.5f)

    /** Runs frames every 33 ms from [start] for [ms]; returns the time of the catch or null. */
    private fun run(d: CatchDetector, start: Long, ms: Long, f: (Long) -> HandFrame?): Long? {
        var t = start
        while (t < start + ms) {
            if (d.step(t, f(t))) return t
            t += 33
        }
        return null
    }

    @Test
    fun closedHandThatOpensIsACatch() {
        val d = CatchDetector(cfg)
        run(d, 0, 300) { frame(it, extended = 0, pinch = 0.2f) } // pinched, as carried from the PC
        val at = run(d, 300, 1000) { frame(it) }
        assertTrue(at != null && at - 300 <= 250)
        assertEquals(CatchHint.CAUGHT, d.hint)
    }

    @Test
    fun steadyOpenPalmAloneNeedsLonger() {
        val d = CatchDetector(cfg)
        val at = run(d, 0, 2000) { frame(it) }
        assertTrue(at != null && at >= cfg.openSteadyMs)
    }

    @Test
    fun catchesOnlyOnce() {
        val d = CatchDetector(cfg)
        assertTrue(run(d, 0, 2000) { frame(it) } != null)
        assertEquals(null, run(d, 2000, 2000) { frame(it) })
    }

    @Test
    fun farAwayHandsAreIgnored() {
        val d = CatchDetector(cfg)
        assertEquals(null, run(d, 0, 5000) { frame(it, scale = 0.05f) })
        assertEquals(CatchHint.TOO_FAR, d.hint)
    }

    @Test
    fun unsureTrackingIsIgnored() {
        val d = CatchDetector(cfg)
        assertEquals(null, run(d, 0, 5000) { frame(it, score = 0.3f) })
    }

    @Test
    fun fistsAndPointingAreNotACatch() {
        val d = CatchDetector(cfg)
        assertEquals(null, run(d, 0, 5000) { frame(it, extended = 0, pinch = 0.2f) })
        assertEquals(null, run(d, 5000, 5000) { frame(it, extended = 1, pinch = 0.8f) })
        assertEquals(null, run(d, 10000, 5000) { frame(it, extended = 2, pinch = 0.8f) })
    }

    @Test
    fun wavingIsNotACatch() {
        val d = CatchDetector(cfg)
        assertEquals(null, run(d, 0, 5000) { frame(it, x = if ((it / 33) % 2 == 0L) 0.1f else 0.9f) })
    }

    @Test
    fun handLeavingResetsTheOpenTimer() {
        val d = CatchDetector(cfg)
        run(d, 0, 400) { frame(it) }
        run(d, 400, 200) { null }
        // Starts counting again: 400 ms more is not enough on its own.
        assertEquals(null, run(d, 600, 400) { frame(it) })
        assertFalse(d.hint == CatchHint.CAUGHT)
    }

    @Test
    fun strictNeedsACloserHandThanEasy() {
        val strict = CatchDetector.configFor(HandDetection.STRICT)
        val easy = CatchDetector.configFor(HandDetection.EASY)
        assertTrue(strict.minScale > easy.minScale)
        assertTrue(strict.openSteadyMs > easy.openSteadyMs)
    }

    @Test
    fun handMathCountsFingers() {
        val lm = MutableList(21) { HandMath.P(0f, 0f, 0f) }
        listOf(6, 10, 14, 18).forEach { lm[it] = HandMath.P(0f, -1f, 0f) }
        lm[8] = HandMath.P(0f, -2f, 0f); lm[12] = HandMath.P(0f, -2f, 0f)
        lm[16] = HandMath.P(0f, -0.5f, 0f); lm[20] = HandMath.P(0f, -0.5f, 0f)
        lm[9] = HandMath.P(0f, -0.25f, 0f)
        assertEquals(2, HandMath.extended(lm))
        assertEquals(0.25f, HandMath.scale(lm), 1e-4f)
    }
}
