package io.github.CyberTimon.RapidRAW

import android.app.Application
import android.util.Log

/**
 * RapidRAW 应用程序入口
 *
 * 初始化全局组件：
 * - 全局错误处理器
 * - 网络状态监控
 * - 内存管理器
 */
class RapidRAWApplication : Application() {

    companion object {
        private const val TAG = "RapidRAWApplication"
    }

    lateinit var networkHelper: NetworkHelper
        private set

    override fun onCreate() {
        super.onCreate()

        // 安装全局错误处理器
        GlobalErrorHandler.install(this)

        // 初始化网络监控
        networkHelper = NetworkHelper.getInstance(this)
        networkHelper.startMonitoring()

        // 检查上次是否崩溃
        if (GlobalErrorHandler.hasCrashedRecently(this)) {
            val crashCount = GlobalErrorHandler.getCrashCount(this)
            Log.w(TAG, "App crashed $crashCount time(s) recently. Consider safe mode.")
        }

        Log.i(TAG, "RapidRAW Application initialized")
    }

    override fun onTerminate() {
        networkHelper.stopMonitoring()
        super.onTerminate()
    }

    override fun onLowMemory() {
        super.onLowMemory()
        Log.w(TAG, "System requested low memory cleanup")
        MemoryManager.getInstance(this).clearAll()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        Log.d(TAG, "onTrimMemory level=$level")
        when {
            level >= TRIM_MEMORY_COMPLETE -> {
                MemoryManager.getInstance(this).clearAll()
            }
            level >= TRIM_MEMORY_MODERATE -> {
                MemoryManager.getInstance(this).evictL2Cache(1.0f)
            }
            level >= TRIM_MEMORY_RUNNING_LOW -> {
                MemoryManager.getInstance(this).evictL0Cache(1.0f)
            }
        }
    }
}
