# Tauri WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve line numbers for debugging stack traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Tauri native bindings
-keep class app.tauri.** { *; }
-keep class io.github.CyberTimon.RapidRAW.** { *; }

# Rust JNI bindings
-keepclasseswithmembernames class * {
    native <methods>;
}

# WebView related
-keep class android.webkit.** { *; }
-dontwarn android.webkit.**

# AndroidX FileProvider
-keep class androidx.core.content.FileProvider { *; }

# Activity and Application classes
-keep class * extends android.app.Activity { *; }
-keep class * extends android.app.Application { *; }

# Keep all native methods in Rust-generated classes
-keepclasseswithmembernames class * {
    native <methods>;
}

# Preserve annotations
-keepattributes *Annotation*

# Preserve generic type information
-keepattributes Signature

# Preserve exceptions
-keepattributes Exceptions

# Kotlin coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}

# WebKit
-keep class androidx.webkit.** { *; }
-dontwarn androidx.webkit.**
