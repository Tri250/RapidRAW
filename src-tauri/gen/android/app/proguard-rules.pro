# RapidRAW Android ProGuard/R8 Rules
# 保护 AI 模型和图像处理核心代码

# 保留 Tauri/WebView 相关类
-keep class io.github.CyberTimon.RapidRAW.** { *; }

# 保留 JNI 接口
-keepclasseswithmembernames class * {
    native <methods>;
}

# 保留 Rust 导出的 JNI 函数
-keep class rust.** { *; }

# 保留 ONNX Runtime 相关
-keep class ai.onnxruntime.** { *; }

# 保留 WebView JavaScript 接口
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# 保留序列化/反序列化类
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod
-keepattributes Exceptions
-keepattributes RuntimeVisibleAnnotations
-keepattributes RuntimeVisibleParameterAnnotations
-keepattributes LineNumberTable
-keepattributes SourceFile

# 保留 Serde 序列化相关（Rust 通过 JNI 传递的序列化数据）
-keep class com.google.gson.** { *; }
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# 保留 Base64 编码器（Rust 数据交换使用）
-keep class java.util.Base64.** { *; }
-keep class org.apache.commons.codec.binary.** { *; }

# 保留 Android ContentResolver 相关（MediaStore 导出使用）
-keep class android.content.ContentResolver { *; }
-keep class android.content.ContentValues { *; }
-keep class android.net.Uri { *; }
-keep class android.provider.MediaStore** { *; }
-keep class android.provider.MediaStore$** { *; }

# 保留 Android 前台服务（导出后台任务）
-keep class io.github.CyberTimon.RapidRAW.ExportForegroundService { *; }

# 保留 Android 权限处理
-keep class io.github.CyberTimon.RapidRAW.PermissionHelper { *; }

# 保留文件路径相关的序列化
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# 移除日志输出 (release 版本)
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
    public static int i(...);
}

# 防止混淆崩溃
-dontwarn javax.annotation.**
-dontwarn com.sun.jna.**
-dontwarn org.slf4j.**
-dontwarn android.provider.MediaStore**
-dontwarn kotlin.**
-dontwarn java.lang.invoke.**

# 优化设置
-optimizations code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-optimizationpasses 5
-allowaccessmodification