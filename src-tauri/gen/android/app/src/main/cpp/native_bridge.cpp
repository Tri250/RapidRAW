#include <jni.h>
#include <android/log.h>
#include <android/native_window.h>
#include <android/native_window_jni.h>
#include <android/hardware_buffer.h>
#include <android/hardware_buffer_jni.h>
#include <string>
#include <cstring>

#define LOG_TAG "RapidRAW_NativeBridge"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

/**
 * RapidRAW Native Bridge
 *
 * 连接 Android (Kotlin/Java) 与 Rust 的 C++ 桥接层
 * 提供以下能力：
 * - ANativeWindow 传递（WGPU 渲染目标）
 * - AHardwareBuffer 零拷贝（GPU→Display 直通）
 * - 内存压力通知（Rust 侧缓存释放）
 * - 渲染后端能力查询
 */

// Rust 侧导出函数声明
extern "C" {
    // 初始化 Android 渲染上下文
    void rapidraw_android_init_render(void* native_window, int width, int height);
    // 更新渲染窗口尺寸
    void rapidraw_android_resize_render(int width, int height);
    // 销毁渲染上下文
    void rapidraw_android_destroy_render();
    // 释放 GPU 缓存
    void rapidraw_android_free_gpu_cache();
    // 释放 GPU 缓存（指定比例）
    void rapidraw_android_free_gpu_cache_fraction(float fraction);
    // 获取渲染后端信息
    const char* rapidraw_android_get_render_backend();
}

// Track the current ANativeWindow for proper lifecycle management
static ANativeWindow* g_currentNativeWindow = nullptr;

extern "C" {

JNIEXPORT void JNICALL
Java_io_github_CyberTimon_RapidRAW_NativeBridge_initRenderSurface(
    JNIEnv* env,
    jclass clazz,
    jobject surface,
    jint width,
    jint height
) {
    if (surface == nullptr) {
        LOGE("initRenderSurface: surface is null");
        return;
    }

    // Release any previously held ANativeWindow
    if (g_currentNativeWindow != nullptr) {
        ANativeWindow_release(g_currentNativeWindow);
        g_currentNativeWindow = nullptr;
    }

    ANativeWindow* nativeWindow = ANativeWindow_fromSurface(env, surface);
    if (nativeWindow == nullptr) {
        LOGE("initRenderSurface: failed to get ANativeWindow from Surface");
        return;
    }

    g_currentNativeWindow = nativeWindow;

    // 设置窗口缓冲区格式为 RGBA_8888
    ANativeWindow_setBuffersGeometry(nativeWindow, width, height, AHARDWAREBUFFER_FORMAT_R8G8B8A8_UNORM);

    LOGI("initRenderSurface: ANativeWindow created, %dx%d", width, height);
    rapidraw_android_init_render(nativeWindow, width, height);
}

JNIEXPORT void JNICALL
Java_io_github_CyberTimon_RapidRAW_NativeBridge_resizeRenderSurface(
    JNIEnv* env,
    jclass clazz,
    jint width,
    jint height
) {
    LOGI("resizeRenderSurface: %dx%d", width, height);
    rapidraw_android_resize_render(width, height);
}

JNIEXPORT void JNICALL
Java_io_github_CyberTimon_RapidRAW_NativeBridge_destroyRenderSurface(
    JNIEnv* env,
    jclass clazz
) {
    LOGI("destroyRenderSurface");
    rapidraw_android_destroy_render();

    // Release the ANativeWindow reference
    if (g_currentNativeWindow != nullptr) {
        ANativeWindow_release(g_currentNativeWindow);
        g_currentNativeWindow = nullptr;
    }
}

JNIEXPORT void JNICALL
Java_io_github_CyberTimon_RapidRAW_NativeBridge_freeGpuCache(
    JNIEnv* env,
    jclass clazz
) {
    LOGI("freeGpuCache");
    rapidraw_android_free_gpu_cache();
}

JNIEXPORT void JNICALL
Java_io_github_CyberTimon_RapidRAW_NativeBridge_freeGpuCacheFraction(
    JNIEnv* env,
    jclass clazz,
    jfloat fraction
) {
    LOGI("freeGpuCacheFraction: %.2f", fraction);
    rapidraw_android_free_gpu_cache_fraction(fraction);
}

JNIEXPORT jstring JNICALL
Java_io_github_CyberTimon_RapidRAW_NativeBridge_getRenderBackend(
    JNIEnv* env,
    jclass clazz
) {
    const char* backend = rapidraw_android_get_render_backend();
    return env->NewStringUTF(backend);
}

} // extern "C"