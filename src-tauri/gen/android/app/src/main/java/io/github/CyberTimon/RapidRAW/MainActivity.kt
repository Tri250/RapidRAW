package io.github.CyberTimon.RapidRAW

import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private val safeMarginBackgroundColor = Color.rgb(6, 8, 12)
  private var webView: WebView? = null

  // 原生渲染层
  private var nativeRenderSurface: NativeRenderSurface? = null

  // 核心管理器
  private lateinit var memoryManager: MemoryManager
  private lateinit var mediaStoreManager: MediaStoreManager
  private lateinit var imagePickerHelper: ImagePickerHelper
  private lateinit var shortcutHelper: ShortcutHelper

  // 权限请求启动器
  private val permissionLauncher = registerForActivityResult(
    ActivityResultContracts.RequestMultiplePermissions()
  ) { permissions ->
    val allGranted = permissions.values.all { it }
    if (allGranted) {
      webView?.evaluateJavascript("window.__onPermissionsResult?.(true, 'All permissions granted')", null)
    } else {
      val denied = permissions.filter { !it.value }.keys.joinToString(", ")
      webView?.evaluateJavascript("window.__onPermissionsResult?.(false, 'Denied: $denied')", null)
    }
  }

  // 管理存储权限启动器
  private val manageStorageLauncher = registerForActivityResult(
    ActivityResultContracts.StartActivityForResult()
  ) { result ->
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val granted = Environment.isExternalStorageManager()
      webView?.evaluateJavascript("window.__onManageStorageResult?.($granted)", null)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // 初始化管理器
    memoryManager = MemoryManager.getInstance(this)
    mediaStoreManager = MediaStoreManager.getInstance(this)
    imagePickerHelper = ImagePickerHelper(this)
    shortcutHelper = ShortcutHelper(this)

    // 设置内存压力回调
    memoryManager.memoryPressureCallback = object : MemoryManager.MemoryPressureCallback {
      override fun onReleaseGpuCache() {
        webView?.evaluateJavascript("window.__onMemoryPressure?.('critical')", null)
      }
      override fun onReleaseGpuCacheFraction(fraction: Float) {
        webView?.evaluateJavascript("window.__onMemoryPressure?.('fraction', $fraction)", null)
      }
      override fun onPressureLevelChanged(level: MemoryManager.MemoryPressureLevel) {
        webView?.evaluateJavascript("window.__onMemoryPressureLevel?.('${level.name}')", null)
      }
    }

    // 设置图片选择回调
    imagePickerHelper.pickResultCallback = object : ImagePickerHelper.PickResultCallback {
      override fun onImagePicked(uri: String) {
        webView?.evaluateJavascript("window.__onImagePicked?.('$uri')", null)
      }
      override fun onImagesPicked(uris: Array<String>) {
        val paths = uris.joinToString(",")
        webView?.evaluateJavascript("window.__onImagesPicked?.('$paths')", null)
      }
      override fun onPickCancelled() {
        webView?.evaluateJavascript("window.__onPickCancelled?.()", null)
      }
    }

    val rootView: View = findViewById(android.R.id.content)
    rootView.setBackgroundColor(safeMarginBackgroundColor)

    ViewCompat.setOnApplyWindowInsetsListener(rootView) { view, insets ->
      val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      val bottomPadding = if (insets.isVisible(WindowInsetsCompat.Type.ime())) {
        ime.bottom
      } else {
        systemBars.bottom
      }

      view.setPadding(
        systemBars.left,
        systemBars.top,
        systemBars.right,
        bottomPadding
      )

      insets
    }

    ViewCompat.requestApplyInsets(rootView)

    // 处理从其他应用发送的 Intent
    handleIntent(intent)

    // 请求初始权限
    requestInitialPermissions()

    // 更新动态快捷方式
    shortcutHelper.updateDynamicShortcuts()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleIntent(intent)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    // 深色模式切换时通知 WebView
    val isDarkMode = (newConfig.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
        Configuration.UI_MODE_NIGHT_YES
    webView?.evaluateJavascript(
      "window.__onThemeChanged?.($isDarkMode, '${if (isDarkMode) "dark" else "light"}')",
      null
    )
  }

  /**
   * 处理传入的 Intent (打开图片、分享、快捷方式等)
   */
  private fun handleIntent(intent: Intent?) {
    if (intent == null) return

    val action = intent.action
    val type = intent.type

    when {
      // 自定义快捷方式
      action == "io.github.CyberTimon.RapidRAW.ACTION_IMPORT" -> {
        imagePickerHelper.pickImages()
      }
      action == "io.github.CyberTimon.RapidRAW.ACTION_LIBRARY" -> {
        webView?.evaluateJavascript("window.__navigateTo?.('library')", null)
      }
      action == "io.github.CyberTimon.RapidRAW.ACTION_QUICK_EXPORT" -> {
        webView?.evaluateJavascript("window.__quickExport?.()", null)
      }

      // ACTION_VIEW / ACTION_EDIT - 打开图片
      (action == Intent.ACTION_VIEW || action == Intent.ACTION_EDIT) && intent.data != null -> {
        val uri = intent.data
        val path = uri?.toString() ?: return
        webView?.evaluateJavascript("window.__onFileOpened?.('$path')", null)
      }

      // ACTION_SEND - 分享单张图片
      action == Intent.ACTION_SEND && type?.startsWith("image/") == true -> {
        val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
        val path = uri?.toString() ?: return
        webView?.evaluateJavascript("window.__onFileOpened?.('$path')", null)
      }

      // ACTION_SEND_MULTIPLE - 分享多张图片
      action == Intent.ACTION_SEND_MULTIPLE && type?.startsWith("image/") == true -> {
        val uris = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
        if (uris != null) {
          val paths = uris.joinToString(",") { it.toString() }
          webView?.evaluateJavascript("window.__onFilesOpened?.('$paths')", null)
        }
      }
    }
  }

  /**
   * 请求初始权限
   */
  private fun requestInitialPermissions() {
    if (!PermissionHelper.hasAllRequiredPermissions(this)) {
      val missing = PermissionHelper.getMissingPermissions(this)
      if (missing.isNotEmpty()) {
        permissionLauncher.launch(missing)
      }
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView

    webView.setBackgroundColor(safeMarginBackgroundColor)
    webView.fitsSystemWindows = true

    // 设置渲染层透明背景，让原生渲染层可见
    webView.setBackgroundColor(Color.TRANSPARENT)
    webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        this@MainActivity.webView?.evaluateJavascript("window.__handleAndroidBack()", null)
      }
    })
  }

  /**
   * 初始化原生渲染层
   * 在 WebView 下层创建 SurfaceView/TextureView 用于 WGPU 直出
   */
  fun initNativeRenderSurface() {
    if (nativeRenderSurface != null) return

    nativeRenderSurface = NativeRenderSurface(this).apply {
      renderCallback = object : NativeRenderSurface.RenderCallback {
        override fun onNativeSurfaceReady(surface: android.view.Surface, width: Int, height: Int) {
          // 通知 Rust 侧：原生 Surface 已就绪
          webView?.evaluateJavascript(
            "window.__onNativeSurfaceReady?.($width, $height)",
            null
          )
        }

        override fun onNativeSurfaceSizeChanged(
          surface: android.view.Surface,
          width: Int,
          height: Int
        ) {
          webView?.evaluateJavascript(
            "window.__onNativeSurfaceResized?.($width, $height)",
            null
          )
        }

        override fun onNativeSurfaceDestroyed() {
          webView?.evaluateJavascript(
            "window.__onNativeSurfaceDestroyed?.()",
            null
          )
        }

        override fun onRenderBackendReady(backend: String, supportsVulkan: Boolean) {
          webView?.evaluateJavascript(
            "window.__onRenderBackendReady?.('$backend', $supportsVulkan)",
            null
          )
        }
      }
    }

    // 将原生渲染层插入到 WebView 下层
    val rootLayout = findViewById<ViewGroup>(android.R.id.content)
    if (rootLayout is FrameLayout) {
      rootLayout.addView(nativeRenderSurface, 0,
        FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT
        ))
    }
  }

  /**
   * 获取原生渲染 Surface（供 JNI 调用）
   */
  fun getNativeSurface(): android.view.Surface? {
    return nativeRenderSurface?.getNativeSurface()
  }

  /**
   * 请求管理所有文件权限 (Android 11+)
   */
  fun requestManageStorage() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      if (!Environment.isExternalStorageManager()) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
        intent.data = Uri.parse("package:$packageName")
        manageStorageLauncher.launch(intent)
      }
    }
  }

  // ========== 原生功能入口（供 Rust/WebView 通过 JSI 调用） ==========

  /** 打开原生图片选择器 */
  fun pickImagesFromNative(maxSelection: Int = 20) {
    imagePickerHelper.pickImages(maxSelection)
  }

  /** 打开原生图片选择器（单选） */
  fun pickSingleImageFromNative() {
    imagePickerHelper.pickSingleImage()
  }

  /** 打开原生文件夹选择器 */
  fun pickFolderFromNative() {
    imagePickerHelper.pickFolder()
  }

  /** 从 MediaStore 查询图片 */
  fun queryMediaStoreImages(bucketId: Long? = null, limit: Int = 500, offset: Int = 0): String {
    val images = mediaStoreManager.queryImages(bucketId = bucketId, limit = limit, offset = offset)
    // 返回 JSON 格式的图片列表
    val sb = StringBuilder("[")
    images.forEachIndexed { index, img ->
      if (index > 0) sb.append(",")
      sb.append("""{"id":${img.id},"uri":"${img.uri}","name":"${img.displayName}",""")
      sb.append(""""mime":"${img.mimeType}","size":${img.size},"dateAdded":${img.dateAdded},""")
      sb.append(""""dateModified":${img.dateModified},"width":${img.width},"height":${img.height},""")
      sb.append(""""orientation":${img.orientation},"bucketId":${img.bucketId},""")
      sb.append(""""bucketName":"${img.bucketName}","path":"${img.relativePath}",""")
      sb.append(""""isRaw":${img.isRaw}}""")
    }
    sb.append("]")
    return sb.toString()
  }

  /** 获取内存使用信息 */
  fun getMemoryInfo(): String {
    val info = memoryManager.getMemoryInfo()
    return """{"heapUsedMB":${info.heapUsedMB},"heapMaxMB":${info.heapMaxMB},"""
      """ "nativeHeapMB":${info.nativeHeapMB},"pressureLevel":"${info.pressureLevel}","""
      """ "l0CacheSize":${info.l0CacheSize},"l2CacheSize":${info.l2CacheSize},"""
      """ "l2CacheBytes":${info.l2CacheBytes}}"""
  }

  /** 清除所有缓存 */
  fun clearAllCaches() {
    memoryManager.clearAll()
  }

  /** 分享图片到其他应用 */
  fun shareImage(uriString: String, mimeType: String) {
    val shareIntent = Intent(Intent.ACTION_SEND).apply {
      type = mimeType
      putExtra(Intent.EXTRA_STREAM, Uri.parse(uriString))
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    startActivity(Intent.createChooser(shareIntent, "分享到"))
  }

  override fun onPause() {
    super.onPause()
    nativeRenderSurface?.pauseRendering()
  }

  override fun onResume() {
    super.onResume()
    nativeRenderSurface?.resumeRendering()
  }

  override fun onDestroy() {
    nativeRenderSurface?.release()
    nativeRenderSurface = null
    shortcutHelper.clearDynamicShortcuts()
    super.onDestroy()
  }
}
