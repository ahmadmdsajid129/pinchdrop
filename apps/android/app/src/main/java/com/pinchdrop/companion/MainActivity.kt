package com.pinchdrop.companion

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pinchdrop.companion.link.PcLink
import com.pinchdrop.companion.ui.PinchDropApp

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()

    /** A screen another part of the app (e.g. a notification) asked us to open. Consumed once by the UI. */
    private var pendingRoute by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        PcLink.init(this)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        if (savedInstanceState == null) pendingRoute = intent?.getStringExtra(Notifications.EXTRA_OPEN)

        setContent {
            val settings by vm.settings.collectAsStateWithLifecycle()
            val pc by vm.pc.collectAsStateWithLifecycle()
            val notice by vm.notice.collectAsStateWithLifecycle()
            PinchDropApp(
                settings = settings,
                pc = pc,
                update = vm::update,
                reset = vm::reset,
                pendingRoute = pendingRoute,
                consumeRoute = { pendingRoute = null },
                notice = notice,
                clearNotice = PcLink::clearNotice,
            )
        }
    }

    // The link stays up while the app is on screen; the background service keeps it up otherwise.
    override fun onStart() {
        super.onStart()
        PcLink.setForeground(true)
    }

    override fun onStop() {
        PcLink.setForeground(false)
        super.onStop()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(Notifications.EXTRA_OPEN)?.let { pendingRoute = it }
    }
}
