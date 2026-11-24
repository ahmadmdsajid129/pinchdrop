package com.pinchdrop.companion.transfer

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.workDataOf

class FileDownloadWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val transferId = inputData.getString("transferId") ?: return Result.failure()
        val fileName = inputData.getString("fileName") ?: "downloaded_file"
        val totalBytes = inputData.getLong("totalBytes", 0L)

        return try {
            // Simulate chunk download loop with progress reporting
            for (progress in 10..100 step 20) {
                setProgress(
                    workDataOf(
                        "progress" to progress,
                        "fileName" to fileName
                    )
                )
                kotlinx.coroutines.delay(200)
            }

            Result.success(
                workDataOf(
                    "status" to "SAVED_TO_MEDIASTORE",
                    "transferId" to transferId
                )
            )
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
