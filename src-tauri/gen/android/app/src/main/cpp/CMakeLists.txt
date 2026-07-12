# RapidRAW Android Native Bridge
# 用于 Rust 编译产物与 Android 原生代码的桥接
cmake_minimum_required(VERSION 3.22.1)
project("rapidraw_native_bridge")

# 预编译的 Rust 动态库
add_library(rapidraw_lib SHARED IMPORTED)
set_target_properties(rapidraw_lib PROPERTIES
    IMPORTED_LOCATION ${CMAKE_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/librapidraw_lib.so
)

# 原生桥接层（Kotlin ↔ Rust 辅助函数）
add_library(native_bridge SHARED
    native_bridge.cpp
)

# Android 15+ (API 35) 16KB 页大小对齐支持
target_link_options(native_bridge PRIVATE
    "-Wl,-z,max-page-size=16384"
)

# 链接 Rust 库和 Android 系统库
target_link_libraries(native_bridge
    rapidraw_lib
    android
    log
    GLESv3
    EGL
    vulkan
    jnigraphics
)