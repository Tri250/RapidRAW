package io.github.CyberTimon.RapidRAW

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileOutputStream

/**
 * RapidRAW Android MediaStore 集成管理器
 *
 * 参考 AlcedoStudio 的库管理能力，实现 Android 原生 MediaStore 集成：
 * - 系统媒体库索引查询（利用系统缓存和缩略图）
 * - 图片 CRUD 操作（通过 ContentResolver）
 * - 批量导入 / 导出
 * - 文件元数据读取
 */
class MediaStoreManager private constructor(private val context: Context) {

    companion object {
        private const val TAG = "MediaStoreManager"

        // 支持的 RAW 格式 MIME 类型
        val RAW_MIME_TYPES = mapOf(
            "dng" to "image/x-adobe-dng",
            "cr2" to "image/x-canon-cr2",
            "cr3" to "image/x-canon-cr3",
            "nef" to "image/x-nikon-nef",
            "nrw" to "image/x-nikon-nrw",
            "arw" to "image/x-sony-arw",
            "srf" to "image/x-sony-srf",
            "sr2" to "image/x-sony-sr2",
            "raf" to "image/x-fuji-raf",
            "orf" to "image/x-olympus-orf",
            "rw2" to "image/x-panasonic-rw2",
            "pef" to "image/x-pentax-pef",
            "rwl" to "image/x-leica-rwl",
            "raw" to "image/x-raw",
            "3fr" to "image/x-hasselblad-3fr",
            "fff" to "image/x-hasselblad-fff",
            "iiq" to "image/x-phaseone-iiq",
            "mef" to "image/x-mamiya-mef",
            "mrw" to "image/x-minolta-mrw",
            "x3f" to "image/x-sigma-x3f",
            "erf" to "image/x-epson-erf",
            "kdc" to "image/x-kodak-kdc",
            "dcr" to "image/x-kodak-dcr"
        )

        @Volatile
        private var instance: MediaStoreManager? = null

        fun getInstance(context: Context): MediaStoreManager {
            return instance ?: synchronized(this) {
                instance ?: MediaStoreManager(context.applicationContext).also {
                    instance = it
                }
            }
        }
    }

    data class MediaImageInfo(
        val id: Long,
        val uri: Uri,
        val displayName: String,
        val mimeType: String,
        val size: Long,
        val dateAdded: Long,
        val dateModified: Long,
        val width: Int,
        val height: Int,
        val orientation: Int,
        val bucketId: Long,
        val bucketName: String,
        val relativePath: String,
        val isRaw: Boolean
    )

    /**
     * 查询系统媒体库中的所有图片（包括 RAW 文件）
     *
     * @param bucketId 可选：限制到特定文件夹
     * @param mimeTypes 可选：限制 MIME 类型
     * @param limit 最大返回数量
     * @param offset 偏移量（分页）
     */
    fun queryImages(
        bucketId: Long? = null,
        mimeTypes: List<String>? = null,
        limit: Int = 500,
        offset: Int = 0
    ): List<MediaImageInfo> {
        val images = mutableListOf<MediaImageInfo>()
        val resolver = context.contentResolver

        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.MIME_TYPE,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.DATE_MODIFIED,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT,
            MediaStore.Images.Media.ORIENTATION,
            MediaStore.Images.Media.BUCKET_ID,
            MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
            MediaStore.Images.Media.RELATIVE_PATH
        )

        val selection = StringBuilder()
        val selectionArgs = mutableListOf<String>()

        if (bucketId != null) {
            selection.append("${MediaStore.Images.Media.BUCKET_ID} = ?")
            selectionArgs.add(bucketId.toString())
        }

