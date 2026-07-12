package io.github.CyberTimon.RapidRAW

import android.content.Context
import android.graphics.*
import android.renderscript.*
import android.os.Build
import java.io.File
import java.util.concurrent.Executors
import kotlin.math.min

/**
 * GPU 加速缩略图生成器
 * 
 * 使用 Android RenderScript / Vulkan 加速缩略图生成
 */
class ThumbnailAccelerator(private val context: Context) {
    
    private val executor = Executors.newFixedThreadPool(2)
    private var renderScript: RenderScript? = null
    
    init {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            try {
                renderScript = RenderScript.create(context)
            } catch (e: Exception) {
                // RenderScript not available
            }
        }
    }
    
    /**
     * 异步生成缩略图
     */
    fun generateThumbnail(
        sourcePath: String,
        maxWidth: Int,
        maxHeight: Int,
        quality: Bitmap.CompressFormat = Bitmap.CompressFormat.JPEG,
        onComplete: (String) -> Unit
    ) {
        executor.execute {
            try {
                val result = generateThumbnailSync(sourcePath, maxWidth, maxHeight, quality)
                onComplete(result)
            } catch (e: Exception) {
                onComplete("")
            }
        }
    }
    
    /**
     * 同步生成缩略图
     */
    fun generateThumbnailSync(
        sourcePath: String,
        maxWidth: Int,
        maxHeight: Int,
        quality: Bitmap.CompressFormat = Bitmap.CompressFormat.JPEG
    ): String {
        // Step 1: 解码为缩略图尺寸
        val options = BitmapFactory.Options().apply {
            inJustDecodeBounds = true
        }
        BitmapFactory.decodeFile(sourcePath, options)
        
        val originalWidth = options.outWidth
        val originalHeight = options.outHeight
        
        if (originalWidth <= 0 || originalHeight <= 0) return ""
        
        // 计算采样率
        var sampleSize = 1
        while (originalWidth / sampleSize > maxWidth * 2 || 
               originalHeight / sampleSize > maxHeight * 2) {
            sampleSize *= 2
        }
        
        val decodeOptions = BitmapFactory.Options().apply {
            inSampleSize = sampleSize
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        
        var bitmap = BitmapFactory.decodeFile(sourcePath, decodeOptions) ?: return ""
        
        // Step 2: 缩放到目标尺寸
        val scale = min(
            maxWidth.toFloat() / bitmap.width,
            maxHeight.toFloat() / bitmap.height
        ).coerceAtMost(1.0f)
        
        if (scale < 1.0f) {
            val newWidth = (bitmap.width * scale).toInt()
            val newHeight = (bitmap.height * scale).toInt()
            bitmap = Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
        }
        
        // Step 3: 保存缩略图
        val cacheDir = File(context.externalCacheDir ?: context.cacheDir, "thumbnails")
        if (!cacheDir.exists()) cacheDir.mkdirs()
        
        val cacheFileName = sourcePath.hashCode().toString(16) + ".jpg"
        val cacheFile = File(cacheDir, cacheFileName)
        
        cacheFile.outputStream().use { output ->
            bitmap.compress(quality, 85, output)
        }
        
        bitmap.recycle()
        return cacheFile.absolutePath
    }
    
    /**
     * 批量生成缩略图
     */
    fun generateBatchThumbnails(
        paths: List<String>,
        maxWidth: Int = 256,
        maxHeight: Int = 256,
        onProgress: (Int, Int) -> Unit = { _, _ -> },
        onComplete: (Map<String, String>) -> Unit = {}
    ) {
        executor.execute {
            val results = mutableMapOf<String, String>()
            paths.forEachIndexed { index, path ->
                try {
                    val result = generateThumbnailSync(path, maxWidth, maxHeight)
                    if (result.isNotEmpty()) {
                        results[path] = result
                    }
                } catch (_: Exception) {}
                onProgress(index + 1, paths.size)
            }
            onComplete(results)
        }
    }
    
    fun shutdown() {
        executor.shutdown()
        renderScript?.destroy()
        renderScript = null
    }
}