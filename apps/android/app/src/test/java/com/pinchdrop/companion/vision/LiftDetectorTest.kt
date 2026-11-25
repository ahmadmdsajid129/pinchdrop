package com.pinchdrop.companion.vision

import com.pinchdrop.companion.data.HandDetection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LiftDetectorTest {
    private val cfg = LiftDetector.configFor(HandDetection.NORMAL)

    private fun frame(t: Long, extended: Int = 4, pinch: Float = 0.9f, scale: Float = 0.3f, score: Float = 0.95f, x: Float = 0.5f) =
        HandFrame(t, extended, pinch, scale, score, x, 0.5f)

    private fun run(d: LiftDetector, start: Long, ms: Long, f: (Long) -> HandFrame?): Long? {
        var t = start
        while (t < start + ms) {
            if (d.step(t, f(t))) return t
            t += 33
        }
        return null
    }

    @Test
    fun openHandThenPinchLifts() {
        val d = LiftDetector(cfg)
        run(d, 0, 300) { frame(it) } // open hand over the phone
        val at = run(d, 300, 800) { frame(it, extended = 2, pinch = 0.15f) }
        assertNotNull(at)
        assertTrue(at!! - 300 in cfg.pinchMs..cfg.pinchMs + 70)
        assertEquals(LiftHint.LIFTED, d.hint)
    }

    @Test
    fun liftsOnlyOnce() {
        val d = LiftDetector(cfg)
        run(d, 0, 200) { frame(it) }
        var hits = 0
        var t = 200L
        while (t < 2000) {
            if (d.step(t, frame(t, pinch = 0.15f))) hits++
            t += 33
        }
        assertEquals(1, hits)
    }

    @Test
    fun aHandThatWasNeverOpenDoesNotLift() {
        val d = LiftDetector(cfg)
        assertNull(run(d, 0, 2000) { frame(it, extended = 0, pinch = 0.15f) })
    }

    @Test
    fun farHandsAndShakyTrackingAreIgnored() {
        val d = LiftDetector(cfg)
        run(d, 0, 300) { frame(it, scale = 0.05f) }
        assertNull(run(d, 300, 1000) { frame(it, pinch = 0.15f, scale = 0.05f) })
        assertEquals(LiftHint.TOO_FAR, d.hint)
        d.reset()
        run(d, 0, 300) { frame(it) }
        assertNull(run(d, 300, 1000) { frame(it, pinch = 0.15f, score = 0.3f) })
    }

    @Test
    fun aQuickTouchIsNotALift() {
        val d = LiftDetector(cfg)
        run(d, 0, 300) { frame(it) }
        // pinch for ~66 ms, then open again
        assertFalse(d.step(330, frame(330, pinch = 0.15f)))
        assertFalse(d.step(363, frame(363, pinch = 0.15f)))
        assertNull(run(d, 396, 600) { frame(it) })
    }

    @Test
    fun wavingIsIgnored() {
        val d = LiftDetector(cfg)
        run(d, 0, 300) { frame(it) }
        assertNull(run(d, 300, 1000) { frame(it, pinch = 0.15f, x = if ((it / 33) % 2 == 0L) 0.1f else 0.9f) })
    }
}
