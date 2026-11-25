package com.pinchdrop.companion.vision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.SystemClock
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Problems the Catch screen explains in plain words. The "Accept without gesture" button always remains. */
enum class CatchCameraError { NO_FRONT_CAMERA, CAMERA_BUSY, TRACKING_FAILED }

/** Loads the bundled hand model once per process (GPU first, CPU if that fails). */
private object Landmarker {
    @Volatile private var instance: HandLandmarker? = null

    @Synchronized
    fun get(context: Context): HandLandmarker? {
        instance?.let { return it }
        fun build(delegate: Delegate) = HandLandmarker.createFromOptions(
            context,
            HandLandmarker.HandLandmarkerOptions.builder()
                .setBaseOptions(BaseOptions.builder().setModelAssetPath("hand_landmarker.task").setDelegate(delegate).build())
                .setRunningMode(RunningMode.VIDEO)
                .setNumHands(1)
                .setMinHandDetectionConfidence(0.6f)
                .setMinTrackingConfidence(0.5f)
                .build(),
        )
        instance = runCatching { build(Delegate.GPU) }.recoverCatching { build(Delegate.CPU) }.getOrNull()
        return instance
    }
}

/**
 * Front camera → MediaPipe hand landmarks → [onFrame], all in memory. Frames are analysed and
 * dropped; nothing is saved or sent. The (dimmed) preview helps people hold their hand over the phone.
 * Runs only while this composable is on screen.
 */
@Composable
fun CatchCamera(
    modifier: Modifier = Modifier,
    onFrame: (HandFrame?) -> Unit,
    onError: (CatchCameraError) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val frameCb = rememberUpdatedState(onFrame)
    val errorCb = rememberUpdatedState(onError)
    val previewView = remember { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }
    val executor = remember { Executors.newSingleThreadExecutor() }

    DisposableEffect(lifecycleOwner) {
        val main = ContextCompat.getMainExecutor(context)
        val stopped = AtomicBoolean(false)
        var consecutiveFailures = 0
        val providerFuture = ProcessCameraProvider.getInstance(context)
        val analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            .build()
        analysis.setAnalyzer(executor) { image: ImageProxy ->
            try {
                if (stopped.get()) return@setAnalyzer
                val landmarker = Landmarker.get(context)
                if (landmarker == null) {
                    stopped.set(true)
                    main.execute { errorCb.value(CatchCameraError.TRACKING_FAILED) }
                    return@setAnalyzer
                }
                val bitmap = upright(image)
                val t = SystemClock.uptimeMillis()
                val result = landmarker.detectForVideo(BitmapImageBuilder(bitmap).build(), t)
                consecutiveFailures = 0
                val lm = result.landmarks().firstOrNull()
                val frame = if (lm == null || lm.size < 21) null else {
                    val pts = lm.map { HandMath.P(it.x(), it.y(), it.z()) }
                    HandFrame(
                        t = t,
                        extended = HandMath.extended(pts),
                        pinchRatio = HandMath.pinchRatio(pts),
                        scale = HandMath.scale(pts),
                        score = result.handedness().firstOrNull()?.firstOrNull()?.score() ?: 0f,
                        x = pts[9].x,
                        y = pts[9].y,
                    )
                }
                main.execute { if (!stopped.get()) frameCb.value(frame) }
            } catch (_: Throwable) {
                // One bad frame is fine; a long run means tracking is broken.
                if (++consecutiveFailures > 30 && stopped.compareAndSet(false, true)) {
                    main.execute { errorCb.value(CatchCameraError.TRACKING_FAILED) }
                }
            } finally {
                image.close()
            }
        }
        val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
        var provider: ProcessCameraProvider? = null
        providerFuture.addListener({
            val p = runCatching { providerFuture.get() }.getOrNull()
            provider = p
            if (p == null) {
                errorCb.value(CatchCameraError.CAMERA_BUSY)
                return@addListener
            }
            if (runCatching { p.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) }.getOrDefault(false).not()) {
                errorCb.value(CatchCameraError.NO_FRONT_CAMERA)
                return@addListener
            }
            runCatching {
                p.unbindAll()
                p.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis)
            }.onFailure { errorCb.value(CatchCameraError.CAMERA_BUSY) }
        }, main)
        onDispose {
            stopped.set(true)
            runCatching { provider?.unbindAll() }
            analysis.clearAnalyzer()
        }
    }
    DisposableEffect(Unit) { onDispose { executor.shutdown() } }

    AndroidView(factory = { previewView }, modifier = modifier)
}

/** RGBA frame → upright bitmap (camera sensors are usually rotated). */
private fun upright(image: ImageProxy): Bitmap {
    val bmp = image.toBitmap()
    val rot = image.imageInfo.rotationDegrees
    if (rot == 0) return bmp
    val m = Matrix().apply { postRotate(rot.toFloat()) }
    return Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
}
