package io.github.CyberTimon.RapidRAW

import android.view.Surface

/**
 * RapidRAW Native Bridge
 *
 * Kotlin ↔ C++ ↔ Rust 桥接层
 * 提供 Android 原生渲染能力的 JNI 调用入口
 */
object NativeBridge {

    init {
        System.loadLibrary("native_bridge")
    }

    /** 初始化渲染 Surface（传递 ANativeWindow 给 Rust WGPU） */
    external fun initRenderSurface(surface: Surface, width: Int, height: Int)

    /** 渲染窗口尺寸变化 */
    external fun resizeRenderSurface(width: Int, height: Int)

    /** 销毁渲染表面 */
    external fun destroyRenderSurface()

    /** 释放 GPU 缓存 */
    external fun freeGpuCache()

    /** 释放 GPU 缓存（指定比例 0.0-1.0） */
    external fun freeGpuCacheFraction(fraction: Float)

    /** 获取当前渲染后端 */
    external fun getRenderBackend(): String
}