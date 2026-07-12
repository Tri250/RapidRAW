package io.github.CyberTimon.RapidRAW

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log

/**
 * 网络状态监控辅助类
 *
 * 监控网络连接变化，为 AI 模型下载和预设同步提供网络状态信息：
 * - 检测网络可用性
 * - 区分 WiFi / 移动数据 / 无网络
 * - 网络状态变化回调
 * - 建议是否进行大文件下载
 */
class NetworkHelper(private val context: Context) {

    companion object {
        private const val TAG = "NetworkHelper"

        @Volatile
        private var instance: NetworkHelper? = null

        fun getInstance(context: Context): NetworkHelper {
            return instance ?: synchronized(this) {
                instance ?: NetworkHelper(context.applicationContext).also { instance = it }
            }
        }
    }

    enum class NetworkType(val label: String) {
        WIFI("wifi"),
        CELLULAR("cellular"),
        ETHERNET("ethernet"),
        NONE("none"),
        UNKNOWN("unknown")
    }

    interface NetworkCallback {
        fun onNetworkChanged(type: NetworkType, isMetered: Boolean)
    }

    var callback: NetworkCallback? = null

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            notifyNetworkChange()
        }
        override fun onLost(network: Network) {
            notifyNetworkChange()
        }
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            notifyNetworkChange()
        }
    }

    private var isRegistered = false

    fun startMonitoring() {
        if (isRegistered) return
        try {
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            connectivityManager?.registerNetworkCallback(request, networkCallback)
            isRegistered = true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register network callback", e)
        }
    }

    fun stopMonitoring() {
        if (!isRegistered) return
        try {
            connectivityManager?.unregisterNetworkCallback(networkCallback)
            isRegistered = false
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister network callback", e)
        }
    }

    fun getCurrentNetworkType(): NetworkType {
        val cm = connectivityManager ?: return NetworkType.UNKNOWN
        val network = cm.activeNetwork ?: return NetworkType.NONE
        val capabilities = cm.getNetworkCapabilities(network) ?: return NetworkType.NONE

        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> NetworkType.WIFI
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> NetworkType.CELLULAR
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> NetworkType.ETHERNET
            else -> NetworkType.UNKNOWN
        }
    }

    fun isNetworkAvailable(): Boolean {
        val cm = connectivityManager ?: return false
        val network = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    fun isMeteredConnection(): Boolean {
        val cm = connectivityManager ?: return true
        val network = cm.activeNetwork ?: return true
        val capabilities = cm.getNetworkCapabilities(network) ?: return true
        return !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    }

    /**
     * 建议是否进行大文件下载
     * 仅在 WiFi 或非计量连接时建议下载
     */
    fun shouldDownloadLargeFiles(): Boolean {
        return isNetworkAvailable() && !isMeteredConnection()
    }

    fun getNetworkStatusJson(): String {
        val type = getCurrentNetworkType()
        return """{"type":"${type.label}","available":${isNetworkAvailable()},""" +
                """"metered":${isMeteredConnection()},"shouldDownload":${shouldDownloadLargeFiles()}}"""
    }

    private fun notifyNetworkChange() {
        val type = getCurrentNetworkType()
        val metered = isMeteredConnection()
        callback?.onNetworkChanged(type, metered)
    }
}
