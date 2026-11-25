package com.pinchdrop.companion.data

/**
 * The PC this phone is paired with, as the screens show it. A real pairing (Phase 3) wins;
 * otherwise the clearly-marked demo PC appears only when the user turns it on.
 */
data class PcStatus(
    val paired: Boolean,
    val connected: Boolean,
    val name: String,
    val network: String?,
    val isDemo: Boolean,
    /** True while reconnecting to a paired PC that isn't reachable yet. */
    val connecting: Boolean = false,
) {
    companion object {
        val NONE = PcStatus(paired = false, connected = false, name = "", network = null, isDemo = false)
        val DEMO = PcStatus(paired = true, connected = true, name = "Demo laptop", network = "Home Wi-Fi", isDemo = true)

        fun current(demoEnabled: Boolean): PcStatus = if (demoEnabled) DEMO else NONE
    }
}

/** Where a received item lands on the phone, by kind. Same rules as the desktop Send screen. */
enum class ItemKind { PHOTO, VIDEO, FILE, FOLDER, TEXT }

object Destinations {
    private val photo = setOf("jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp")
    private val video = setOf("mp4", "mov", "mkv", "webm", "avi", "3gp", "m4v")

    fun kindOf(name: String, isDir: Boolean = false): ItemKind {
        if (isDir) return ItemKind.FOLDER
        val ext = name.substringAfterLast('.', "").lowercase()
        return when (ext) {
            in photo -> ItemKind.PHOTO
            in video -> ItemKind.VIDEO
            else -> ItemKind.FILE
        }
    }

    fun folderFor(kind: ItemKind): String = when (kind) {
        ItemKind.PHOTO -> "Pictures/PinchDrop"
        ItemKind.VIDEO -> "Movies/PinchDrop"
        ItemKind.FILE, ItemKind.FOLDER -> "Download/PinchDrop"
        ItemKind.TEXT -> "Clipboard"
    }

    fun labelFor(kind: ItemKind): String = when (kind) {
        ItemKind.PHOTO -> "Gallery › PinchDrop"
        ItemKind.VIDEO -> "Gallery › Movies"
        ItemKind.FILE, ItemKind.FOLDER -> "Downloads/PinchDrop"
        ItemKind.TEXT -> "Clipboard"
    }
}
