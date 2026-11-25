package com.pinchdrop.companion.ui

import com.pinchdrop.companion.ui.screens.LiveReceivingScreen
import com.pinchdrop.companion.data.formatBytes
import com.pinchdrop.companion.transfer.Receiver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.remember
import androidx.compose.material3.TextButton
import androidx.compose.material3.AlertDialog
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.pinchdrop.companion.Notifications
import com.pinchdrop.companion.data.AppSettings
import com.pinchdrop.companion.data.PcStatus
import com.pinchdrop.companion.ui.screens.ArrivedScreen
import com.pinchdrop.companion.ui.screens.CatchScreen
import com.pinchdrop.companion.ui.screens.HomeScreen
import com.pinchdrop.companion.ui.screens.PairScreen
import com.pinchdrop.companion.ui.screens.PermissionsScreen
import com.pinchdrop.companion.ui.screens.ProfileScreen
import com.pinchdrop.companion.ui.screens.ReceivedScreen
import com.pinchdrop.companion.ui.screens.ReceivingScreen
import com.pinchdrop.companion.ui.screens.SettingsScreen
import com.pinchdrop.companion.ui.screens.WelcomeScreen
import com.pinchdrop.companion.ui.theme.Pd
import com.pinchdrop.companion.ui.theme.PinchDropTheme
import com.pinchdrop.companion.data.ThemeMode

/** Every screen of the phone app. Tabs have a bottom bar; the rest are full-screen. */
enum class Route(val tab: Boolean = false) {
    WELCOME, PERMISSIONS, ONBOARD_PAIR,
    HOME(tab = true), RECEIVED(tab = true), SETTINGS(tab = true),
    PAIR, PROFILE, PERMISSIONS_CHECK,
    CATCH_DEMO, RECEIVING_DEMO, ARRIVED_DEMO,
    RECEIVING, ARRIVED, CATCH,
}

/** Where the system back gesture goes from each screen (null = leave the app). */
private fun backOf(r: Route): Route? = when (r) {
    Route.WELCOME, Route.HOME -> null
    Route.PERMISSIONS -> Route.WELCOME
    Route.ONBOARD_PAIR -> Route.PERMISSIONS
    Route.RECEIVED, Route.SETTINGS, Route.RECEIVING, Route.CATCH -> Route.HOME
    Route.ARRIVED -> Route.RECEIVED
    Route.PAIR, Route.PROFILE, Route.PERMISSIONS_CHECK, Route.CATCH_DEMO, Route.RECEIVING_DEMO, Route.ARRIVED_DEMO -> Route.SETTINGS
}

