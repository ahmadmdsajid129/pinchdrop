package com.pinchdrop.companion.phone

import android.content.Context
import android.graphics.Bitmap
import android.media.ThumbnailUtils
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.util.Base64
import android.util.Size
import android.webkit.MimeTypeMap
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * v2 · The phone's files on the PC (Phone files page): browse folders, see picture / video
 * previews, bring a file to the PC or to another phone. Needs Android's "All files access"
 * (Settings → Permissions → All files on your PC). Paths are always inside the phone's shared
 * storage; nothing outside it can be listed or sent.
 */
object PhoneFiles {
    private val root: File get() = Environment.getExternalStorageDirectory()

    fun allowed(): Boolean = Build.VERSION.SDK_INT >= 30 && Environment.isExternalStorageManager()

    /** "DCIM/Camera" → the file, only if it stays inside shared storage. */
    private fun resolve(rel: String): File {
        if (!allowed()) throw NoPermission()
        val base = root.canonicalFile
        val f = File(base, rel.trim('/')).canonicalFile
        require(f.path == base.path || f.path.startsWith(base.path + File.separator)) { "outside storage" }
        return f
    }

    private fun mimeOf(f: File): String =
        MimeTypeMap.getSingleton().getMimeTypeFromExtension(f.extension.lowercase()) ?: "application/octet-stream"

    fun list(rel: String): JSONObject {
        val dir = resolve(rel)
        require(dir.isDirectory)
        val entries = (dir.listFiles() ?: emptyArray())
            .filter { !it.name.startsWith(".") }
            .sortedWith(compareBy<File>({ !it.isDirectory }, { it.name.lowercase() }))
            .take(2000)
        val out = JSONArray()
        for (f in entries) {
            out.put(
                JSONObject()
                    .put("name", f.name)
                    .put("dir", f.isDirectory)
                    .put("size", if (f.isFile) f.length() else 0)
                    .put("modified", f.lastModified())
                    .put("mime", if (f.isFile) mimeOf(f) else "")
                    .put("count", if (f.isDirectory) (f.list()?.size ?: 0) else 0),
            )
        }
        val relPath = dir.path.removePrefix(root.canonicalFile.path).trim('/')
        return JSONObject().put("path", relPath).put("entries", out)
    }

    /** A small JPEG preview of a picture or video. */
    fun thumb(rel: String): JSONObject {
        val f = resolve(rel)
        require(f.isFile)
        val mime = mimeOf(f)
        val size = Size(160, 160)
        val bmp: Bitmap? = runCatching {
            when {
                Build.VERSION.SDK_INT >= 29 && mime.startsWith("image/") -> ThumbnailUtils.createImageThumbnail(f, size, null)
                Build.VERSION.SDK_INT >= 29 && mime.startsWith("video/") -> ThumbnailUtils.createVideoThumbnail(f, size, null)
                else -> null
            }
        }.getOrNull()
        val p = JSONObject()
        if (bmp != null) {
            val o = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, 70, o)
            p.put("thumb", "data:image/jpeg;base64," + Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP))
        }
        return p
    }

    /** Sends a file to the PC; with `relay`, the PC passes it straight on to that device. */
    fun send(context: Context, rel: String, relay: String?) {
        val f = resolve(rel)
        require(f.isFile)
        com.pinchdrop.companion.transfer.Lifter.sendNow(context, listOf(Uri.fromFile(f)), relay)
    }
}
