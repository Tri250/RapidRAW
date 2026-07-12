package io.github.CyberTimon.RapidRAW

import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.os.Build
import android.os.Debug
import android.util.LruCache
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.min

/**
 * RapidRAW Android 内存管理与缓存系统
 *
 * 参考 AlcedoStudio 的细粒度内存管理策略（786张42MP RAW仅767MB）
 * 实现 Android 端的分级缓存 + 内存压力响应机制
 *
 * 缓存层级：
 *   L0: 嵌入式JPEG预览缓存（内存，< 200KB/张）
 *   L1: GPU纹理缓存（GPU显存，由 Rust 侧管理）
 *   L2: 解码后缩略图缓存（内存，LRU）
 *   L3: 磁盘缓存（持久化缩略图）
 */
class MemoryManager private constructor(private val context: Context) {

    companion object {
        private const val TAG = "MemoryManager"

        // 默认缓存大小
        private const val DEFAULT_L0_CACHE_SIZE = 100  // 最多100张嵌入式预览
        private const val DEFAULT_L2_CACHE_MB = 64     // 缩略图缓存最大64MB
        private const val DEFAULT_DISK_CACHE_MB = 200  // 磁盘缓存最大200MB

        // 内存压力阈值
        private const val MEMORY_PRESSURE_LOW = 0.6f    // 使用60%堆内存时触发低压力
        private const val MEMORY_PRESSURE_MODERATE = 0.75f
        private const val MEMORY_PRESSURE_HIGH = 0.85f
        private const val MEMORY_PRESSURE_CRITICAL = 0.92f

        @Volatile
        private var instance: MemoryManager? = null

        fun getInstance(context: Context): MemoryManager {
            return instance ?: synchronized(this) {
                instance ?: MemoryManager(context.applicationContext).also {
                    instance = it
                }
            }
        }
    }

    // L0: 嵌入式预览缓存（路径 -> 字节数组）
    private val embedPreviewCache = LruCache<String, ByteArray>(DEFAULT_L0_CACHE_SIZE)

