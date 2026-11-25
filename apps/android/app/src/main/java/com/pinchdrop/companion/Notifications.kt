package com.pinchdrop.companion

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * Notification channels and the "something is in the air" alert.
 *
 * Android does not let an app open the camera by itself from the background, so when the PC
 * holds something for this phone we show a high-priority alert; tapping Catch opens the Catch
 * screen. In Phase 2 the only way to trigger it is the clearly-labelled preview in Settings.
 */
object Notifications {
    const val EXTRA_OPEN = "pinchdrop.open"
    const val ROUTE_CATCH_DEMO = "catch_demo"
    const val ROUTE_RECEIVING_DEMO = "receiving_demo"

    private const val CH_INCOMING = "incoming"
    private const val CH_PROGRESS = "progress"
    const val CH_CONNECTION = "connection"
    private const val CH_ARRIVED = "arrived"
    const val ROUTE_RECEIVING = "receiving"
    const val ROUTE_RECEIVED = "received"
    private const val ID_INCOMING_DEMO = 1001
    private const val ID_OFFER = 1002
    private const val ID_PROGRESS = 1003
    private const val ID_HOLD = 1004
    const val ROUTE_CATCH = "catch"
    private var nextArrivedId = 1100

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CH_INCOMING, "Incoming from your PC", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Alerts when your PC is holding something for this phone"
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_PROGRESS, "Transfer progress", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Progress while files are arriving"
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_ARRIVED, "Arrived", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "When something from your PC has finished arriving"
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_CONNECTION, "Connection to your PC", NotificationManager.IMPORTANCE_MIN).apply {
                description = "Shown while PinchDrop stays connected in the background"
                setShowBadge(false)
            },
        )
    }

    fun canPost(context: Context): Boolean =
        (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            NotificationManagerCompat.from(context).areNotificationsEnabled()

    private fun openApp(context: Context, route: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(EXTRA_OPEN, route)
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** Posts the demo "CPP is in the air" alert. Returns false if notifications are not allowed. */
    fun postIncomingDemo(context: Context, pcName: String): Boolean {
        if (!canPost(context)) return false
        ensureChannels(context)
        val n = NotificationCompat.Builder(context, CH_INCOMING)
            .setSmallIcon(R.drawable.ic_stat_pinchdrop)
            .setContentTitle("“CPP” is in the air (demo)")
            .setContentText("$pcName is holding a folder · 12 files · 48 MB. Catch it within 30 s.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setTimeoutAfter(30_000)
            .setContentIntent(openApp(context, ROUTE_CATCH_DEMO, 1))
            .addAction(0, "Catch", openApp(context, ROUTE_CATCH_DEMO, 2))
            .addAction(0, "Just accept", openApp(context, ROUTE_RECEIVING_DEMO, 3))
            .build()
        @Suppress("MissingPermission") // checked in canPost()
        NotificationManagerCompat.from(context).notify(ID_INCOMING_DEMO, n)
        return true
    }

    @Suppress("MissingPermission") // every caller path checks canPost()
    private fun post(context: Context, id: Int, n: android.app.Notification) {
        if (!canPost(context)) return
        ensureChannels(context)
        NotificationManagerCompat.from(context).notify(id, n)
    }

    /** A real send is waiting for the user to accept ("Manual sends: Ask me first"). */
    fun postOffer(context: Context, pcName: String, label: String, files: Int, bytes: Long) {
        post(context, ID_OFFER, NotificationCompat.Builder(context, CH_INCOMING)
            .setSmallIcon(R.drawable.ic_stat_pinchdrop)
            .setContentTitle("$pcName wants to send “$label”")
            .setContentText(if (files > 0) "$files file${if (files == 1) "" else "s"} · ${com.pinchdrop.companion.data.formatBytes(bytes)} — tap to accept or decline" else "Tap to accept or decline")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openApp(context, ROUTE_RECEIVING, 10))
            .build())
    }

    fun cancelOffer(context: Context) = NotificationManagerCompat.from(context).cancel(ID_OFFER)

    /** A link arrived while PinchDrop wasn't on screen: one tap opens it. */
    fun postLink(context: Context, pcName: String, url: String) {
        val open = PendingIntent.getActivity(
            context, url.hashCode(), Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        post(context, nextArrivedId++, NotificationCompat.Builder(context, CH_ARRIVED)
            .setSmallIcon(R.drawable.ic_stat_pinchdrop)
            .setContentTitle("Link from $pcName — tap to open")
            .setContentText(url)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build())
    }

    /** The PC is holding something for this phone: tap to open the Catch screen. */
    fun postHold(context: Context, pcName: String, label: String, files: Long, bytes: Long, secs: Int) {
        post(context, ID_HOLD, NotificationCompat.Builder(context, CH_INCOMING)
            .setSmallIcon(R.drawable.ic_stat_pinchdrop)
            .setContentTitle("“$label” is in the air")
            .setContentText(
                if (files == 0L) "$pcName is holding a link or note. Catch it within $secs s."
                else "$pcName is holding $files file${if (files == 1L) "" else "s"} · ${com.pinchdrop.companion.data.formatBytes(bytes)}. Catch it within $secs s.",
            )
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setTimeoutAfter(secs * 1000L)
            .setContentIntent(openApp(context, ROUTE_CATCH, 20))
            .addAction(0, "Catch", openApp(context, ROUTE_CATCH, 21))
            .build())
    }

    fun cancelHold(context: Context) = NotificationManagerCompat.from(context).cancel(ID_HOLD)

    fun postProgress(context: Context, label: String, pcName: String, done: Long, total: Long) {
        val pct = if (total > 0) (done * 100 / total).toInt() else 0
        post(context, ID_PROGRESS, NotificationCompat.Builder(context, CH_PROGRESS)
            .setSmallIcon(R.drawable.ic_stat_pinchdrop)
            .setContentTitle("Receiving “$label”")
            .setContentText("From $pcName · $pct%")
            .setProgress(100, pct, false)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(openApp(context, ROUTE_RECEIVING, 11))
            .build())
    }

    fun cancelProgress(context: Context) = NotificationManagerCompat.from(context).cancel(ID_PROGRESS)

    fun postArrived(context: Context, title: String, text: String) {
        post(context, nextArrivedId++, NotificationCompat.Builder(context, CH_ARRIVED)
            .setSmallIcon(R.drawable.ic_stat_pinchdrop)
            .setContentTitle(title)
            .setContentText(text)
            .setAutoCancel(true)
            .setContentIntent(openApp(context, ROUTE_RECEIVED, 12))
            .build())
    }

    fun cancelIncomingDemo(context: Context) {
        NotificationManagerCompat.from(context).cancel(ID_INCOMING_DEMO)
    }
}
