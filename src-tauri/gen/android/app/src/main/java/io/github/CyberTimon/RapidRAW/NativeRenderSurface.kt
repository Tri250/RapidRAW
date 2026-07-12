package io.github.CyberTimon.RapidRAW

import android.content.Context
import android.graphics.PixelFormat
import android.graphics.SurfaceTexture
import android.os.Build
import android.util.AttributeSet
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.TextureView
import android.widget.FrameLayout
import java.util.concurrent.atomic.AtomicBoolean

/**
 * RapidRAW 原生渲染层
 *
 * 参考 AlcedoStudio 的 CUDA 直出架构，为 Android 端实现：
 * - SurfaceView 渲染层：WGPU 直接渲染到 Surface，零拷贝
 * - TextureView 回退：支持动画/变换场景
 * - AHardwareBuffer 零拷贝管线（API 26+）
 * - 与 WebView UI 层的层叠布局
 */
class NativeRenderSurface(context: Context, attrs: AttributeSet? = null) :
    FrameLayout(context, attrs) {

    companion object {
        private const val TAG = "NativeRenderSurface"
        private const val PREFER_VULKAN = true
    }

    enum class RenderBackend {
        VULKAN,
        GLES,
        UNAVAILABLE
    }

    /**
     * 渲染回调接口 —— 由 Rust 侧通过 JNI 调用
     */
    interface RenderCallback {
        /** 原生 Surface 已创建，Rust 侧可开始渲染 */
        fun onNativeSurfaceReady(surface: Surface, width: Int, height: Int)

        /** 原生 Surface 尺寸变化 */
        fun onNativeSurfaceSizeChanged(surface: Surface, width: Int, height: Int)

        /** 原生 Surface 即将销毁 */
        fun onNativeSurfaceDestroyed()

        /** 渲染后端就绪信息 */
        fun onRenderBackendReady(backend: String, supportsVulkan: Boolean)
    }

    // 主渲染 Surface
    private var renderSurfaceView: SurfaceView? = null
    private var renderTextureView: TextureView? = null
    private var currentSurface: Surface? = null

    // 渲染回调
    var renderCallback: RenderCallback? = null

    // 渲染状态
    private val isSurfaceReady = AtomicBoolean(false)
    private var surfaceWidth: Int = 0
    private var surfaceHeight: Int = 0

    // 使用 TextureView 还是 SurfaceView
    private var useTextureView: Boolean = false

    init {
        // 深色背景，与 RapidRAW 主题一致
        setBackgroundColor(0xFF06080C.toInt())
        initRenderSurface()
    }

    private fun initRenderSurface() {
        if (useTextureView) {
            initTextureView()
        } else {
            initSurfaceView()
        }
    }

    /**
     * SurfaceView 模式：独立的渲染层，性能最优
     * - 独立 Window 层，不受 View hierarchy 影响
     * - 支持 WGPU Vulkan/GLES 直出
     * - Android 原生合成器直接使用
     */
    private fun initSurfaceView() {
        renderSurfaceView = SurfaceView(context).apply {
            // 设置透明像素格式，允许 WebView UI 层穿透
            holder.setFormat(PixelFormat.TRANSLUCENT)

            // 设置 Z-order 在顶部，让 UI 覆盖在渲染层之上
            setZOrderOnTop(true)

            holder.addCallback(object : SurfaceHolder.Callback {
                override fun surfaceCreated(holder: SurfaceHolder) {
                    currentSurface = holder.surface
                    isSurfaceReady.set(true)
                    surfaceWidth = holder.surfaceFrame.width()
                    surfaceHeight = holder.surfaceFrame.height()

                    renderCallback?.onNativeSurfaceReady(
                        holder.surface,
                        surfaceWidth,
                        surfaceHeight
                    )
                }

                override fun surfaceChanged(
                    holder: SurfaceHolder,
                    format: Int,
                    width: Int,
                    height: Int
                ) {
                    surfaceWidth = width
                    surfaceHeight = height
                    if (isSurfaceReady.get()) {
                        renderCallback?.onNativeSurfaceSizeChanged(
                            holder.surface,
                            width,
                            height
                        )
                    }
                }

                override fun surfaceDestroyed(holder: SurfaceHolder) {
                    isSurfaceReady.set(false)
                    renderCallback?.onNativeSurfaceDestroyed()
                    currentSurface = null
                }
            })
        }

        addView(renderSurfaceView, LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.MATCH_PARENT
        ))

        // 检测 Vulkan 支持
        detectRenderBackend()
    }

    /**
     * TextureView 模式：融入 View hierarchy，支持动画/变换
     * - 可用于平滑过渡动画
     * - 在某些设备上兼容性更好
     */
    private fun initTextureView() {
        renderTextureView = TextureView(context).apply {
            isOpaque = false

            surfaceTextureListener = object : TextureView.SurfaceTextureListener {
                override fun onSurfaceTextureAvailable(
                    surfaceTexture: SurfaceTexture,
                    width: Int,
                    height: Int
                ) {
                    val surface = Surface(surfaceTexture)
                    currentSurface = surface
                    isSurfaceReady.set(true)
                    surfaceWidth = width
                    surfaceHeight = height

                    renderCallback?.onNativeSurfaceReady(surface, width, height)
                }

                override fun onSurfaceTextureSizeChanged(
                    surfaceTexture: SurfaceTexture,
                    width: Int,
                    height: Int
                ) {
                    surfaceWidth = width
                    surfaceHeight = height
                    currentSurface?.let { surface ->
                        renderCallback?.onNativeSurfaceSizeChanged(surface, width, height)
                    }
                }

                override fun onSurfaceTextureDestroyed(surfaceTexture: SurfaceTexture): Boolean {
                    isSurfaceReady.set(false)
                    renderCallback?.onNativeSurfaceDestroyed()
                    currentSurface?.release()
                    currentSurface = null
                    return true
                }

                override fun onSurfaceTextureUpdated(surfaceTexture: SurfaceTexture) {
                    // 每帧渲染后回调，可用于帧率统计
                }
            }
        }

        addView(renderTextureView, LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.MATCH_PARENT
        ))

        detectRenderBackend()
    }

    /**
     * 检测并报告渲染后端能力
     * Android 7.0+ (API 24+) 支持 Vulkan
     */
    private fun detectRenderBackend() {
        val supportsVulkan = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
        val backend = if (supportsVulkan && PREFER_VULKAN) "vulkan" else "gles"

        renderCallback?.onRenderBackendReady(backend, supportsVulkan)
    }

    /**
     * 获取当前渲染 Surface（供 JNI 传递 ANativeWindow）
     */
    fun getNativeSurface(): Surface? = currentSurface

    /**
     * 获取渲染表面尺寸
     */
    fun getSurfaceSize(): Pair<Int, Int> = Pair(surfaceWidth, surfaceHeight)

    /**
     * 是否使用 TextureView 模式
     */
    fun setUseTextureView(use: Boolean) {
        if (useTextureView != use) {
            useTextureView = use
            removeAllViews()
            currentSurface?.release()
            currentSurface = null
            isSurfaceReady.set(false)
            initRenderSurface()
        }
    }

    /**
     * 暂停渲染（Activity onPause）
     */
    fun pauseRendering() {
        // SurfaceView 在后台时 Surface 会自动销毁
        // TextureView 需要手动处理
        if (useTextureView) {
            renderCallback?.onNativeSurfaceDestroyed()
        }
    }

    /**
     * 恢复渲染（Activity onResume）
     */
    fun resumeRendering() {
        // 重新请求 Surface 创建
        if (useTextureView && renderTextureView?.isAvailable == true) {
            val st = renderTextureView!!.surfaceTexture!!
            val surface = Surface(st)
            currentSurface = surface
            isSurfaceReady.set(true)
            renderCallback?.onNativeSurfaceReady(
                surface,
                renderTextureView!!.width,
                renderTextureView!!.height
            )
        }
    }

    /**
     * 释放资源
     */
    fun release() {
        renderCallback = null
        currentSurface?.release()
        currentSurface = null
        isSurfaceReady.set(false)
    }
}