    // L2: 缩略图 Bitmap 缓存（路径 -> Bitmap）
    private val thumbnailCache = object : LruCache<String, Bitmap>(DEFAULT_L2_CACHE_MB * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap): Int {
            return value.byteCount
        }
    }

    // 磁盘缓存目录
    private val diskCacheDir: File by lazy {
        File(context.externalCacheDir ?: context.cacheDir, "thumbnails").also {
            if (!it.exists()) it.mkdirs()
        }
    }

    // 内存使用追踪
    private val heapUsedBytes = AtomicLong(0)
    private val totalMemoryBytes = AtomicLong(Runtime.getRuntime().maxMemory())
    private var currentPressureLevel = MemoryPressureLevel.NONE

    enum class MemoryPressureLevel {
        NONE,       // 正常
        LOW,        // 低压力：释放 L0 缓存
        MODERATE,   // 中压力：释放 L0 + L2 一半
        HIGH,       // 高压力：释放 L0 + L2 全部
        CRITICAL    // 危急：释放所有缓存 + 通知 Rust 侧
    }

    /**
     * 内存压力回调 —— 由 Rust 侧通过 JNI 注册
     */
    interface MemoryPressureCallback {
        /** 释放 GPU 缓存（L1） */
        fun onReleaseGpuCache()

        /** 释放 GPU 纹理缓存（指定比例 0.0-1.0） */
        fun onReleaseGpuCacheFraction(fraction: Float)

        /** 内存压力等级变化 */
        fun onPressureLevelChanged(level: MemoryPressureLevel)
    }

    var memoryPressureCallback: MemoryPressureCallback? = null

    init {
        // 注册 ComponentCallbacks2 监听系统内存压力
        context.registerComponentCallbacks(object : ComponentCallbacks2 {
            override fun onTrimMemory(level: Int) {
                handleSystemTrimMemory(level)
            }

            override fun onConfigurationChanged(newConfig: Configuration) {}
            override fun onLowMemory() {
                handleLowMemory()
            }
        })

        // 更新内存统计数据
        updateMemoryStats()
    }

    // ========== 系统内存压力处理 ==========

    private fun handleSystemTrimMemory(level: Int) {
        when (level) {
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL -> {
                onMemoryPressure(MemoryPressureLevel.CRITICAL)
            }
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> {
                onMemoryPressure(MemoryPressureLevel.HIGH)
            }
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_MODERATE -> {
                onMemoryPressure(MemoryPressureLevel.MODERATE)
            }
            ComponentCallbacks2.TRIM_MEMORY_BACKGROUND,
            ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN -> {
                onMemoryPressure(MemoryPressureLevel.MODERATE)
            }
            ComponentCallbacks2.TRIM_MEMORY_COMPLETE -> {
                onMemoryPressure(MemoryPressureLevel.CRITICAL)
            }
        }
    }

    private fun handleLowMemory() {
        onMemoryPressure(MemoryPressureLevel.HIGH)
    }

    /**
     * 响应内存压力，逐级释放缓存
     */
    private fun onMemoryPressure(level: MemoryPressureLevel) {
        if (level.ordinal <= currentPressureLevel.ordinal) return
        currentPressureLevel = level

        when (level) {
            MemoryPressureLevel.LOW -> {
                // 释放 L0 缓存的 50%
                evictL0Cache(0.5f)
            }
            MemoryPressureLevel.MODERATE -> {
                // 释放 L0 全部 + L2 50%
                evictL0Cache(1.0f)
                evictL2Cache(0.5f)
            }
            MemoryPressureLevel.HIGH -> {
                // 释放 L0 + L2 全部
                evictL0Cache(1.0f)
                evictL2Cache(1.0f)
            }
            MemoryPressureLevel.CRITICAL -> {
                // 释放所有缓存 + 通知 Rust 侧释放 GPU 缓存
                evictL0Cache(1.0f)
                evictL2Cache(1.0f)
                memoryPressureCallback?.onReleaseGpuCache()
            }
            MemoryPressureLevel.NONE -> {}
        }

        updateMemoryStats()
    }

    // ========== L0: 嵌入式预览缓存 ==========

    fun putEmbeddedPreview(path: String, data: ByteArray) {
        embedPreviewCache.put(path, data)
    }

    fun getEmbeddedPreview(path: String): ByteArray? {
        return embedPreviewCache.get(path)
    }

    fun evictL0Cache(fraction: Float) {
        val targetSize = (embedPreviewCache.maxSize() * (1.0f - fraction)).toInt()
        embedPreviewCache.trimToSize(targetSize.coerceAtLeast(1))
    }

    // ========== L2: 缩略图 Bitmap 缓存 ==========

    fun putThumbnail(path: String, bitmap: Bitmap) {
        thumbnailCache.put(path, bitmap)
    }

    fun getThumbnail(path: String): Bitmap? {
        return thumbnailCache.get(path)
    }

    fun evictL2Cache(fraction: Float) {
        val targetSize = (thumbnailCache.maxSize() * (1.0f - fraction)).toInt()
        thumbnailCache.trimToSize(targetSize.coerceAtLeast(1))
    }

    // ========== L3: 磁盘缓存 ==========

    fun putDiskCache(key: String, data: ByteArray) {
        val file = File(diskCacheDir, key.toCacheFileName())
        try {
            file.outputStream().use { it.write(data) }
        } catch (e: Exception) {
            // 磁盘写入失败，静默忽略
        }
    }

    fun getDiskCache(key: String): ByteArray? {
        val file = File(diskCacheDir, key.toCacheFileName())
        if (!file.exists()) return null
        return try {
            file.readBytes()
        } catch (e: Exception) {
            null
        }
    }

    fun evictDiskCache(maxSizeMB: Long = DEFAULT_DISK_CACHE_MB.toLong()) {
        val files = diskCacheDir.listFiles() ?: return
        // 按最后修改时间排序，删除最旧的
        files.sortBy { it.lastModified() }
        var totalSize = files.sumOf { it.length() }
        var index = 0
        while (totalSize > maxSizeMB * 1024 * 1024 && index < files.size) {
            val file = files[index]
            totalSize -= file.length()
            file.delete()
            index++
        }
    }

    /**
     * 清除所有缓存
     */
    fun clearAll() {
        embedPreviewCache.evictAll()
        thumbnailCache.evictAll()
        diskCacheDir.listFiles()?.forEach { it.delete() }
        memoryPressureCallback?.onReleaseGpuCache()
        currentPressureLevel = MemoryPressureLevel.NONE
        updateMemoryStats()
    }

    /**
     * OOM 保护：检查是否有足够内存加载指定大小的图像
     *
     * 策略：
     * - 估算图像解码后内存占用（宽×高×4字节 RGBA + 30% overhead）
     * - 预留 20% 堆空间给系统和其他缓存
     * - 如果超出预算，先尝试释放 L2 缓存再重试
     *
     * @return true 表示可以安全加载，false 表示需要降采样或拒绝加载
     */
    fun canLoadImage(width: Int, height: Int): Boolean {
        updateMemoryStats()

        val estimatedBytes = (width.toLong() * height * 4 * 1.3).toLong() // RGBA + overhead
        val availableBytes = totalMemoryBytes.get() - heapUsedBytes.get()
        val reservedBytes = (totalMemoryBytes.get() * 0.2).toLong() // 预留 20%
        val usableBytes = availableBytes - reservedBytes

        if (estimatedBytes <= usableBytes) {
            return true
        }

        // 尝试释放 L2 缓存以腾出空间
        if (estimatedBytes <= usableBytes + thumbnailCache.size() * 50_000L) {
            evictL2Cache(1.0f)
            updateMemoryStats()
            val newUsable = (totalMemoryBytes.get() - heapUsedBytes.get()) - reservedBytes
            return estimatedBytes <= newUsable
        }

        return false
    }

    /**
     * 获取建议的图像加载策略
     *
     * @return 建议的最大解码尺寸（取短边），0 表示不应加载
     */
    fun getRecommendedMaxDimension(originalWidth: Int, originalHeight: Int): Int {
        if (canLoadImage(originalWidth, originalHeight)) {
            return maxOf(originalWidth, originalHeight)
        }

        // 逐级降采样：50%, 25%, 12.5%
        val steps = listOf(2, 4, 8)
        for (step in steps) {
            val w = originalWidth / step
            val h = originalHeight / step
            if (w > 0 && h > 0 && canLoadImage(w, h)) {
                return maxOf(w, h)
            }
        }

        return 0 // 内存不足，不应加载
    }

    // ========== 内存监控 ==========

    private fun updateMemoryStats() {
        val runtime = Runtime.getRuntime()
        heapUsedBytes.set(runtime.totalMemory() - runtime.freeMemory())
        totalMemoryBytes.set(runtime.maxMemory())

        // 检查是否需要触发内存压力
        val usageRatio = heapUsedBytes.get().toFloat() / totalMemoryBytes.get().toFloat()
        when {
            usageRatio > MEMORY_PRESSURE_CRITICAL -> onMemoryPressure(MemoryPressureLevel.CRITICAL)
            usageRatio > MEMORY_PRESSURE_HIGH -> onMemoryPressure(MemoryPressureLevel.HIGH)
            usageRatio > MEMORY_PRESSURE_MODERATE -> onMemoryPressure(MemoryPressureLevel.MODERATE)
            usageRatio > MEMORY_PRESSURE_LOW -> onMemoryPressure(MemoryPressureLevel.LOW)
        }
    }

    /**
     * 获取当前内存使用信息
     */
    fun getMemoryInfo(): MemoryInfo {
        updateMemoryStats()
        return MemoryInfo(
            heapUsedMB = heapUsedBytes.get() / (1024 * 1024),
            heapMaxMB = totalMemoryBytes.get() / (1024 * 1024),
            nativeHeapMB = Debug.getNativeHeapSize() / (1024 * 1024),
            pressureLevel = currentPressureLevel.name,
            l0CacheSize = embedPreviewCache.size(),
            l2CacheSize = thumbnailCache.size(),
            l2CacheBytes = thumbnailCache.run {
                var total = 0
                val snapshot = snapshot()
                for ((_, bitmap) in snapshot) {
                    total += bitmap.byteCount
                }
                total
            }
        )
    }

    data class MemoryInfo(
        val heapUsedMB: Long,
        val heapMaxMB: Long,
        val nativeHeapMB: Long,
        val pressureLevel: String,
        val l0CacheSize: Int,
        val l2CacheSize: Int,
        val l2CacheBytes: Int
    )

    // ========== 工具方法 ==========

    private fun String.toCacheFileName(): String {
        return java.security.MessageDigest.getInstance("MD5")
            .digest(this.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }
}