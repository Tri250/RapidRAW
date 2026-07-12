package io.github.CyberTimon.RapidRAW

import android.content.Context
import android.content.SharedPreferences

/**
 * 新手引导管理器
 *
 * 管理首次启动时的引导页面展示
 */
class OnboardingManager(context: Context) {

    companion object {
        private const val PREFS_NAME = "rapidraw_onboarding"
        private const val KEY_ONBOARDING_COMPLETED = "onboarding_completed"
        private const val KEY_ONBOARDING_VERSION = "onboarding_version"
        private const val CURRENT_VERSION = 1
    }

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /**
     * 是否需要显示引导页
     */
    fun shouldShowOnboarding(): Boolean {
        val completed = prefs.getBoolean(KEY_ONBOARDING_COMPLETED, false)
        val version = prefs.getInt(KEY_ONBOARDING_VERSION, 0)
        return !completed || version < CURRENT_VERSION
    }

    /**
     * 标记引导页已完成
     */
    fun markOnboardingCompleted() {
        prefs.edit()
            .putBoolean(KEY_ONBOARDING_COMPLETED, true)
            .putInt(KEY_ONBOARDING_VERSION, CURRENT_VERSION)
            .apply()
    }

    /**
     * 重置引导（用于调试）
     */
    fun resetOnboarding() {
        prefs.edit().clear().apply()
    }

    /**
     * 引导页数据
     */
    data class OnboardingPage(
        val title: String,
        val description: String,
        val icon: String
    )

    /**
     * 获取引导页列表
     */
    fun getOnboardingPages(): List<OnboardingPage> {
        return listOf(
            OnboardingPage(
                title = "欢迎使用 RapidRAW",
                description = "专业 RAW 图片编辑器，为摄影爱好者打造",
                icon = "📷"
            ),
            OnboardingPage(
                title = "导入你的照片",
                description = "支持佳能、尼康、索尼、富士等主流相机的 RAW 格式，也支持 JPEG、TIFF、PNG",
                icon = "📂"
            ),
            OnboardingPage(
                title = "专业色彩调整",
                description = "ACES 2.0 色彩管线，精确的曝光、白平衡、HSL 调整，相机内色彩配置文件一键还原",
                icon = "🎨"
            ),
            OnboardingPage(
                title = "手势操作",
                description = "双指缩放查看细节，长按对比原图，双击重置视图",
                icon = "👆"
            ),
            OnboardingPage(
                title = "导出与分享",
                description = "一键导出高质量 JPEG，添加水印保护作品，直接分享到社交平台",
                icon = "📤"
            ),
        )
    }
}
