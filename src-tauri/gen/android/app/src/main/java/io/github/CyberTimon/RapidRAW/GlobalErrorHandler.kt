package io.github.CyberTimon.RapidRAW

import android.content.Context
import android.os.Build
import android.util.Log
import org.json.JSONObject

/**
 * 全局错误处理器
 *
 * 捕获未处理异常，防止应用崩溃：
 * - 设置 JVM 级别的 UncaughtExceptionHandler
 * - 记录崩溃日志到本地文件
 * - 提供崩溃状态查询，支持下次启动时恢复
 */
class GlobalErrorHandler(private val context: Context) : Thread.UncaughtExceptionHandler {

    companion object {
        private const val TAG = "GlobalErrorHandler"
        private const val PREFS_NAME = "rapidraw_crash_prefs"
        private const val KEY_CRASH_COUNT = "crash_count"
        private const val KEY_LAST_CRASH_TIME = "last_crash_time"
        private const val KEY_LAST_CRASH_TRACE = "last_crash_trace"
        private const val KEY_HAS_CRASHED = "has_crashed"
        private const val MAX_CRASH_LOG_SIZE = 8192
        private const val CRASH_RESET_INTERVAL_MS = 24 * 60 * 60 * 1000L // 24 hours

        @Volatile
        private var instance: GlobalErrorHandler? = null

        fun install(context: Context): GlobalErrorHandler {
            return instance ?: synchronized(this) {
                instance ?: GlobalErrorHandler(context.applicationContext).also {
                    instance = it
                    Thread.setDefaultUncaughtExceptionHandler(it)
                }
            }
        }

        fun hasCrashedRecently(context: Context): Boolean {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            if (!prefs.getBoolean(KEY_HAS_CRASHED, false)) return false
            val lastCrashTime = prefs.getLong(KEY_LAST_CRASH_TIME, 0)
            return System.currentTimeMillis() - lastCrashTime < CRASH_RESET_INTERVAL_MS
        }

        fun getCrashCount(context: Context): Int {
            return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getInt(KEY_CRASH_COUNT, 0)
        }

        fun clearCrashState(context: Context) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_HAS_CRASHED, false)
                .putInt(KEY_CRASH_COUNT, 0)
                .apply()
        }

        fun getCrashInfo(context: Context): JSONObject? {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            if (!prefs.getBoolean(KEY_HAS_CRASHED, false)) return null
            return JSONObject().apply {
                put("crashCount", prefs.getInt(KEY_CRASH_COUNT, 0))
                put("lastCrashTime", prefs.getLong(KEY_LAST_CRASH_TIME, 0))
                put("lastCrashTrace", prefs.getString(KEY_LAST_CRASH_TRACE, ""))
                put("deviceModel", Build.MODEL)
                put("androidVersion", Build.VERSION.SDK_INT)
                put("appVersion", try {
                    context.packageManager.getPackageInfo(context.packageName, 0)?.versionName ?: "unknown"
                } catch (_: Exception) { "unknown" })
            }
        }
    }

    private val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override fun uncaughtException(thread: Thread, throwable: Throwable) {
        Log.e(TAG, "Uncaught exception on thread ${thread.name}", throwable)

        // 记录崩溃信息
        val crashTrace = Log.getStackTraceString(throwable).take(MAX_CRASH_LOG_SIZE)
        val crashCount = prefs.getInt(KEY_CRASH_COUNT, 0)

        prefs.edit()
            .putBoolean(KEY_HAS_CRASHED, true)
            .putInt(KEY_CRASH_COUNT, crashCount + 1)
            .putLong(KEY_LAST_CRASH_TIME, System.currentTimeMillis())
            .putString(KEY_LAST_CRASH_TRACE, crashTrace)
            .apply()

        // 传递给系统默认处理器（通常会让进程终止）
        defaultHandler?.uncaughtException(thread, throwable)
    }
}
