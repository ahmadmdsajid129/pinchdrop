package com.pinchdrop.companion.vision

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager

/**
 * v2 · Proximity catch: hover a hand over the top of the phone (where the earpiece is) to catch,
 * with no camera and no app on screen. Pure logic, unit-tested.
 *
 * A catch is a hand that comes near and goes away again: near for at least [minNearMs] and
 * at most [maxNearMs]. A phone lying in a pocket or face-down stays "near" for longer and
 * never catches; it must be seen "far" first, too.
 */
class ProximityGesture(private val minNearMs: Long = 120, private val maxNearMs: Long = 1500) {
    private var sawFar = false
    private var nearSince: Long? = null

    fun reset() {
        sawFar = false
        nearSince = null
    }

    /** Feed each sensor change. Returns true when it's a catch. */
    fun step(t: Long, near: Boolean): Boolean {
        if (!near) {
            val since = nearSince
            nearSince = null
            val wasFar = sawFar
            sawFar = true
            return since != null && wasFar && t - since in minNearMs..maxNearMs
        }
        if (nearSince == null) nearSince = t
        return false
    }
}

/** Listens to the proximity sensor only while something is waiting to be caught. */
class ProximityWatcher(context: Context, private val onCatch: () -> Unit) : SensorEventListener {
    private val sm = context.getSystemService(SensorManager::class.java)
    private val sensor: Sensor? = sm?.getDefaultSensor(Sensor.TYPE_PROXIMITY)
    private val gesture = ProximityGesture()
    private var on = false

    val available: Boolean get() = sensor != null

    fun start() {
        if (on || sensor == null) return
        gesture.reset()
        on = sm.registerListener(this, sensor, SensorManager.SENSOR_DELAY_UI)
    }

    fun stop() {
        if (!on) return
        sm.unregisterListener(this)
        on = false
    }

    override fun onSensorChanged(e: SensorEvent) {
        val s = sensor ?: return
        val near = e.values.firstOrNull()?.let { it < minOf(s.maximumRange, 5f) } ?: return
        if (gesture.step(e.timestamp / 1_000_000, near)) {
            stop()
            onCatch()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
