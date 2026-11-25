package com.pinchdrop.companion.link

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.pinchdrop.companion.MainActivity
import com.pinchdrop.companion.Notifications
import com.pinchdrop.companion.R
import com.pinchdrop.companion.data.SettingsStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * "Stay connected in background": keeps the link to the paired PC open while the
 * app is closed, so the PC's pill shows this phone's battery and can reach it.
 * Shows a quiet, ongoing notification as Android requires.
 */
class LinkService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        PcLink.init(this)
        Notifications.ensureChannels(this)
        val type = if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE else 0
        runCatching { ServiceCompat.startForeground(this, NOTIFICATION_ID, build(PcLink.state.value), type) }
            .onFailure { stopSelf(); return }
        PcLink.setBackground(true)
        scope.launch {
            PcLink.state.collect { s ->
                if (s is PcLink.State.Unpaired) {
                    stopSelf()
                } else if (Notifications.canPost(this@LinkService)) {
                    @Suppress("MissingPermission")
                    NotificationManagerCompat.from(this@LinkService).notify(NOTIFICATION_ID, build(s))
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        PcLink.setBackground(false)
        scope.cancel()
        super.onDestroy()
    }

    private fun build(s: PcLink.State): Notification {
        val text = when (s) {
            is PcLink.State.Connected -> "Connected to ${s.pcName}"
            is PcLink.State.Connecting -> "Connecting to ${s.pcName}…"
            is PcLink.State.Offline -> "Waiting for ${s.pcName} on this Wi-Fi"
            PcLink.State.Unpaired -> "Not paired"
        }
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, Notifications.CH_CONNECTION)
            .setSmallIcon(R.drawable.ic_stat_pinchdrop)
            .setContentTitle("PinchDrop")
            .setContentText(text)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(open)
            .build()
    }

    companion object {
        private const val NOTIFICATION_ID = 2001

        /** Starts or stops the service to match "Stay connected in background" and pairing. */
        fun sync(context: Context, stayConnected: Boolean, paired: Boolean) {
            val intent = Intent(context, LinkService::class.java)
            if (stayConnected && paired) {
                runCatching { ContextCompat.startForegroundService(context, intent) }
            } else {
                context.stopService(intent)
            }
        }
    }
}

/** Restarts the background link after the phone reboots, if the user wants it. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val stay = SettingsStore(context).settings.first().stayConnected
                val paired = PairedPcStore(context).current() != null
                LinkService.sync(context, stay, paired)
            } finally {
                pending.finish()
            }
        }
    }
}
