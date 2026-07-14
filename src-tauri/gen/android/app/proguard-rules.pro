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
