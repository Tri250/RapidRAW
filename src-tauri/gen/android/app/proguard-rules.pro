# RAW 工坊 ProGuard Rules for Android Release Builds
# Keep line numbers for debugging
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# === Tauri / JNI Rules ===
# Keep rustls-platform-verifier JNI classes
-keep, includedescriptorclasses class org.rustls.platformverifier.** { *; }

# Keep all JNI native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep Tauri generated classes
-keep class org.tauri.** { *; }
-keep class com.tauri.** { *; }

# === ONNX Runtime Rules ===
-keep class ai.onnxruntime.** { *; }
-keep class org.bytedeco.** { *; }

# === AndroidX Rules ===
-keep class androidx.core.content.FileProvider { *; }
-keep class androidx.webkit.** { *; }

# === WebView Rules ===
-keep class android.webkit.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# === Kotlin Serialization ===
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class **$$serializer { *; }
-keepclassmembers class * {
    *** Companion;
}
-keepclasseswithmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}

# === General Optimization ===
# Keep data classes used with JSON
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# Keep the application class
-keep class com.rawworkshop.desktop.** { *; }

# Keep Parcelable implementations
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Keep Serializable
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}