        if (mimeTypes != null && mimeTypes.isNotEmpty()) {
            if (selection.isNotEmpty()) selection.append(" AND ")
            selection.append("(")
            mimeTypes.forEachIndexed { index, mime ->
                if (index > 0) selection.append(" OR ")
                selection.append("${MediaStore.Images.Media.MIME_TYPE} = ?")
                selectionArgs.add(mime)
            }
            // 也包含所有 RAW 格式
            selection.append(" OR ${MediaStore.Images.Media.MIME_TYPE} LIKE 'image/x-%'")
            selection.append(")")
        }

        val sortOrder = "${MediaStore.Images.Media.DATE_MODIFIED} DESC"

        val cursor: Cursor? = resolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            projection,
            if (selection.isNotEmpty()) selection.toString() else null,
            if (selectionArgs.isNotEmpty()) selectionArgs.toTypedArray() else null,
            "$sortOrder LIMIT $limit OFFSET $offset"
        )

        cursor?.use {
            val idCol = it.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val nameCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
            val mimeCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE)
            val sizeCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE)
            val dateAddedCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
            val dateModCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_MODIFIED)
            val widthCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH)
            val heightCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT)
            val orientCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.ORIENTATION)
            val bucketIdCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_ID)
            val bucketNameCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)
            val relPathCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.RELATIVE_PATH)

            while (it.moveToNext()) {
                val mimeType = it.getString(mimeCol) ?: ""
                images.add(
                    MediaImageInfo(
                        id = it.getLong(idCol),
                        uri = Uri.withAppendedPath(
                            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                            it.getLong(idCol).toString()
                        ),
                        displayName = it.getString(nameCol) ?: "",
                        mimeType = mimeType,
                        size = it.getLong(sizeCol),
                        dateAdded = it.getLong(dateAddedCol),
                        dateModified = it.getLong(dateModCol),
                        width = it.getInt(widthCol),
                        height = it.getInt(heightCol),
                        orientation = it.getInt(orientCol),
                        bucketId = it.getLong(bucketIdCol),
                        bucketName = it.getString(bucketNameCol) ?: "",
                        relativePath = it.getString(relPathCol) ?: "",
                        isRaw = mimeType.startsWith("image/x-")
                    )
                )
            }
        }

        return images
    }

    /**
     * 查询所有图片文件夹（Bucket）
     */
    fun queryBuckets(): List<BucketInfo> {
        val buckets = mutableListOf<BucketInfo>()
        val resolver = context.contentResolver

        val projection = arrayOf(
            MediaStore.Images.Media.BUCKET_ID,
            MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
            "COUNT(*) as count",
            "MAX(${MediaStore.Images.Media.DATE_MODIFIED}) as latest"
        )

        val cursor = resolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            projection,
            null,
            null,
            "${MediaStore.Images.Media.BUCKET_ID}"
        )

        cursor?.use {
            val bucketIdCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_ID)
            val bucketNameCol = it.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)
            val countCol = it.getColumnIndexOrThrow("count")
            val latestCol = it.getColumnIndexOrThrow("latest")

            while (it.moveToNext()) {
                buckets.add(
                    BucketInfo(
                        id = it.getLong(bucketIdCol),
                        name = it.getString(bucketNameCol) ?: "Unknown",
                        imageCount = it.getInt(countCol),
                        latestDate = it.getLong(latestCol)
                    )
                )
            }
        }

        return buckets.sortedByDescending { it.latestDate }
    }

    data class BucketInfo(
        val id: Long,
        val name: String,
        val imageCount: Int,
        val latestDate: Long
    )

    /**
     * 获取系统缩略图（利用 MediaStore 内置缓存）
     */
    fun getSystemThumbnail(imageId: Long, kind: Int = MediaStore.Images.Thumbnails.MINI_KIND): android.graphics.Bitmap? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10+ 使用 ContentResolver.loadThumbnail
            val uri = Uri.withAppendedPath(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                imageId.toString()
            )
            try {
                context.contentResolver.loadThumbnail(
                    uri,
                    android.util.Size(512, 512),
                    null
                )
            } catch (e: Exception) {
                null
            }
        } else {
            // Android 9 及以下使用 Thumbnails API
            MediaStore.Images.Thumbnails.getThumbnail(
                context.contentResolver,
                imageId,
                kind,
                null
            )
        }
    }

    /**
     * 通过 Content URI 读取文件显示名称
     */
    fun getDisplayName(uri: Uri): String? {
        val resolver = context.contentResolver
        val cursor = resolver.query(uri, null, null, null, null)
        return cursor?.use {
            if (it.moveToFirst()) {
                val nameIndex = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0) it.getString(nameIndex) else null
            } else null
        }
    }

    /**
     * 通过 Content URI 读取文件大小
     */
    fun getFileSize(uri: Uri): Long {
        val resolver = context.contentResolver
        val cursor = resolver.query(uri, null, null, null, null)
        return cursor?.use {
            if (it.moveToFirst()) {
                val sizeIndex = it.getColumnIndex(OpenableColumns.SIZE)
                if (sizeIndex >= 0) it.getLong(sizeIndex) else -1L
            } else -1L
        } ?: -1L
    }

    /**
     * 通过 Content URI 打开 InputStream
     */
    fun openInputStream(uri: Uri): java.io.InputStream? {
        return try {
            context.contentResolver.openInputStream(uri)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * 通过 Content URI 打开 OutputStream
     */
    fun openOutputStream(uri: Uri): java.io.OutputStream? {
        return try {
            context.contentResolver.openOutputStream(uri)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * 将图片保存到 MediaStore（Pictures/RapidRAW）
     *
     * @param displayName 文件名
     * @param mimeType MIME类型
     * @param data 图片数据
     * @return 保存后的 Content URI，失败返回 null
     */
    fun saveToPictures(
        displayName: String,
        mimeType: String,
        data: ByteArray
    ): Uri? {
        val resolver = context.contentResolver
        val contentValues = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
            put(MediaStore.Images.Media.MIME_TYPE, mimeType)
            put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/RapidRAW")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }

        val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        } else {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }

        val uri = resolver.insert(collection, contentValues) ?: return null

        try {
            resolver.openOutputStream(uri)?.use { output ->
                output.write(data)
                output.flush()
            } ?: run {
                resolver.delete(uri, null, null)
                return null
            }

            contentValues.clear()
            contentValues.put(MediaStore.Images.Media.IS_PENDING, 0)
            resolver.update(uri, contentValues, null, null)

            return uri
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            return null
        }
    }

    /**
     * 保存到 Downloads
     */
    fun saveToDownloads(
        displayName: String,
        mimeType: String,
        data: ByteArray
    ): Uri? {
        val resolver = context.contentResolver
        val contentValues = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, displayName)
            put(MediaStore.Downloads.MIME_TYPE, mimeType)
            put(MediaStore.Downloads.RELATIVE_PATH, "Download/RapidRAW")
            put(MediaStore.Downloads.IS_PENDING, 1)
        }

        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues) ?: return null

        try {
            resolver.openOutputStream(uri)?.use { output ->
                output.write(data)
                output.flush()
            } ?: run {
                resolver.delete(uri, null, null)
                return null
            }

            contentValues.clear()
            contentValues.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, contentValues, null, null)

            return uri
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            return null
        }
    }

    /**
     * 删除 MediaStore 条目
     */
    fun deleteFromMediaStore(uri: Uri): Boolean {
        return try {
            context.contentResolver.delete(uri, null, null) > 0
        } catch (e: Exception) {
            false
        }
    }

    /**
     * 检查文件是否为 RAW 格式
     */
    fun isRawFile(extension: String): Boolean {
        return RAW_MIME_TYPES.containsKey(extension.lowercase())
    }

    /**
     * 获取文件的 MIME 类型
     */
    fun getMimeType(extension: String): String? {
        val lower = extension.lowercase()
        return RAW_MIME_TYPES[lower]
            ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(lower)
    }
}