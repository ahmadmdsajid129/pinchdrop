package com.pinchdrop.companion.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.util.Size
import android.webkit.MimeTypeMap
import android.widget.Toast
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.content.FileProvider
import java.io.File

/** Opening, sharing and previewing received items. */

private const val AUTHORITY_SUFFIX = ".files"

fun isLink(text: String): Boolean = Regex("^https?://\\S+$", RegexOption.IGNORE_CASE).matches(text.trim())

/** content:// as-is; file:// (Android 8–9) goes through our FileProvider so other apps may read it. */
private fun shareable(context: Context, uri: String): Uri {
    val u = Uri.parse(uri)
    return if (u.scheme == "file") FileProvider.getUriForFile(context, context.packageName + AUTHORITY_SUFFIX, File(u.path!!)) else u
}

private fun mimeOf(context: Context, u: Uri): String =
    context.contentResolver.getType(u)
        ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(MimeTypeMap.getFileExtensionFromUrl(u.toString()).lowercase())
        ?: "*/*"

fun openUri(context: Context, uri: String) {
    try {
        val intent = if (isLink(uri)) {
            Intent(Intent.ACTION_VIEW, Uri.parse(uri.trim()))
        } else {
            val u = shareable(context, uri)
            Intent(Intent.ACTION_VIEW).setDataAndType(u, mimeOf(context, u)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(context, "No app on this phone can open that file", Toast.LENGTH_SHORT).show()
    } catch (_: Exception) {
        Toast.makeText(context, "That file isn't there any more", Toast.LENGTH_SHORT).show()
    }
}

fun shareUri(context: Context, uri: String) {
    runCatching {
        val u = shareable(context, uri)
        val send = Intent(Intent.ACTION_SEND).setType(mimeOf(context, u)).putExtra(Intent.EXTRA_STREAM, u)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

fun shareText(context: Context, text: String) {
    runCatching {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

/** A small preview of a received photo, or null if it can't be read. */
fun loadThumbnail(context: Context, uri: String, px: Int = 720): ImageBitmap? = runCatching {
    val u = Uri.parse(uri)
    if (u.scheme != "file" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        context.contentResolver.loadThumbnail(u, Size(px, px), null).asImageBitmap()
    } else {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(u)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= px && bounds.outHeight / (sample * 2) >= px) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        context.contentResolver.openInputStream(u)?.use { BitmapFactory.decodeStream(it, null, opts) }?.asImageBitmap()
    }
}.getOrNull()

private val thumbCache = android.util.LruCache<String, ImageBitmap>(48)

/**
 * A received photo's preview, decoded on a background thread and cached, so lists and the
 * Arrived screen never stall the UI while images load. null until ready (or if unreadable).
 */
@androidx.compose.runtime.Composable
fun rememberThumbnail(uri: String?, px: Int): ImageBitmap? {
    val context = androidx.compose.ui.platform.LocalContext.current
    val key = uri?.let { "$it@$px" }
    val state = androidx.compose.runtime.produceState(initialValue = key?.let { thumbCache.get(it) }, key) {
        // Runs again whenever the item changes: show its cached preview at once, else decode it.
        value = key?.let { thumbCache.get(it) }
        val u = uri ?: return@produceState
        if (key == null || value != null) return@produceState
        value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            loadThumbnail(context, u, px)?.also { thumbCache.put(key, it) }
        }
    }
    return state.value
}
