package io.github.CyberTimon.RapidRAW

import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.util.Log

/**
 * 热降频监控器
 *
 * 监控设备温度变化，在过热时自动降低处理性能：
 * - 检测 CPU/GPU 温度（Android 10+）
 * - 分级降档：轻度 → 中度 → 重度 → 紧急
 * - 通知前端调整处理参数
 */
class ThermalMonitor(private val context: Context) {

    companion object {
        private const val TAG = "ThermalMonitor"

        // 温控阈值（摄氏度）
        private const val TEMP_MODERATE = 38.0f
        private const val TEMP_HIGH = 42.0f
        private const val TEMP_CRITICAL = 46.0f

        // 降档对应的性能参数
        private const val THROTTLE_NONE = 0      // 无降档
        private const val THROTTLE_LIGHT = 1     // 轻度：降低预览分辨率
        private const val THROTTLE_MODERATE = 2  // 中度：降低处理分辨率 + 减少线程
        private const val THROTTLE_HEAVY = 3     // 重度：限制后台处理
        private const val THROTTLE_EMERGENCY = 4 // 紧急：暂停所有非关键处理

        @Volatile
        private var instance: ThermalMonitor? = null

        fun getInstance(context: Context): ThermalMonitor {
            return instance ?: synchronized(this) {
                instance ?: ThermalMonitor(context.applicationContext).also { instance = it }
            }
        }
    }

    enum class ThermalStatus(val level: Int, val label: String) {
        NORMAL(0, "normal"),
        WARM(1, "warm"),
        HOT(2, "hot"),
        CRITICAL(3, "critical"),
        EMERGENCY(4, "emergency");
    }

    interface ThermalCallback {
        /** 温度状态变化 */
        fun onThermalStatusChanged(status: ThermalStatus, temperature: Float)

        /** 建议降档级别 (0-4) */
        fun onThrottleLevelChanged(level: Int)
    }

    var callback: ThermalCallback? = null

    private val powerManager: PowerManager? =
        context.getSystemService(Context.POWER_SERVICE) as? PowerManager

    private var currentStatus = ThermalStatus.NORMAL
    private var currentThrottleLevel = THROTTLE_NONE
    private var currentTemperature = 0.0f

    /**
     * 查询当前温度状态
     */
    fun checkThermalStatus(): ThermalStatus {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            powerManager?.let { pm ->
                val status = when (pm.currentThermalStatus) {
                    PowerManager.THERMAL_STATUS_NONE -> ThermalStatus.NORMAL
                    PowerManager.THERMAL_STATUS_LIGHT -> ThermalStatus.WARM
                    PowerManager.THERMAL_STATUS_MODERATE -> ThermalStatus.HOT
                    PowerManager.THERMAL_STATUS_SEVERE -> ThermalStatus.CRITICAL
                    PowerManager.THERMAL_STATUS_CRITICAL,
                    PowerManager.THERMAL_STATUS_EMERGENCY -> ThermalStatus.EMERGENCY
                    else -> ThermalStatus.NORMAL
                }

                if (status != currentStatus) {
                    currentStatus = status
                    currentThrottleLevel = status.level
                    callback?.onThermalStatusChanged(status, currentTemperature)
                    callback?.onThrottleLevelChanged(currentThrottleLevel)
                    Log.i(TAG, "Thermal status changed: ${status.label} (level=${status.level})")
                }

                return status
            }
        }

        // Android 9 及以下：通过电池温度估算
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            val intent = context.registerReceiver(null, android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED))
            val temp = intent?.getIntExtra(android.os.BatteryManager.EXTRA_TEMPERATURE, 0)?.div(10f) ?: 0f
            currentTemperature = temp
            when {
                temp > TEMP_CRITICAL -> ThermalStatus.EMERGENCY
                temp > TEMP_HIGH -> ThermalStatus.CRITICAL
                temp > TEMP_MODERATE -> ThermalStatus.HOT
                else -> ThermalStatus.NORMAL
            }
        } else {
            ThermalStatus.NORMAL
        }
    }

    /**
     * 获取建议的处理参数
     */
    fun getRecommendedParams(): ThermalParams {
        val status = checkThermalStatus()
        return when (status) {
            ThermalStatus.NORMAL -> ThermalParams(
                previewResolution = 1920,
                maxThreads = 4,
                allowBackgroundProcessing = true,
                allowAIFeatures = true,
            )
            ThermalStatus.WARM -> ThermalParams(
                previewResolution = 1280,
                maxThreads = 3,
                allowBackgroundProcessing = true,
                allowAIFeatures = true,
            )
            ThermalStatus.HOT -> ThermalParams(
                previewResolution = 1024,
                maxThreads = 2,
                allowBackgroundProcessing = false,
                allowAIFeatures = true,
            )
            ThermalStatus.CRITICAL -> ThermalParams(
                previewResolution = 720,
                maxThreads = 1,
                allowBackgroundProcessing = false,
                allowAIFeatures = false,
            )
            ThermalStatus.EMERGENCY -> ThermalParams(
                previewResolution = 480,
                maxThreads = 1,
                allowBackgroundProcessing = false,
                allowAIFeatures = false,
            )
        }
    }

    /**
     * 获取温度状态 JSON（供 WebView 使用）
     */
    fun getThermalStatusJson(): String {
        val status = checkThermalStatus()
        val params = getRecommendedParams()
        return """{"status":"${status.label}","level":${status.level},""" +
                """"temperature":${currentTemperature},""" +
                """"previewResolution":${params.previewResolution},""" +
                """"maxThreads":${params.maxThreads},""" +
                """"allowBackgroundProcessing":${params.allowBackgroundProcessing},""" +
                """"allowAIFeatures":${params.allowAIFeatures}}"""
    }

    data class ThermalParams(
        val previewResolution: Int,
        val maxThreads: Int,
        val allowBackgroundProcessing: Boolean,
        val allowAIFeatures: Boolean,
    )
}