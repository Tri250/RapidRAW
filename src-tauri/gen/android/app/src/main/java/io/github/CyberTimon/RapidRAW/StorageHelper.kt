package io.github.CyberTimon.RapidRAW

import android.content.Context
import android.os.Environment
import android.os.StatFs
import android.util.Log

/**
 * 存储空间检查辅助类
 *
 * 在执行高存储占用操作（如导出、模型下载）前检查可用空间：
 * - 检查内部存储和外部存储可用空间
 * - 预估操作所需空间
 * - 低存储警告
 */
object StorageHelper {

    private const val TAG = "StorageHelper"
    private const val MIN_FREE_SPACE_MB = 100L // 最低保留 100MB
    private const val WARNING_FREE_SPACE_MB = 500L // 低存储警告阈值

    data class StorageInfo(
        val totalBytes: Long,
        val availableBytes: Long,
        val isLow: Boolean,
        val isCritical: Boolean,
    ) {
        val availableMB: Long get() = availableBytes / (1024 * 1024)
        val totalMB: Long get() = totalBytes / (1024 * 1024)
        val usagePercent: Int get() = if (totalBytes > 0) ((totalBytes - availableBytes) * 100 / totalBytes).toInt() else 0
    }

    fun getInternalStorageInfo(context: Context): StorageInfo {
        val stat = StatFs(context.filesDir.absolutePath)
        return createStorageInfo(stat)
    }

    fun getExternalStorageInfo(context: Context): StorageInfo {
        val externalDir = context.getExternalFilesDir(null)
            ?: return StorageInfo(0, 0, true, true)
        if (Environment.getExternalStorageState() != Environment.MEDIA_MOUNTED) {
            return StorageInfo(0, 0, true, true)
        }
        val stat = StatFs(externalDir.absolutePath)
        return createStorageInfo(stat)
    }

    private fun createStorageInfo(stat: StatFs): StorageInfo {
        val totalBytes = stat.totalBytes
        val availableBytes = stat.availableBytes
        val availableMB = availableBytes / (1024 * 1024)
        return StorageInfo(
            totalBytes = totalBytes,
            availableBytes = availableBytes,
            isLow = availableMB < WARNING_FREE_SPACE_MB,
            isCritical = availableMB < MIN_FREE_SPACE_MB,
        )
    }

    /**
     * 检查是否有足够空间执行操作
     *
     * @param requiredMB 预估操作所需空间（MB）
     * @return true 如果有足够空间
     */
    fun hasEnoughSpace(context: Context, requiredMB: Long): Boolean {
        val info = getExternalStorageInfo(context)
        val availableAfter = info.availableMB - requiredMB
        if (availableAfter < MIN_FREE_SPACE_MB) {
            Log.w(TAG, "Insufficient storage: need ${requiredMB}MB, available ${info.availableMB}MB")
            return false
        }
        return true
    }

    /**
     * 获取存储状态 JSON（供 WebView 使用）
     */
    fun getStorageStatusJson(context: Context): String {
        val internal = getInternalStorageInfo(context)
        val external = getExternalStorageInfo(context)
        return """{"internal":{"totalMB":${internal.totalMB},"availableMB":${internal.availableMB},"isLow":${internal.isLow}},""" +
                """"external":{"totalMB":${external.totalMB},"availableMB":${external.availableMB},"isLow":${external.isLow},"isCritical":${external.isCritical}}}"""
    }
}
