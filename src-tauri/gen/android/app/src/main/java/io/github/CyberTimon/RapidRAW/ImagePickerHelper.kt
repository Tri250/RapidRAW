package io.github.CyberTimon.RapidRAW

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import java.util.ArrayList

/**
 * RapidRAW Android 原生图片选择器
 *
 * 替换 WebView 内的文件选择器，使用 Android 原生：
 * - PhotoPicker (Android 13+，推荐)
 * - OpenDocument (SAF 框架，兼容旧版)
 * - 支持多选、RAW 格式过滤
 * - 结果通过 JNI 回调传递给 Rust 侧
 */
class ImagePickerHelper(private val activity: Activity) {

    /**
     * 选择结果回调 —— 由 Rust 侧通过 JNI 注册
     */
    interface PickResultCallback {
        /** 单选结果 */
        fun onImagePicked(uri: String)

        /** 多选结果 */
        fun onImagesPicked(uris: Array<String>)

        /** 选择取消 */
        fun onPickCancelled()
    }

    var pickResultCallback: PickResultCallback? = null

    // PhotoPicker 启动器 (Android 13+)
    private val photoPickerLauncher: ActivityResultLauncher<Intent>? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.activityResultRegistry.register(
                "photo_picker",
                ActivityResultContracts.StartActivityForResult()
            ) { result ->
                if (result.resultCode == Activity.RESULT_OK) {
                    val uris = result.data?.clipData?.let { clipData ->
                        (0 until clipData.itemCount).map { i ->
                            clipData.getItemAt(i).uri.toString()
                        }
                    } ?: result.data?.data?.let { listOf(it.toString()) } ?: emptyList()

                    if (uris.isNotEmpty()) {
                        pickResultCallback?.onImagesPicked(uris.toTypedArray())
                    } else {
                        pickResultCallback?.onPickCancelled()
                    }
                } else {
                    pickResultCallback?.onPickCancelled()
                }
            }
        } else null

    // OpenDocument 启动器 (兼容 Android 8-12)
    private val openDocumentLauncher: ActivityResultLauncher<Array<String>> =
        activity.activityResultRegistry.register(
            "open_document",
            ActivityResultContracts.OpenMultipleDocuments()
        ) { uris ->
            if (uris.isNotEmpty()) {
                pickResultCallback?.onImagesPicked(
                    uris.map { it.toString() }.toTypedArray()
                )
            } else {
                pickResultCallback?.onPickCancelled()
            }
        }

    // 单个文件选择（旧版兼容）
    private val openSingleDocumentLauncher: ActivityResultLauncher<Array<String>> =
        activity.activityResultRegistry.register(
            "open_single_document",
            ActivityResultContracts.OpenDocument()
        ) { uri ->
            if (uri != null) {
                pickResultCallback?.onImagePicked(uri.toString())
            } else {
                pickResultCallback?.onPickCancelled()
            }
        }

    /**
     * 打开图片选择器（多选）
     *
     * @param maxSelection 最大选择数量，默认 20
     */
    fun pickImages(maxSelection: Int = 20) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && photoPickerLauncher != null) {
            // Android 13+：使用 PhotoPicker
            val intent = Intent(MediaStore.ACTION_PICK_IMAGES).apply {
                putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, maxSelection)
                type = "image/*"
            }
            photoPickerLauncher.launch(intent)
        } else {
            // 旧版：使用 SAF OpenDocument
            openDocumentLauncher.launch(
                arrayOf("image/*", "image/x-adobe-dng", "image/x-canon-cr2",
                    "image/x-canon-cr3", "image/x-nikon-nef", "image/x-sony-arw",
                    "image/x-fuji-raf", "image/x-panasonic-rw2", "image/x-olympus-orf")
            )
        }
    }

    /**
     * 打开图片选择器（单选）
     */
    fun pickSingleImage() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && photoPickerLauncher != null) {
            val intent = Intent(MediaStore.ACTION_PICK_IMAGES).apply {
                putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, 1)
                type = "image/*"
            }
            photoPickerLauncher.launch(intent)
        } else {
            openSingleDocumentLauncher.launch(
                arrayOf("image/*", "image/x-adobe-dng", "image/x-canon-cr2",
                    "image/x-canon-cr3", "image/x-nikon-nef", "image/x-sony-arw",
                    "image/x-fuji-raf", "image/x-panasonic-rw2", "image/x-olympus-orf")
            )
        }
    }

    /**
     * 打开文件夹选择器（用于批量导入整个文件夹）
     */
    private val openDocumentTreeLauncher: ActivityResultLauncher<Intent?> =
        activity.activityResultRegistry.register(
            "open_document_tree",
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            if (result.resultCode == Activity.RESULT_OK) {
                result.data?.data?.let { uri ->
                    // 持久化权限
                    val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    activity.contentResolver.takePersistableUriPermission(uri, flags)

                    pickResultCallback?.onImagePicked(uri.toString())
                } ?: pickResultCallback?.onPickCancelled()
            } else {
                pickResultCallback?.onPickCancelled()
            }
        }

    fun pickFolder() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
            )
        }
        openDocumentTreeLauncher.launch(intent)
    }
}