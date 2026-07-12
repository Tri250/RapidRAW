package io.github.CyberTimon.RapidRAW

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

/**
 * 国产手机厂商适配器
 * 
 * 处理华为 HMS、小米 MIUI、OPPO ColorOS、vivo OriginOS 的特殊适配需求
 */
object OEMAdapter {
    private const val TAG = "OEMAdapter"
    
    enum class OEM {
        HUAWEI,    // 华为 / 荣耀
        XIAOMI,    // 小米 / Redmi
        OPPO,      // OPPO
        VIVO,      // vivo
        SAMSUNG,   // 三星
        GOOGLE,    // Pixel / 原生
        OTHER      // 其他
    }
    
    /**
     * 检测当前设备厂商
     */
    fun detectOEM(): OEM {
        val manufacturer = Build.MANUFACTURER.lowercase()
        val brand = Build.BRAND.lowercase()
        
        return when {
            manufacturer.contains("huawei") || brand.contains("huawei") || 
            manufacturer.contains("honor") || brand.contains("honor") -> OEM.HUAWEI
            manufacturer.contains("xiaomi") || brand.contains("xiaomi") ||
            manufacturer.contains("redmi") || brand.contains("redmi") -> OEM.XIAOMI
            manufacturer.contains("oppo") || brand.contains("oppo") ||
            manufacturer.contains("oneplus") || brand.contains("oneplus") -> OEM.OPPO
            manufacturer.contains("vivo") || brand.contains("vivo") ||
            manufacturer.contains("iqoo") || brand.contains("iqoo") -> OEM.VIVO
            manufacturer.contains("samsung") || brand.contains("samsung") -> OEM.SAMSUNG
            manufacturer.contains("google") || brand.contains("google") -> OEM.GOOGLE
            else -> OEM.OTHER
        }
    }
    
    /**
     * 引导用户关闭电池优化（适用于所有国产 ROM）
     */
    fun requestBatteryOptimizationWhitelist(context: Context) {
        val oem = detectOEM()
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        
        if (powerManager != null && !powerManager.isIgnoringBatteryOptimizations(context.packageName)) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
            }
            if (intent.resolveActivity(context.packageManager) != null) {
                context.startActivity(intent)
            }
        }
        
        // 各厂商额外引导
        when (oem) {
            OEM.HUAWEI -> {
                // 华为：引导到应用启动管理
                try {
                    val intent = Intent().apply {
                        component = android.content.ComponentName(
                            "com.huawei.systemmanager",
                            "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
                        )
                    }
                    if (intent.resolveActivity(context.packageManager) != null) {
                        // 保存引导状态，避免重复弹窗
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Huawei startup manager not available")
                }
            }
            OEM.XIAOMI -> {
                // 小米：引导到自启动管理
                try {
                    val intent = Intent().apply {
                        component = android.content.ComponentName(
                            "com.miui.securitycenter",
                            "com.miui.permcenter.autostart.AutoStartManagementActivity"
                        )
                    }
                    if (intent.resolveActivity(context.packageManager) != null) {
                        // 保存引导状态
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "MIUI autostart manager not available")
                }
            }
            OEM.OPPO -> {
                // OPPO：引导到后台冻结管理
                try {
                    val intent = Intent().apply {
                        component = android.content.ComponentName(
                            "com.coloros.oppoguardelf",
                            "com.coloros.oppoguardelf.MainActivity"
                        )
                    }
                    if (intent.resolveActivity(context.packageManager) != null) {
                        // 保存引导状态
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "ColorOS guard elf not available")
                }
            }
            else -> {}
        }
    }
    
    /**
     * 检查华为 HMS 服务是否可用
     */
    fun isHMSCoreAvailable(context: Context): Boolean {
        return try {
            context.packageManager.getPackageInfo("com.huawei.hwid", 0)
            true
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * 获取华为 HMS Core 版本
     */
    fun getHMSCoreVersion(context: Context): String? {
        return try {
            val info = context.packageManager.getPackageInfo("com.huawei.hwid", 0)
            info.versionName
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * 获取设备信息（用于调试和兼容性报告）
     */
    fun getDeviceInfo(context: Context): String {
        return """
Device: ${Build.MANUFACTURER} ${Build.MODEL}
Brand: ${Build.BRAND}
OEM: ${detectOEM().name}
Android: ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})
CPU: ${Build.SUPPORTED_ABIS.joinToString(", ")}
HMS: ${if (isHMSCoreAvailable(context)) getHMSCoreVersion(context) ?: "unknown" else "N/A"}
        """.trimIndent()
    }
}