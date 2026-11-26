package com.pinchdrop.companion.ui

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin
import kotlin.random.Random

/**
 * v2 · Each animation pack's vibration and sound on the phone, matched to the PC's (Pill Studio).
 * Sounds are synthesized on the fly (no audio files). Follows the phone's "Arrival sound" and
 * "Vibrate" settings.
 */
object PackFeedback {

    // ---------------------------------------------------------------- vibration

    /** (timings ms, amplitudes 0–255): off/on pairs, starting with a pause. */
    private val PATTERNS: Map<String, Pair<LongArray, IntArray>> = mapOf(
        "plane" to (longArrayOf(0, 20, 60, 20, 140, 45) to intArrayOf(0, 70, 0, 70, 0, 200)),
        "portal" to (longArrayOf(0, 40, 40, 40, 40, 40, 40, 70) to intArrayOf(0, 40, 0, 90, 0, 150, 0, 255)),
        "comet" to (longArrayOf(0, 12, 30, 12, 30, 90) to intArrayOf(0, 60, 0, 120, 0, 255)),
        "blackhole" to (longArrayOf(0, 220, 80, 45) to intArrayOf(0, 45, 0, 255)),
        "origami" to (longArrayOf(0, 15, 55, 15, 55, 15, 55, 45) to intArrayOf(0, 70, 0, 70, 0, 70, 0, 180)),
        "pixel" to (longArrayOf(0, 12, 25, 12, 25, 12, 25, 12, 25, 35) to intArrayOf(0, 150, 0, 150, 0, 150, 0, 150, 0, 255)),
        "ink" to (longArrayOf(0, 60, 90, 35) to intArrayOf(0, 190, 0, 90)),
        "liquid" to (longArrayOf(0, 30, 25, 40, 25, 60, 25, 90) to intArrayOf(0, 50, 0, 80, 0, 110, 0, 160)),
    )

    private fun vibrator(context: Context): Vibrator? =
        if (Build.VERSION.SDK_INT >= 31) context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        else @Suppress("DEPRECATION") context.getSystemService(Vibrator::class.java)

    fun vibrate(context: Context, fx: String) {
        val (t, a) = PATTERNS[fx] ?: return
        val v = vibrator(context) ?: return
        if (!v.hasVibrator()) return
        runCatching {
            v.vibrate(if (v.hasAmplitudeControl()) VibrationEffect.createWaveform(t, a, -1) else VibrationEffect.createWaveform(t, -1))
        }
    }

    // ---------------------------------------------------------------- sound

    private const val RATE = 22050

    private class Voice(
        val at: Double, val ms: Double, val vol: Double,
        val f0: Double, val f1: Double = f0,
        val wave: Char = 's', // s = sine, q = square, t = triangle, n = noise
    )

    private fun chord(at: Double, vararg f: Double) = f.mapIndexed { i, x -> Voice(at + i * 0.045, 550.0, 0.14, x) }

    /** The arrival sound of each pack (the departure plays the same, a touch faster). */
    private fun voices(fx: String): List<Voice> = when (fx) {
        "plane" -> listOf(Voice(0.0, 650.0, 0.22, 600.0, 2200.0, 'n')) + chord(0.7, 784.0, 988.0, 1319.0)
        "portal" -> listOf(Voice(0.0, 1000.0, 0.22, 140.0, 620.0), Voice(0.05, 900.0, 0.08, 280.0, 1240.0, 't')) + chord(0.75, 523.0, 659.0, 988.0)
        "comet" -> listOf(Voice(0.0, 450.0, 0.25, 3800.0, 900.0, 'n')) +
            (0..3).map { Voice(0.05 + it * 0.08, 110.0, 0.07, 1800.0 + it * 300) } +
            listOf(Voice(0.45, 280.0, 0.3, 220.0, 90.0))
        "blackhole" -> listOf(Voice(0.0, 450.0, 0.35, 60.0, 300.0), Voice(0.1, 500.0, 0.12, 200.0, 2600.0, 'n')) + chord(0.6, 392.0, 494.0, 740.0)
        "origami" -> (0..4).map { Voice(it * 0.12, 80.0, 0.16, 2600.0, 4800.0, 'n') } + listOf(Voice(0.68, 500.0, 0.12, 1047.0))
        "pixel" -> listOf(523.0, 659.0, 784.0, 880.0, 1047.0).mapIndexed { i, f -> Voice(i * 0.07, 85.0, 0.06, f, f, 'q') }
        "ink" -> listOf(Voice(0.2, 160.0, 0.22, 900.0, 300.0), Voice(0.45, 140.0, 0.13, 600.0, 240.0), Voice(0.4, 600.0, 0.08, 500.0, 200.0, 'n'))
        "liquid" -> listOf(Voice(0.0, 800.0, 0.18, 300.0, 1200.0, 'n')) + (0..3).map { Voice(0.2 + it * 0.14, 90.0, 0.11, 500.0 + (it * 173) % 400, 900.0) }
        else -> emptyList()
    }

    private fun render(vs: List<Voice>, speed: Double): ShortArray {
        if (vs.isEmpty()) return ShortArray(0)
        val end = vs.maxOf { it.at / speed + it.ms / 1000.0 / speed } + 0.05
        val n = (end * RATE).toInt()
        val buf = DoubleArray(n)
        val rnd = Random(7)
        for (v in vs) {
            val start = (v.at / speed * RATE).toInt()
            val len = (v.ms / 1000.0 / speed * RATE).toInt().coerceAtLeast(1)
            var phase = 0.0
            var lp = 0.0
            for (i in 0 until len) {
                val k = start + i
                if (k >= n) break
                val p = i.toDouble() / len
                val f = v.f0 * Math.pow(v.f1 / v.f0, p)
                phase += 2 * PI * f / RATE
                val env = (1 - exp(-i / (RATE * 0.006))) * exp(-4.5 * p)
                val s = when (v.wave) {
                    'q' -> if (sin(phase) >= 0) 0.6 else -0.6
                    't' -> 2 / PI * Math.asin(sin(phase))
                    'n' -> { // noise, softened towards the sweep frequency (one-pole low-pass)
                        val a = (2 * PI * f / RATE).coerceAtMost(1.0)
                        lp += a * ((rnd.nextDouble() * 2 - 1) - lp); lp * 1.6
                    }
                    else -> sin(phase)
                }
                buf[k] += s * env * v.vol
            }
        }
        return ShortArray(n) { (buf[it].coerceIn(-1.0, 1.0) * 26000).toInt().toShort() }
    }

    fun sound(fx: String, departure: Boolean = false) {
        val pcm = render(voices(fx), if (departure) 1.25 else 1.0)
        if (pcm.isEmpty()) return
        Thread {
            runCatching {
                val track = AudioTrack.Builder()
                    .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                    .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(RATE).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .setBufferSizeInBytes(pcm.size * 2)
                    .build()
                track.write(pcm, 0, pcm.size)
                track.play()
                Thread.sleep(pcm.size * 1000L / RATE + 100)
                track.release()
            }
        }.start()
    }

    /** A send landed on this phone. */
    fun arrival(context: Context, fx: String, sound: Boolean, vibrate: Boolean) {
        if (fx !in KNOWN_PACKS) return
        if (vibrate) vibrate(context, fx)
        if (sound) sound(fx)
    }

    /** The PC caught what this phone lifted (phone -> PC). */
    fun departure(context: Context, fx: String, sound: Boolean, vibrate: Boolean) {
        if (fx !in KNOWN_PACKS) return
        if (vibrate) vibrate(context, fx)
        if (sound) sound(fx, departure = true)
    }
}
