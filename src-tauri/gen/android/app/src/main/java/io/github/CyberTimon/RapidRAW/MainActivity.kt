package io.github.CyberTimon.RapidRAW

import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.StrictMode
import android.provider.Settings
import android.view.Gravity
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.Toast
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import kotlin.math.atan2
import org.json.JSONArray
import androidx.activity.enableEdgeToEdge
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private val safeMarginBackgroundColor = Color.rgb(6, 8, 12)

  // 原生渲染层
  private var nativeRenderSurface: NativeRenderSurface? = null

  // 核心管理器
  private lateinit var memoryManager: MemoryManager
  private lateinit var mediaStoreManager: MediaStoreManager
  private lateinit var imagePickerHelper: ImagePickerHelper
  private lateinit var shortcutHelper: ShortcutHelper
  private lateinit var thumbnailAccelerator: ThumbnailAccelerator

  // 手势处理与比较视图
  private lateinit var gestureHandler: GestureHandler
  private lateinit var comparisonViewManager: ComparisonViewManager

  // 新手引导与折叠屏适配
  private lateinit var onboardingManager: OnboardingManager
  private lateinit var foldableAdapter: FoldableAdapter

  // 热降频监控
  private lateinit var thermalMonitor: ThermalMonitor

  // 状态保存 Key
  companion object {
    private const val KEY_CURRENT_IMAGE_PATH = "current_image_path"
    private const val KEY_IS_EDITING = "is_editing"
    private const val KEY_EDITOR_STATE = "editor_state_json"
  }

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
    // 安装 SplashScreen（Android 12+ 系统 API，11- 自动降级）
    val splashScreen = installSplashScreen()

    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // 启用 StrictMode 检测 ANR 隐患（仅 Debug 模式）
    if (BuildConfig.DEBUG) {
      StrictMode.setThreadPolicy(
        StrictMode.ThreadPolicy.Builder()
          .detectDiskReads()
          .detectDiskWrites()
          .detectNetwork()
          .penaltyLog()
          .build()
      )
      StrictMode.setVmPolicy(
        StrictMode.VmPolicy.Builder()
          .detectLeakedSqlLiteObjects()
          .detectLeakedClosableObjects()
          .detectActivityLeaks()
          .penaltyLog()
          .build()
      )
    }

    // 初始化管理器
    memoryManager = MemoryManager.getInstance(this)
    mediaStoreManager = MediaStoreManager.getInstance(this)
    imagePickerHelper = ImagePickerHelper(this)
    shortcutHelper = ShortcutHelper(this)
    thumbnailAccelerator = ThumbnailAccelerator(this)

    onboardingManager = OnboardingManager(this)
    foldableAdapter = FoldableAdapter(this)
    thermalMonitor = ThermalMonitor.getInstance(this)

    // 检查是否需要显示引导页
    if (onboardingManager.shouldShowOnboarding()) {
        webView?.evaluateJavascript("window.__showOnboarding?.()", null)
    }

    // OEM 适配初始化
    OEMAdapter.requestBatteryOptimizationWhitelist(this)

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

    // 恢复上次保存的状态
    if (savedInstanceState != null) {
      restoreEditorState(savedInstanceState)
    }

    // 设置热降频回调
    thermalMonitor.callback = object : ThermalMonitor.ThermalCallback {
      override fun onThermalStatusChanged(status: ThermalMonitor.ThermalStatus, temperature: Float) {
        webView?.evaluateJavascript(
          "window.__onThermalChanged?.('${status.label}', $temperature, ${status.level})",
          null
        )
      }
      override fun onThrottleLevelChanged(level: Int) {
        webView?.evaluateJavascript("window.__onThrottleLevelChanged?.($level)", null)
      }
    }
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
    // 通知前端设备状态变化
    val deviceState = foldableAdapter.getDeviceStateJson()
    webView?.evaluateJavascript("window.__onDeviceStateChanged?.($deviceState)", null)
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

    // Android 15+ edge-to-edge: 使用 WindowInsetsCompat 替代 fitsSystemWindows
    ViewCompat.setOnApplyWindowInsetsListener(webView) { v, insets ->
        val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
        v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
        insets
    }

    // 设置渲染层透明背景，让原生渲染层可见
    webView.setBackgroundColor(Color.TRANSPARENT)
    webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)

    // WebView 性能优化
    webView.settings.apply {
        // 启用 DOM Storage（缓存）
        domStorageEnabled = true
        // 启用数据库缓存
        databaseEnabled = true
        // 设置缓存模式：有网络时使用缓存，无网络时仅缓存
        cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        // 启用硬件加速
        setSupportZoom(false)
        // 禁用不必要的功能
        javaScriptCanOpenWindowsAutomatically = false
        // 文字大小由前端控制
        textZoom = 100
        // 预渲染优化
        offscreenPreRaster = true
        // 启用安全浏览
        safeBrowsingEnabled = true
    }

    // 初始化原生渲染层（WGPU 直出 SurfaceView）
    initNativeRenderSurface()

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

    // 初始化手势处理器，绑定到原生渲染层
    gestureHandler = GestureHandler(this).apply {
      setTargetView(nativeRenderSurface!!)
      callback = object : GestureHandler.GestureCallback {
        override fun onZoomChanged(scale: Float, focusX: Float, focusY: Float) {
          webView?.evaluateJavascript(
            "window.__onGestureZoom?.($scale, $focusX, $focusY)",
            null
          )
        }
        override fun onRotationChanged(angle: Float) {
          webView?.evaluateJavascript(
            "window.__onGestureRotate?.($angle)",
            null
          )
        }
        override fun onPanChanged(dx: Float, dy: Float) {
          webView?.evaluateJavascript(
            "window.__onGesturePan?.($dx, $dy)",
            null
          )
        }
        override fun onDoubleTap() {
          gestureHandler.resetTransform()
          webView?.evaluateJavascript("window.__onDoubleTap?.()", null)
        }
        override fun onLongPressStart() {
          showOriginalTemporarily()
          webView?.evaluateJavascript("window.__onLongPressStart?.()", null)
        }
        override fun onLongPressEnd() {
          comparisonViewManager.disable()
          webView?.evaluateJavascript("window.__onLongPressEnd?.()", null)
        }
        override fun onSingleTap() {
          webView?.evaluateJavascript("window.__onSingleTap?.()", null)
        }
        override fun onSwipeLeft() {
          webView?.evaluateJavascript("window.__onSwipeLeft?.()", null)
        }
        override fun onSwipeRight() {
          webView?.evaluateJavascript("window.__onSwipeRight?.()", null)
        }
      }
    }

    nativeRenderSurface!!.setOnTouchListener { _, event ->
      handleNativeTouchEvent(event)
    }

    // 初始化比较视图管理器，覆盖在渲染层之上
    comparisonViewManager = ComparisonViewManager(this)
    val comparisonOverlay = comparisonViewManager.getView()
    comparisonOverlay.visibility = View.GONE
    if (rootLayout is FrameLayout) {
      rootLayout.addView(comparisonOverlay,
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

  /** 循环切换比较视图模式 */
  fun cycleComparisonMode() {
    if (!::comparisonViewManager.isInitialized) return
    comparisonViewManager.cycleMode()
    val comparisonOverlay = comparisonViewManager.getView()
    comparisonOverlay.visibility = if (comparisonViewManager.mode != ComparisonViewManager.ComparisonMode.NONE) {
      View.VISIBLE
    } else {
      View.GONE
    }
    webView?.evaluateJavascript(
      "window.__onComparisonModeChanged?.('${comparisonViewManager.mode.name}')",
      null
    )
  }

  /** 临时显示原始图像（长按比较） */
  fun showOriginalTemporarily() {
    if (!::comparisonViewManager.isInitialized) return
    comparisonViewManager.mode = ComparisonViewManager.ComparisonMode.FULL_TOGGLE
    comparisonViewManager.isShowingOriginal = true
    comparisonViewManager.getView().visibility = View.VISIBLE
    webView?.evaluateJavascript(
      "window.__onComparisonModeChanged?.('${comparisonViewManager.mode.name}')",
      null
    )
  }

  /** 获取设备信息 */
  fun getDeviceInfo(): String {
    return OEMAdapter.getDeviceInfo(this)
  }

  /** 请求电池优化白名单 */
  fun requestBatteryWhitelist() {
    OEMAdapter.requestBatteryOptimizationWhitelist(this)
  }

  /** 标记引导页完成 */
  fun markOnboardingCompleted() {
    onboardingManager.markOnboardingCompleted()
  }

  /** 获取设备状态信息（供前端调用） */
  fun getDeviceState(): String {
    return foldableAdapter.getDeviceStateJson()
  }

  /** 检查是否为平板 */
  fun isTablet(): Boolean {
    return foldableAdapter.isTablet()
  }

  /** 检查是否为折叠屏展开状态 */
  fun isFoldedOpen(): Boolean {
    return foldableAdapter.isFoldedOpen()
  }

  /** 生成缩略图 */
  fun generateThumbnail(path: String, maxWidth: Int, maxHeight: Int) {
    thumbnailAccelerator.generateThumbnail(path, maxWidth, maxHeight) { resultPath ->
      if (resultPath.isNotEmpty()) {
        webView?.evaluateJavascript("window.__onThumbnailReady?.('$resultPath')", null)
      }
    }
  }

  /** 批量生成缩略图 */
  fun generateBatchThumbnails(pathsJson: String) {
    try {
      val jsonArray = JSONArray(pathsJson)
      val paths = mutableListOf<String>()
      for (i in 0 until jsonArray.length()) {
        paths.add(jsonArray.getString(i))
      }
      thumbnailAccelerator.generateBatchThumbnails(
        paths = paths,
        onProgress = { current, total ->
          webView?.evaluateJavascript("window.__onBatchThumbnailProgress?.($current, $total)", null)
        },
        onComplete = { results ->
          val resultJson = JSONArray()
          for ((source, thumb) in results) {
            val entry = org.json.JSONObject().apply {
              put("source", source)
              put("thumbnail", thumb)
            }
            resultJson.put(entry)
          }
          webView?.evaluateJavascript(
            "window.__onBatchThumbnailComplete?.('${resultJson.toString().replace("'", "\\'")}')",
            null
          )
        }
      )
    } catch (e: Exception) {
      webView?.evaluateJavascript("window.__onBatchThumbnailComplete?.('[]')", null)
    }
  }

  override fun onPause() {
    super.onPause()
    nativeRenderSurface?.pauseRendering()
    // 检查热降频状态
    thermalMonitor.checkThermalStatus()
  }

  override fun onResume() {
    super.onResume()
    nativeRenderSurface?.resumeRendering()
  }

  override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    // 保存当前编辑状态，防止进程死亡后丢失
    webView?.evaluateJavascript(
      "JSON.stringify({path: window.__getCurrentImagePath?.(), isEditing: window.__isEditing?.(), editorState: window.__getEditorState?.()})",
      { result ->
        if (result != null && result != "null") {
          outState.putString(KEY_EDITOR_STATE, result)
        }
      }
    )
  }

  override fun onRestoreInstanceState(savedInstanceState: Bundle) {
    super.onRestoreInstanceState(savedInstanceState)
    restoreEditorState(savedInstanceState)
  }

  /**
   * 从 Bundle 恢复编辑状态
   */
  private fun restoreEditorState(savedInstanceState: Bundle) {
    val editorState = savedInstanceState.getString(KEY_EDITOR_STATE)
    if (editorState != null) {
      webView?.evaluateJavascript(
        "window.__restoreEditorState?.($editorState)",
        null
      )
    }
  }

  override fun onDestroy() {
    nativeRenderSurface?.release()
    nativeRenderSurface = null
    shortcutHelper.clearDynamicShortcuts()
    thumbnailAccelerator.shutdown()
    super.onDestroy()
  }

  /**
   * 处理原生渲染层的触控事件（含触控笔压力感应）
   */
  private fun handleNativeTouchEvent(event: MotionEvent): Boolean {
    // 触控笔压力感应
    if (event.isFromSource(InputDevice.SOURCE_STYLUS) || event.getToolType(0) == MotionEvent.TOOL_TYPE_STYLUS) {
      val pressure = event.getPressure(0)
      val orientation = if (event.pointerCount >= 1) event.getOrientation(0) else 0f
      val tilt = if (event.pointerCount >= 1) {
        val tiltX = event.getAxisValue(MotionEvent.AXIS_TILT, 0)
        val tiltY = event.getAxisValue(MotionEvent.AXIS_TILT, 1)
        Math.toDegrees(atan2(tiltY.toDouble(), tiltX.toDouble())).toFloat()
      } else 0f

      webView?.evaluateJavascript(
        "window.__onStylusEvent?.({action:${event.actionMasked},x:${event.x},y:${event.y},pressure:$pressure,orientation:$orientation,tilt:$tilt})",
        null
      )
    }

    return gestureHandler.onTouchEvent(event)
  }
}
