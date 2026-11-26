package com.pinchdrop.companion.transfer

import com.pinchdrop.companion.data.ItemKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SaverTest {
    @Test
    fun aFolderPickedOnThePcIsUsedOnlyWhenSafe() {
        assertEquals(listOf("DCIM", "Camera"), Saver.folderOf("folder:DCIM/Camera"))
        assertEquals(emptyList<String>(), Saver.folderOf("folder:"))
        assertNull(Saver.folderOf("folder:../Android/data"))
        assertNull(Saver.folderOf("auto"))
        val p = Saver.place(listOf("CPP", "main.cpp"), "folder:Documents")
        assertEquals("Documents/CPP", p.relativeDir)
        assertTrue(p.direct)
    }

    @Test
    fun rejectsPathsThatCouldEscape() {
        assertNull(Saver.safeSegments("../etc/passwd"))
        assertNull(Saver.safeSegments("CPP/../../x"))
        assertNull(Saver.safeSegments("/abs/path"))
        assertNull(Saver.safeSegments("a//b"))
        assertNull(Saver.safeSegments("a\\b")) // a Windows backslash must not sneak in
        assertNull(Saver.safeSegments(""))
        assertNull(Saver.safeSegments("./x"))
    }

    @Test
    fun keepsFolderStructureAndCleansOddCharacters() {
        assertEquals(listOf("CPP", "src", "main.cpp"), Saver.safeSegments("CPP/src/main.cpp"))
        assertEquals(listOf("what_.txt"), Saver.safeSegments("what?.txt"))
    }

    @Test
    fun loosePhotosGoToGalleryEverythingElseToDownloads() {
        val photo = Saver.place(listOf("trip.jpg"), "auto")
        assertEquals("Pictures/PinchDrop", photo.relativeDir)
        assertEquals(ItemKind.PHOTO, photo.kind)
        assertEquals("Movies/PinchDrop", Saver.place(listOf("clip.mp4"), "auto").relativeDir)
        // A photo inside a folder stays with its folder.
        assertEquals("Download/PinchDrop/CPP/img", Saver.place(listOf("CPP", "img", "a.png"), "auto").relativeDir)
        // "Everything to Downloads" on the PC overrides the Gallery.
        assertEquals("Download/PinchDrop", Saver.place(listOf("trip.jpg"), "downloads").relativeDir)
        assertEquals("Downloads/PinchDrop/CPP", Saver.place(listOf("CPP", "a.txt"), "auto").label)
    }
}
