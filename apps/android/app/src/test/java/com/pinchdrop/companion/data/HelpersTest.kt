package com.pinchdrop.companion.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HelpersTest {
    @Test
    fun initialsMatchDesktop() {
        assertEquals("P8", initials("Pixel 8"))
        assertEquals("MP", initials("my phone"))
        assertEquals("GA", initials("Galaxy"))
        assertEquals("?", initials("   "))
    }

    @Test
    fun formatBytesMatchesDesktop() {
        assertEquals("512 B", formatBytes(512))
        assertEquals("1 KB", formatBytes(1024))
        assertEquals("4.2 MB", formatBytes((4.2 * 1024 * 1024).toLong()))
        assertEquals("48 MB", formatBytes(48L * 1024 * 1024))
        assertEquals("2 GB", formatBytes(2L * 1024 * 1024 * 1024))
    }

    @Test
    fun destinationsByKind() {
        assertEquals(ItemKind.PHOTO, Destinations.kindOf("trip.JPG"))
        assertEquals(ItemKind.VIDEO, Destinations.kindOf("clip.mp4"))
        assertEquals(ItemKind.FILE, Destinations.kindOf("notes.txt"))
        assertEquals(ItemKind.FILE, Destinations.kindOf("Makefile"))
        assertEquals(ItemKind.FOLDER, Destinations.kindOf("CPP", isDir = true))
        assertEquals("Pictures/PinchDrop", Destinations.folderFor(ItemKind.PHOTO))
        assertEquals("Download/PinchDrop", Destinations.folderFor(ItemKind.FOLDER))
    }

    @Test
    fun unknownEnumFallsBackToDefault() {
        assertEquals(HandDetection.NORMAL, enumOr("BOGUS", HandDetection.NORMAL))
        assertEquals(HandDetection.STRICT, enumOr("STRICT", HandDetection.NORMAL))
        assertEquals(ThemeMode.DARK, enumOr(null, ThemeMode.DARK))
    }

    @Test
    fun demoPcOnlyWhenAsked() {
        assertFalse(PcStatus.current(false).paired)
        val demo = PcStatus.current(true)
        assertTrue(demo.paired && demo.isDemo)
    }
}
