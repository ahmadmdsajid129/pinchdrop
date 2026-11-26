package com.pinchdrop.companion.phone

import android.Manifest
import android.annotation.SuppressLint
import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.util.Size
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * v2 · Where the phone is, for the PC's map. Sent about once a minute while connected (only
 * with "Location on your PC" allowed); with "Allow all the time" it keeps working in the
 * background. The PC keeps the last place it saw, so a lost phone's last spot is known.
 */
object LocationWatcher {
    private const val EVERY_MS = 60_000L
    private val main = Handler(Looper.getMainLooper())
    private var running = false
    private lateinit var app: Context
    private val tick = object : Runnable {
        override fun run() {
            if (!running) return
            sendOnce()
            main.postDelayed(this, EVERY_MS)
        }
    }

    fun start(context: Context) {
        app = context.applicationContext
        if (running) return
        running = true
        main.post(tick)
    }

    fun stop() {
        running = false
        main.removeCallbacks(tick)
    }

    @SuppressLint("MissingPermission")
    private fun sendOnce() {
        if (!app.has(Manifest.permission.ACCESS_FINE_LOCATION) && !app.has(Manifest.permission.ACCESS_COARSE_LOCATION)) return
        val lm = app.getSystemService(LocationManager::class.java) ?: return
        val send = { l: Location? ->
            if (l != null) {
                PhoneData.push(
                    "location",
                    JSONObject().put("lat", l.latitude).put("lon", l.longitude).put("accuracy", l.accuracy.toDouble()).put("time", l.time),
                )
            }
        }
        val provider = when {
            Build.VERSION.SDK_INT >= 31 && lm.isProviderEnabled(LocationManager.FUSED_PROVIDER) -> LocationManager.FUSED_PROVIDER
            lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            else -> return
        }
        runCatching {
            if (Build.VERSION.SDK_INT >= 30) {
                lm.getCurrentLocation(provider, null, app.mainExecutor) { l -> send(l ?: lm.getLastKnownLocation(provider)) }
            } else {
                send(lm.getLastKnownLocation(provider))
            }
        }
    }
}

/** v2 · The phone's latest photos for the PC's Island strip (small previews only). */
object Photos {
    fun recent(context: Context, limit: Int): JSONArray {
        val perm = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_IMAGES else Manifest.permission.READ_EXTERNAL_STORAGE
        if (!context.has(perm)) throw NoPermission()
        val out = JSONArray()
        val cols = arrayOf(MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.DATE_ADDED, MediaStore.Images.Media.SIZE)
        context.contentResolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cols, null, null, "${MediaStore.Images.Media.DATE_ADDED} DESC",
        )?.use { c ->
            while (c.moveToNext() && out.length() < limit) {
                val id = c.getLong(0)
                val uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                val thumb = runCatching {
                    val b = if (Build.VERSION.SDK_INT >= 29) context.contentResolver.loadThumbnail(uri, Size(192, 192), null)
                    else MediaStore.Images.Thumbnails.getThumbnail(context.contentResolver, id, MediaStore.Images.Thumbnails.MINI_KIND, null)
                    val o = ByteArrayOutputStream()
                    b.compress(Bitmap.CompressFormat.JPEG, 70, o)
                    "data:image/jpeg;base64," + Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP)
                }.getOrNull() ?: continue
                out.put(
                    JSONObject()
                        .put("id", id)
                        .put("name", c.getString(1) ?: "Photo")
                        .put("date", c.getLong(2) * 1000)
                        .put("size", c.getLong(3))
                        .put("thumb", thumb),
                )
            }
        }
        return out
    }

    /** Sends one photo to the PC straight away (it lands and opens there). */
    fun send(context: Context, id: Long) {
        val uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
        com.pinchdrop.companion.transfer.Lifter.sendNow(context, listOf(uri))
    }
}