@Composable
fun PinchDropApp(
    settings: AppSettings?,
    pc: PcStatus,
    update: ((AppSettings) -> AppSettings) -> Unit,
    reset: () -> Unit,
    pendingRoute: String?,
    consumeRoute: () -> Unit,
    notice: String? = null,
    clearNotice: () -> Unit = {},
) {
    PinchDropTheme(settings?.theme ?: ThemeMode.DARK) {
        val c = Pd.colors
        if (settings == null) {
            Box(Modifier.fillMaxSize().background(c.bg))
            return@PinchDropTheme
        }

        var route by rememberSaveable { mutableStateOf(if (settings.onboarded) Route.HOME else Route.WELCOME) }
        // Where to come back to from a demo screen opened by a notification.
        var demoReturn by rememberSaveable { mutableStateOf(Route.SETTINGS) }

        LaunchedEffect(settings.onboarded) {
            if (!settings.onboarded && route.tab) route = Route.WELCOME
        }
        // A real arrival to show on the Arrived screen.
        var arrived by remember { mutableStateOf<Receiver.Arrived?>(null) }
        val progress by Receiver.progress.collectAsStateWithLifecycle()
        val offer by Receiver.incoming.collectAsStateWithLifecycle()
        val hold by Receiver.hold.collectAsStateWithLifecycle()

        // The PC is holding something for us: show the Catch screen straight away (the app is open).
        LaunchedEffect(hold?.id) {
            if (hold != null && settings.onboarded && route != Route.CATCH) route = Route.CATCH
        }
        var shownTransfer by rememberSaveable { mutableStateOf<String?>(null) }

        // When a transfer starts, show the Receiving screen once (unless the user is mid-setup).
        LaunchedEffect(progress?.id, progress?.paused) {
            val p = progress ?: return@LaunchedEffect
            if (!p.paused && p.id != shownTransfer && settings.onboarded && (route.tab || route == Route.ARRIVED)) {
                shownTransfer = p.id
                route = Route.RECEIVING
            }
        }
        LaunchedEffect(Unit) {
            Receiver.arrivals.collect { a ->
                if (settings.onboarded) {
                    arrived = a
                    route = Route.ARRIVED
                }
            }
        }

        LaunchedEffect(pendingRoute) {
            when (pendingRoute) {
                Notifications.ROUTE_RECEIVING -> if (settings.onboarded) route = if (Receiver.progress.value != null) Route.RECEIVING else Route.HOME
                Notifications.ROUTE_RECEIVED -> if (settings.onboarded) route = Route.RECEIVED
                Notifications.ROUTE_CATCH -> if (settings.onboarded) route = if (Receiver.hold.value != null) Route.CATCH else Route.HOME
                Notifications.ROUTE_CATCH_DEMO -> { demoReturn = if (route.tab) route else Route.HOME; route = Route.CATCH_DEMO }
                Notifications.ROUTE_RECEIVING_DEMO -> { demoReturn = if (route.tab) route else Route.HOME; route = Route.RECEIVING_DEMO }
            }
            if (pendingRoute != null) consumeRoute()
        }

        val go: (Route) -> Unit = { route = it }
        val back = {
            val target = when (route) {
                Route.CATCH_DEMO, Route.RECEIVING_DEMO, Route.ARRIVED_DEMO -> demoReturn
                else -> backOf(route)
            }
            if (target != null) route = target
        }
        BackHandler(enabled = backOf(route) != null) { back() }

        val finishOnboarding = {
            update { it.copy(onboarded = true) }
            route = Route.HOME
        }
        val openDemo: (Route) -> Unit = { r -> demoReturn = Route.SETTINGS; route = r }

        Scaffold(
            containerColor = c.bg,
            bottomBar = { if (route.tab) BottomBar(route, go) },
        ) { pad ->
            offer?.let { o ->
                AlertDialog(
                    onDismissRequest = {},
                    title = { Text("${o.pcName} wants to send “${o.label}”") },
                    text = {
                        Text(
                            listOfNotNull(
                                if (o.files.isNotEmpty()) "${o.files.size} file${if (o.files.size == 1) "" else "s"} · ${formatBytes(o.totalBytes)}" else null,
                                if (o.texts.isNotEmpty()) "${o.texts.size} note${if (o.texts.size == 1) "" else "s"}" else null,
                            ).joinToString(" · "),
                        )
                    },
                    confirmButton = { TextButton(onClick = { Receiver.accept(o) }) { Text("Accept", color = c.accent) } },
                    dismissButton = { TextButton(onClick = { Receiver.decline(o) }) { Text("Decline", color = c.muted) } },
                    containerColor = c.surface, titleContentColor = c.text, textContentColor = c.soft,
                )
            }
            Box(Modifier.fillMaxSize().padding(pad).consumeWindowInsets(pad).imePadding()) {
                AnimatedContent(targetState = route, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "route") { r ->
                    Column(Modifier.fillMaxSize().background(c.bg)) {
                        when (r) {
                            Route.WELCOME -> WelcomeScreen(onStart = { go(Route.PERMISSIONS) })
                            Route.PERMISSIONS -> PermissionsScreen(step = "STEP 1 OF 2", onContinue = { go(Route.ONBOARD_PAIR) }, onBack = back)
                            Route.ONBOARD_PAIR -> PairScreen(
                                settings = settings, update = update, onboarding = true,
                                onDone = finishOnboarding, onBack = back,
                            )
                            Route.HOME -> HomeScreen(
                                settings, pc, notice = notice, clearNotice = clearNotice,
                                onPair = { go(Route.PAIR) }, onSeeAll = { go(Route.RECEIVED) }, onProfile = { go(Route.PROFILE) },
                            )
                            Route.RECEIVED -> ReceivedScreen()
                            Route.SETTINGS -> SettingsScreen(
                                settings = settings, pc = pc, update = update,
                                onPair = { go(Route.PAIR) }, onProfile = { go(Route.PROFILE) },
                                onPermissions = { go(Route.PERMISSIONS_CHECK) }, onDemo = openDemo,
                            )
                            Route.PAIR -> PairScreen(settings = settings, update = update, onboarding = false, onDone = back, onBack = back)
                            Route.PROFILE -> ProfileScreen(settings, update, onReset = { reset(); route = Route.WELCOME }, onBack = back)
                            Route.PERMISSIONS_CHECK -> PermissionsScreen(step = null, onContinue = back, onBack = back)
                            Route.CATCH_DEMO -> CatchScreen(
                                pcName = pc.name.ifEmpty { "Demo laptop" }, settings = settings,
                                onAccept = { go(Route.RECEIVING_DEMO) }, onDecline = back,
                            )
                            Route.RECEIVING_DEMO -> ReceivingScreen(
                                pcName = pc.name.ifEmpty { "Demo laptop" },
                                onDone = { go(Route.ARRIVED_DEMO) }, onHide = back, onCancel = back,
                            )
                            Route.ARRIVED_DEMO -> ArrivedScreen(settings = settings, pcName = pc.name.ifEmpty { "Demo laptop" }, onClose = back)
                            Route.CATCH -> {
                                val h = hold
                                if (h == null) LaunchedEffect(Unit) { go(Route.HOME) }
                                else CatchScreen(
                                    pcName = h.pcName, hold = h, settings = settings,
                                    onAccept = { Receiver.catchHold(); go(Route.HOME) },
                                    onDecline = { Receiver.dismissHold(); go(Route.HOME) },
                                )
                            }
                            Route.RECEIVING -> LiveReceivingScreen(onHide = { go(Route.HOME) }, onCancel = { Receiver.cancelCurrent(); go(Route.HOME) })
                            Route.ARRIVED -> {
                                val a = arrived
                                if (a == null) LaunchedEffect(Unit) { go(Route.RECEIVED) }
                                else ArrivedScreen(settings = settings, pcName = a.pcName, onClose = { go(Route.RECEIVED) }, arrived = a)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BottomBar(route: Route, go: (Route) -> Unit) {
    val c = Pd.colors
    NavigationBar(containerColor = c.bg2) {
        val items: List<Triple<Route, String, ImageVector>> = listOf(
            Triple(Route.HOME, "Home", Icons.Filled.Home),
            Triple(Route.RECEIVED, "Received", Icons.Filled.Inventory2),
            Triple(Route.SETTINGS, "Settings", Icons.Filled.Settings),
        )
        items.forEach { (r, label, icon) ->
            NavigationBarItem(
                selected = route == r,
                onClick = { go(r) },
                icon = { Icon(icon, contentDescription = null) },
                label = { Text(label) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = Color.White,
                    selectedTextColor = c.text,
                    indicatorColor = c.primary,
                    unselectedIconColor = c.muted,
                    unselectedTextColor = c.muted,
                ),
            )
        }
    }
}
