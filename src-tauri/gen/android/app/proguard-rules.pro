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

# Wry / Tauri WebView bridge
-keep class com.google.gson.** { *; }
-dontwarn com.google.gson.**

# Kotlin coroutines used by Tauri lifecycle
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# Prevent obfuscation of JNI callback classes used by Rust <-> Kotlin bridge
-keepclassmembers class io.github.CyberTimon.RapidRAW.* {
    @android.webkit.JavascriptInterface <methods>;
    native <methods>;
}

# Preserve exception stack traces for Rust panic reports
-keepattributes Exceptions,InnerClasses,Signature,Deprecated,
                SourceFile,LineNumberTable,EnclosingMethod
