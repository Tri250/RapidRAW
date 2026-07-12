package io.github.CyberTimon.RapidRAW

import android.webkit.*

class Ipc(val webView: RustWebView, val webViewClient: RustWebViewClient) {
    @JavascriptInterface
    fun postMessage(message: String?) {
        message?.let {m ->
            Rust.ipc(webView.id, webViewClient.currentUrl, m)
        }
    }
}
