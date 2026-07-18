package io.github.CyberTimon.RapidRAW

import android.Manifest
import android.content.ComponentCallbacks2
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
    private val safeMarginBackgroundColor = Color.rgb(24, 24, 24)
    private var webView: WebView? = null
    private var stateRestored = false

    companion object {
        private const val STATE_KEY_RESTORED = "rapidraw_state_restored"
        private val REQUIRED_PERMISSIONS = buildList {
            // Storage permissions
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.READ_MEDIA_IMAGES)
            } else {
                add(Manifest.permission.READ_EXTERNAL_STORAGE)
            }
            // Notification permission for Android 13+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    // Permission result launcher
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.values.all { it }
        if (!allGranted) {
            Toast.makeText(
                this,
                getString(R.string.permission_denied),
                Toast.LENGTH_LONG
            ).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Android 12+ handles splash screen natively via the theme

        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        stateRestored = savedInstanceState?.getBoolean(STATE_KEY_RESTORED, false) ?: false

        val rootView: View = findViewById(android.R.id.content)
        rootView.setBackgroundColor(safeMarginBackgroundColor)

        ViewCompat.setOnApplyWindowInsetsListener(rootView) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val isKeyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime())

            val bottomPadding = if (isKeyboardVisible) {
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

            // Notify WebView of keyboard state change
            if (isKeyboardVisible) {
                webView?.evaluateJavascript(
                    "window.__handleKeyboardChange && window.__handleKeyboardChange(true, ${ime.bottom})",
                    null
                )
            } else {
                webView?.evaluateJavascript(
                    "window.__handleKeyboardChange && window.__handleKeyboardChange(false, 0)",
                    null
                )
            }

            insets
        }

        ViewCompat.requestApplyInsets(rootView)

        // Request required permissions on first launch
        if (!stateRestored || !allPermissionsGranted()) {
            requestRequiredPermissions()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putBoolean(STATE_KEY_RESTORED, true)
    }

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        this.webView = webView

        webView.setBackgroundColor(safeMarginBackgroundColor)
        webView.fitsSystemWindows = true

        // Enable multi-process WebView for crash isolation (Android 7+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                WebView.setDataDirectorySuffix(applicationContext.packageName)
            } catch (_: Exception) {
                // Ignore if already set
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                this@MainActivity.webView?.evaluateJavascript(
                    "window.__handleAndroidBack()",
                    null
                )
            }
        })
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        when (level) {
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_MODERATE,
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW,
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL -> {
                // Notify WebView to release cached images/models
                webView?.evaluateJavascript(
                    "window.__handleLowMemory && window.__handleLowMemory($level)",
                    null
                )
            }
            ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN -> {
                // App is in background, release non-essential WebView resources
                webView?.evaluateJavascript(
                    "window.__handleAppBackground && window.__handleAppBackground()",
                    null
                )
            }
        }
    }

    override fun onLowMemory() {
        super.onLowMemory()
        // Critical memory pressure - request immediate cleanup
        webView?.evaluateJavascript(
            "window.__handleLowMemory && window.__handleLowMemory(-1)",
            null
        )
    }

    private fun allPermissionsGranted(): Boolean {
        return REQUIRED_PERMISSIONS.all { permission ->
            ContextCompat.checkSelfPermission(this, permission) ==
                PackageManager.PERMISSION_GRANTED
        }
    }

    private fun requestRequiredPermissions() {
        val permissionsToRequest = REQUIRED_PERMISSIONS.filter { permission ->
            ContextCompat.checkSelfPermission(this, permission) !=
                PackageManager.PERMISSION_GRANTED
        }.toTypedArray()

        if (permissionsToRequest.isNotEmpty()) {
            permissionLauncher.launch(permissionsToRequest)
        }
    }
}