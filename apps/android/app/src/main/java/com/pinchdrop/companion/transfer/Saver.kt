package com.pinchdrop.companion.transfer

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import androidx.annotation.RequiresApi
import com.pinchdrop.companion.data.Destinations
import com.pinchdrop.companion.data.ItemKind
import com.pinchdrop.companion.data.NameClash
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream

/**
 * Where received files go and how they're written (LINK-v1 §6.1):
 * a photo/video sent on its own → Gallery (Pictures/PinchDrop, Movies/PinchDrop);
 * everything else → Download/PinchDrop/… keeping the folder structure.
 * Android 10+: MediaStore, no storage permission. Android 8–9: public folders, needs WRITE_EXTERNAL_STORAGE.
 */
object Saver {
    /** Checks a path from the PC: relative, `/`-separated, no `..` or empty parts. Returns cleaned segments. */
    fun safeSegments(path: String): List<String>? {
        if (path.isBlank() || path.startsWith("/") || path.contains('\\')) return null
        val parts = path.split('/')
        if (parts.any { it.isEmpty() || it == "." || it == ".." }) return null
        return parts.map { seg -> seg.map { c -> if (c in "\"*:<>?|" || c.code < 32) '_' else c }.joinToString("").take(200) }
    }

    data class Placement(val kind: ItemKind, val relativeDir: String, val name: String, val label: String)

    fun place(segments: List<String>, destination: String): Placement {
        val name = segments.last()
        val kind = Destinations.kindOf(name)
        val loose = segments.size == 1
        return when {
            destination == "auto" && loose && kind == ItemKind.PHOTO ->
                Placement(kind, "Pictures/PinchDrop", name, Destinations.labelFor(ItemKind.PHOTO))
            destination == "auto" && loose && kind == ItemKind.VIDEO ->
                Placement(kind, "Movies/PinchDrop", name, Destinations.labelFor(ItemKind.VIDEO))
            else -> {
                val dir = (listOf("Download", "PinchDrop") + segments.dropLast(1)).joinToString("/")
                Placement(kind, dir, name, if (loose) "Downloads/PinchDrop" else "Downloads/PinchDrop/${segments.first()}")
            }
        }
    }

    private fun mimeOf(name: String): String =
        MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase()) ?: "application/octet-stream"

    fun needsLegacyPermission(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q

    /** Creates an empty, hidden-until-finished destination. Returns its URI as a string. */
    fun create(context: Context, p: Placement, clash: NameClash): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) createMediaStore(context, p, clash) else createLegacy(p)
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun collection(kind: ItemKind, dir: String): Uri = when {
        dir.startsWith("Pictures/") && kind == ItemKind.PHOTO -> MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        dir.startsWith("Movies/") && kind == ItemKind.VIDEO -> MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        else -> MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun createMediaStore(context: Context, p: Placement, clash: NameClash): String {
        val resolver = context.contentResolver
        val coll = collection(p.kind, p.dir())
        if (clash == NameClash.REPLACE && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // "Replace" never deletes: our own earlier copy goes to the phone's trash (recoverable for 30 days).
            runCatching {
                resolver.query(
                    coll, arrayOf(MediaStore.MediaColumns._ID),
                    "${MediaStore.MediaColumns.DISPLAY_NAME}=? AND ${MediaStore.MediaColumns.RELATIVE_PATH}=?",
                    arrayOf(p.name, p.dir() + "/"), null,
                )?.use { c ->
                    while (c.moveToNext()) {
                        val uri = Uri.withAppendedPath(coll, c.getLong(0).toString())
                        resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_TRASHED, 1) }, null, null)
                    }
                }
            }
        }
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, p.name)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeOf(p.name))
            put(MediaStore.MediaColumns.RELATIVE_PATH, p.dir())
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        // With "keep both", MediaStore itself adds " (1)" when the name is taken.
        val uri = resolver.insert(coll, values) ?: error("Couldn't create ${p.name} on the phone")
        return uri.toString()
    }

    private fun Placement.dir() = relativeDir

    @Suppress("DEPRECATION") // public directories are the only option before Android 10
    private fun createLegacy(p: Placement): String {
        val base = Environment.getExternalStorageDirectory()
        val dir = File(base, p.relativeDir).apply { mkdirs() }
        var f = File(dir, p.name)
        // Android 8–9 has no trash, so "Replace" would mean a permanent delete — keep both instead.
        if (f.exists()) {
            val stem = p.name.substringBeforeLast('.', p.name)
            val ext = p.name.substringAfterLast('.', "").let { if (it.isEmpty() || it == p.name) "" else ".$it" }
            var n = 1
            while (f.exists()) f = File(dir, "$stem ($n)$ext").also { n++ }
        }
        // Written as "<name>.part" and renamed when complete, so a half-received file never looks finished.
        File(f.path + ".part").delete()
        return Uri.fromFile(File(f.path + ".part")).toString()
    }

    /** Opens the destination for appending (resume continues where it stopped). */
    fun openAppend(context: Context, uri: String): OutputStream {
        val u = Uri.parse(uri)
        return if (u.scheme == "file") FileOutputStream(File(u.path!!), true)
        else context.contentResolver.openOutputStream(u, "wa") ?: error("Couldn't open the file on the phone")
    }

    /** How many bytes are really on disk — the true resume point even after a crash. */
    fun writtenBytes(context: Context, uri: String): Long = runCatching {
        val u = Uri.parse(uri)
        if (u.scheme == "file") File(u.path!!).length()
        else context.contentResolver.openFileDescriptor(u, "r")?.use { it.statSize } ?: 0L
    }.getOrDefault(0L)

    /** Makes a finished file visible (Gallery / Files). Returns the final URI. */
    fun finish(context: Context, uri: String): String {
        val u = Uri.parse(uri)
        if (u.scheme == "file") {
            val part = File(u.path!!)
            var final = File(part.path.removeSuffix(".part"))
            if (final.exists()) {
                // Another file took the name meanwhile; never overwrite it.
                val stem = final.nameWithoutExtension
                val ext = final.extension.let { if (it.isEmpty()) "" else ".$it" }
                var n = 1
                while (final.exists()) final = File(final.parentFile, "$stem ($n)$ext").also { n++ }
            }
            part.renameTo(final)
            MediaScannerConnection.scanFile(context, arrayOf(final.path), null, null)
            return Uri.fromFile(final).toString()
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            context.contentResolver.update(u, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
        }
        return uri
    }

    /** Removes an unfinished partial file the app itself created (cancel / failure). */
    fun discardPartial(context: Context, uri: String) {
        runCatching {
            val u = Uri.parse(uri)
            if (u.scheme == "file") File(u.path!!).delete() else context.contentResolver.delete(u, null, null)
        }
    }
}
