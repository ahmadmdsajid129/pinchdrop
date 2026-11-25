package com.pinchdrop.companion

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pinchdrop.companion.data.AppSettings
import com.pinchdrop.companion.data.PcStatus
import com.pinchdrop.companion.data.SettingsStore
import com.pinchdrop.companion.link.LinkService
import com.pinchdrop.companion.link.PcLink
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val store = SettingsStore(app)

    /** null until the first read finishes, so the UI doesn't flash onboarding for returning users. */
    val settings: StateFlow<AppSettings?> = store.settings
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    init {
        PcLink.init(app)
        // Keep the background service in step with "Stay connected in background" and pairing.
        viewModelScope.launch {
            combine(settings.filterNotNull(), PcLink.state) { s, link -> s.stayConnected to (link !is PcLink.State.Unpaired) }
                .distinctUntilChanged()
                .collect { (stay, paired) -> LinkService.sync(app, stay, paired) }
        }
    }

    /** A real paired PC wins; otherwise the demo PC if the user turned it on. */
    val pc: StateFlow<PcStatus> = combine(store.settings, PcLink.state) { s, link ->
        when (link) {
            PcLink.State.Unpaired -> PcStatus.current(s.demoPc)
            is PcLink.State.Connected -> PcStatus(paired = true, connected = true, name = link.pcName, network = "Wi-Fi", isDemo = false)
            is PcLink.State.Connecting -> PcStatus(true, false, link.pcName, null, false, connecting = true)
            is PcLink.State.Offline -> PcStatus(true, false, link.pcName, null, false)
        }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, PcStatus.NONE)

    val pairing = PcLink.pairing
    val notice = PcLink.notice

    fun update(change: (AppSettings) -> AppSettings) {
        viewModelScope.launch { store.update(change) }
    }

    fun reset() {
        if (PcLink.state.value !is PcLink.State.Unpaired) PcLink.unpair()
        viewModelScope.launch { store.reset() }
    }
}
