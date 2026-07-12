package io.github.CyberTimon.RapidRAW

import android.os.Bundle
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity

/**
 * Tauri Activity base class for Android.
 *
 * This is the core integration point between the Kotlin Android app
 * and the Rust/Tauri backend. It:
 * 1. Loads the Rust native library (librapidraw_lib.so) which contains
 *    the Tauri app entry point (marked with tauri::mobile_entry_point)
 * 2. When the library loads, JNI_OnLoad is called by the JVM,
 *    which starts the Tauri app and creates the WebView
 * 3. Provides lifecycle callbacks for the WebView
 */
open class TauriActivity : AppCompatActivity() {

    protected var webView: WebView? = null

    companion object {
        init {
            // Load the Rust native library containing the Tauri app.
            // tauri::mobile_entry_point generates JNI_OnLoad which
            // starts the Tauri runtime and creates the WebView.
            System.loadLibrary("rapidraw_lib")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }

    open fun onWebViewCreate(webView: WebView) {
        this.webView = webView
    }

    override fun onPause() {
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
    }

    override fun onDestroy() {
        super.onDestroy()
    }
}