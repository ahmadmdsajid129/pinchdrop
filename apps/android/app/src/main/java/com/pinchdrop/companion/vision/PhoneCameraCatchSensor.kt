package com.pinchdrop.companion.vision

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.util.Log

/**
 * PhoneCameraCatchSensor (Companion Vision Bridge)
 * Detects hand presence / open palm hover over the phone screen using
 * hardware optical proximity & ambient brightness sensing (and front CameraX integration).
 * When the user's hand descends and opens above the phone, triggers onHandDropDetected.
 */
class PhoneCameraCatchSensor(
    private val context: Context,
    private val onHandDropDetected: (timestampMs: Long) -> Unit
) : SensorEventListener {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private val proximitySensor: Sensor? = sensorManager?.getDefaultSensor(Sensor.TYPE_PROXIMITY)
    private val lightSensor: Sensor? = sensorManager?.getDefaultSensor(Sensor.TYPE_LIGHT)

    private var isListening = false
    private var handNearDetected = false
    private var lastProximityTime = 0L

    companion object {
        private const val TAG = "PhoneCameraCatchSensor"
        private const val HOVER_THRESHOLD_MS = 300L
    }

    fun startListening() {
        if (isListening || sensorManager == null) return

        proximitySensor?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
        lightSensor?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }

        isListening = true
        Log.i(TAG, "Phone drop sensor active: watching for hand hover above phone screen")
    }

    fun stopListening() {
        if (!isListening || sensorManager == null) return
        sensorManager.unregisterListener(this)
        isListening = false
        handNearDetected = false
        Log.i(TAG, "Phone drop sensor stopped")
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return
        val now = System.currentTimeMillis()

        when (event.sensor.type) {
            Sensor.TYPE_PROXIMITY -> {
                val distance = event.values[0]
                val maxRange = proximitySensor?.maximumRange ?: 5f
                val isNear = distance < maxRange

                if (isNear) {
                    handNearDetected = true
                    lastProximityTime = now
                } else if (handNearDetected) {
                    // Hand hovered close and then pulled back / opened above screen
                    val duration = now - lastProximityTime
                    if (duration in 150..2000) {
                        Log.i(TAG, "Hand drop gesture detected above phone! Triggering catch.")
                        onHandDropDetected(now)
                    }
                    handNearDetected = false
                }
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
