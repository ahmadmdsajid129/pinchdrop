package com.pinchdrop.companion.vision

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProximityGestureTest {
    @Test
    fun aHandHoveringOverThePhoneCatches() {
        val g = ProximityGesture()
        assertFalse(g.step(0, false)) // phone uncovered
        assertFalse(g.step(1000, true)) // hand comes over
        assertTrue(g.step(1400, false)) // and goes away
    }

    @Test
    fun aPhoneInAPocketNeverCatches() {
        val g = ProximityGesture()
        assertFalse(g.step(0, true)) // covered from the start: never seen far
        assertFalse(g.step(800, false))
        // and a long cover is not a hover either
        assertFalse(g.step(1000, true))
        assertFalse(g.step(5000, false))
    }

    @Test
    fun aFlickerIsNotACatch() {
        val g = ProximityGesture()
        g.step(0, false)
        g.step(100, true)
        assertFalse(g.step(150, false)) // 50 ms: sensor noise
    }
}
