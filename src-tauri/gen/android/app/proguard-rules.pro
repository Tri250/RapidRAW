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

# 移除日志输出 (release 版本)
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
    public static int i(...);
}

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

# 防止混淆崩溃
-dontwarn javax.annotation.**
-dontwarn com.sun.jna.**
-dontwarn org.slf4j.**