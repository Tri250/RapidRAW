package io.github.CyberTimon.RapidRAW

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.os.Build
import java.util.ArrayList

/**
 * RapidRAW Android 原生快捷方式管理器
 *
 * 实现 Android 原生 Shortcuts 功能：
 * - 静态快捷方式（通过 XML 定义）
 * - 动态快捷方式（运行时创建）
 * - 固定快捷方式（用户可固定到桌面）
 */
class ShortcutHelper(private val context: Context) {

    companion object {
        private const val SHORTCUT_ID_OPEN_RECENT = "open_recent"
        private const val SHORTCUT_ID_IMPORT_IMAGE = "import_image"
        private const val SHORTCUT_ID_OPEN_LIBRARY = "open_library"
        private const val SHORTCUT_ID_QUICK_EXPORT = "quick_export"
    }

    /**
     * 更新动态快捷方式
     */
    fun updateDynamicShortcuts(recentImagePath: String? = null) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return

        val shortcutManager = context.getSystemService(ShortcutManager::class.java) ?: return

        val shortcuts = ArrayList<ShortcutInfo>()

        // 快捷方式 1：打开最近编辑的图片
        if (recentImagePath != null) {
            shortcuts.add(
                ShortcutInfo.Builder(context, SHORTCUT_ID_OPEN_RECENT)
                    .setShortLabel("最近编辑")
                    .setLongLabel("打开最近编辑的图片")
                    .setIcon(Icon.createWithResource(context, android.R.drawable.ic_menu_edit))
                    .setIntent(
                        Intent(context, MainActivity::class.java).apply {
                            action = Intent.ACTION_VIEW
                            data = android.net.Uri.parse(recentImagePath)
                        }
                    )
                    .build()
            )
        }

        // 快捷方式 2：导入图片
        shortcuts.add(
            ShortcutInfo.Builder(context, SHORTCUT_ID_IMPORT_IMAGE)
                .setShortLabel("导入图片")
                .setLongLabel("导入新图片到 RapidRAW")
                .setIcon(Icon.createWithResource(context, android.R.drawable.ic_menu_add))
                .setIntent(
                    Intent(context, MainActivity::class.java).apply {
                        action = "io.github.CyberTimon.RapidRAW.ACTION_IMPORT"
                    }
                )
                .build()
        )

        // 快捷方式 3：打开图库
        shortcuts.add(
            ShortcutInfo.Builder(context, SHORTCUT_ID_OPEN_LIBRARY)
                .setShortLabel("图库")
                .setLongLabel("打开 RapidRAW 图库")
                .setIcon(Icon.createWithResource(context, android.R.drawable.ic_menu_gallery))
                .setIntent(
                    Intent(context, MainActivity::class.java).apply {
                        action = "io.github.CyberTimon.RapidRAW.ACTION_LIBRARY"
                    }
                )
                .build()
        )

        // 快捷方式 4：快速导出
        shortcuts.add(
            ShortcutInfo.Builder(context, SHORTCUT_ID_QUICK_EXPORT)
                .setShortLabel("快速导出")
                .setLongLabel("导出最后编辑的图片")
                .setIcon(Icon.createWithResource(context, android.R.drawable.ic_menu_share))
                .setIntent(
                    Intent(context, MainActivity::class.java).apply {
                        action = "io.github.CyberTimon.RapidRAW.ACTION_QUICK_EXPORT"
                    }
                )
                .build()
        )

        shortcutManager.dynamicShortcuts = shortcuts
    }

    /**
     * 清除所有动态快捷方式
     */
    fun clearDynamicShortcuts() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return
        val shortcutManager = context.getSystemService(ShortcutManager::class.java) ?: return
        shortcutManager.removeAllDynamicShortcuts()
    }
}