package com.pinchdrop.companion

import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.Toast
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.N)
class GrabTileService : TileService() {

    override fun onClick() {
        super.onClick()

        // Simulate grabbing latest photo and dispatching to PC
        Toast.makeText(this, "Held latest photo ✓ — Catch on PC", Toast.LENGTH_SHORT).show()

        val tile = qsTile
        if (tile != null) {
            tile.state = Tile.STATE_ACTIVE
            tile.updateTile()
        }
    }

    override fun onStartListening() {
        super.onStartListening()
        val tile = qsTile
        if (tile != null) {
            tile.state = Tile.STATE_INACTIVE
            tile.label = "Grab to PC"
            tile.updateTile()
        }
    }
}
