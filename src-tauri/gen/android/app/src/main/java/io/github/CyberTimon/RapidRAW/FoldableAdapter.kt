package io.github.CyberTimon.RapidRAW

import android.content.Context
import android.content.res.Configuration
import android.graphics.Rect
import android.os.Build
import android.util.DisplayMetrics
import android.view.WindowMetrics
import android.window.ScreenArea
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.DisplayFeature
import androidx.window.layout.FoldingFeature
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/**
 * 折叠屏 / 平板 / 横屏适配器
 *
 * 处理：
 * - 折叠屏展开/折叠状态
 * - 横屏编辑模式
 * - 平板大屏布局
 * - 分屏模式
 */
class FoldableAdapter(private val context: Context) {

    enum class DeviceState {
        PHONE_PORTRAIT,     // 手机竖屏
        PHONE_LANDSCAPE,    // 手机横屏
        TABLET_PORTRAIT,    // 平板竖屏
        TABLET_LANDSCAPE,   // 平板横屏
        FOLDABLE_CLOSED,    // 折叠屏折叠
        FOLDABLE_OPENED,    // 折叠屏展开
        FOLDABLE_HALF_OPENED, // 折叠屏半开（桌面模式）
        DESKTOP_MODE,       // 桌面模式（Samsung DeX 等）
    }

    enum class LayoutMode {
        SINGLE_PANEL,       // 单面板（手机模式）
        DUAL_PANEL,         // 双面板（平板/折叠屏展开）
        EDITOR_ONLY,        // 仅编辑器
        LIBRARY_ONLY,       // 仅图库
        SPLIT_VIEW,         // 分屏视图
    }

    /**
     * 检测当前设备状态
     */
    fun detectDeviceState(): DeviceState {
        val config = context.resources.configuration

        val isTablet = isTablet()
        val isFoldable = isFoldable()
        val isLandscape = config.orientation == Configuration.ORIENTATION_LANDSCAPE
        val isDesktopMode = isDesktopMode()

        return when {
            isDesktopMode -> DeviceState.DESKTOP_MODE
            isFoldable && isFoldedOpen() -> DeviceState.FOLDABLE_OPENED
            isFoldable && !isFoldedOpen() -> DeviceState.FOLDABLE_CLOSED
            isTablet && isLandscape -> DeviceState.TABLET_LANDSCAPE
            isTablet -> DeviceState.TABLET_PORTRAIT
            isLandscape -> DeviceState.PHONE_LANDSCAPE
            else -> DeviceState.PHONE_PORTRAIT
        }
    }

    /**
     * 根据设备状态推荐布局模式
     */
    fun recommendLayout(state: DeviceState): LayoutMode {
        return when (state) {
            DeviceState.PHONE_PORTRAIT -> LayoutMode.SINGLE_PANEL
            DeviceState.PHONE_LANDSCAPE -> LayoutMode.EDITOR_ONLY
            DeviceState.TABLET_PORTRAIT -> LayoutMode.SINGLE_PANEL
            DeviceState.TABLET_LANDSCAPE -> LayoutMode.DUAL_PANEL
            DeviceState.FOLDABLE_CLOSED -> LayoutMode.SINGLE_PANEL
            DeviceState.FOLDABLE_OPENED -> LayoutMode.DUAL_PANEL
            DeviceState.FOLDABLE_HALF_OPENED -> LayoutMode.SPLIT_VIEW
            DeviceState.DESKTOP_MODE -> LayoutMode.DUAL_PANEL
        }
    }

    /**
     * 是否为平板
     */
    fun isTablet(): Boolean {
        val config = context.resources.configuration
        val screenLayout = config.screenLayout and Configuration.SCREENLAYOUT_SIZE_MASK
        return screenLayout >= Configuration.SCREENLAYOUT_SIZE_LARGE ||
               (config.smallestScreenWidthDp >= 600)
    }

    /**
     * 是否为折叠屏设备
     */
    fun isFoldable(): Boolean {
        // 检测已知折叠屏型号
        val model = Build.MODEL.lowercase()
        val brand = Build.BRAND.lowercase()
        return model.contains("fold") || model.contains("flip") ||
               model.contains("mate x") || model.contains("magic v") ||
               model.contains("pixel fold") || model.contains("galaxy z") ||
               model.contains("mix fold") || model.contains("find n") ||
               model.contains("vivo fold") || model.contains("ph-1")
    }

    /**
     * 折叠屏是否处于展开状态
     */
    fun isFoldedOpen(): Boolean {
        // 通过屏幕尺寸判断
        val metrics = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            context.display?.let { display ->
                val bounds = display.currentWindowMetrics.bounds
                val shortest = minOf(bounds.width(), bounds.height())
                shortest > 1800 // 展开后短边通常 > 180dp
            } ?: false
        } else {
            val dm = context.resources.displayMetrics
            val shortestDp = minOf(dm.widthPixels, dm.heightPixels) / dm.density
            shortestDp > 600
        }
        return metrics
    }

    /**
     * 是否为桌面模式（Samsung DeX、华为桌面模式）
     */
    fun isDesktopMode(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            context.packageManager.hasSystemFeature("com.samsung.android.feature.desktopmode") ||
            context.packageManager.hasSystemFeature("com.huawei.hardware.desktopmode") ||
            context.packageManager.hasSystemFeature("com.microsoft.windows.desktopmode")
        } else false
    }

    /**
     * 获取可用显示区域（排除折叠铰链等区域）
     */
    fun getContentBounds(): Rect {
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as? android.view.WindowManager
        val rect = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            wm?.currentWindowMetrics?.bounds ?: Rect(0, 0, 1080, 1920)
        } else {
            val dm = context.resources.displayMetrics
            Rect(0, 0, dm.widthPixels, dm.heightPixels)
        }
        return rect
    }

    /**
     * 获取推荐的面板分割比例
     */
    fun getPanelSplitRatio(state: DeviceState): Float {
        return when (state) {
            DeviceState.TABLET_LANDSCAPE -> 0.4f   // 左侧图库 40%
            DeviceState.FOLDABLE_OPENED -> 0.35f    // 左侧图库 35%
            DeviceState.DESKTOP_MODE -> 0.3f        // 左侧图库 30%
            else -> 0.0f
        }
    }

    /**
     * 获取设备状态描述（用于 WebView 通知）
     */
    fun getDeviceStateJson(): String {
        val state = detectDeviceState()
        val layout = recommendLayout(state)
        val bounds = getContentBounds()
        val ratio = getPanelSplitRatio(state)

        return """{"deviceState":"${state.name}","layoutMode":"${layout.name}",""" +
               """"bounds":{"left":${bounds.left},"top":${bounds.top},""" +
               """"right":${bounds.right},"bottom":${bounds.bottom}},""" +
               """"splitRatio":$ratio,"isTablet":${isTablet()},""" +
               """"isFoldable":${isFoldable()},"isFoldedOpen":${isFoldedOpen()},""" +
               """"isDesktopMode":${isDesktopMode()}}"""
    }
}
