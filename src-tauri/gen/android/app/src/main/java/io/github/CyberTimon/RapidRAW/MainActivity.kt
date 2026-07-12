package io.github.CyberTimon.RapidRAW

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.view.View
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private val safeMarginBackgroundColor = Color.rgb(24, 24, 24)
  private var webView: WebView? = null

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
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleIntent(intent)
  }

  /**
   * 处理传入的 Intent (打开图片、分享等)
   */
  private fun handleIntent(intent: Intent?) {
    if (intent == null) return

    val action = intent.action
    val type = intent.type

    when {
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

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        this@MainActivity.webView?.evaluateJavascript("window.__handleAndroidBack()", null)
      }
    })
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
}
