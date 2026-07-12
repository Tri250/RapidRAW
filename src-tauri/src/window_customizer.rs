use tauri::{Runtime, Webview, plugin::Plugin};

pub struct PinchZoomDisablePlugin;

#[cfg(target_os = "macos")]
const MACOS_WINDOW_RADIUS: f64 = 14.0;

#[cfg(target_os = "macos")]
unsafe fn apply_macos_window_rounding(ns_view: *mut objc::runtime::Object) {
    use objc::{msg_send, sel, sel_impl};

    if ns_view.is_null() {
        return;
    }

    let ns_window: *mut objc::runtime::Object = msg_send![ns_view, window];
    if ns_window.is_null() {
        return;
    }

    let () = msg_send![ns_window, setOpaque: false];
    let () = msg_send![ns_window, setHasShadow: true];

    let content_view: *mut objc::runtime::Object = msg_send![ns_window, contentView];
    if !content_view.is_null() {
        let () = msg_send![content_view, setWantsLayer: true];
        let content_layer: *mut objc::runtime::Object = msg_send![content_view, layer];
        if !content_layer.is_null() {
            let () = msg_send![content_layer, setCornerRadius: MACOS_WINDOW_RADIUS];
            let () = msg_send![content_layer, setMasksToBounds: true];
        }
    }

    let () = msg_send![ns_view, setWantsLayer: true];
    let webview_layer: *mut objc::runtime::Object = msg_send![ns_view, layer];
    if !webview_layer.is_null() {
        let () = msg_send![webview_layer, setCornerRadius: MACOS_WINDOW_RADIUS];
        let () = msg_send![webview_layer, setMasksToBounds: true];
    }

    let () = msg_send![ns_window, invalidateShadow];
}

#[cfg(target_os = "android")]
unsafe fn configure_android_webview(_webview: *mut std::ffi::c_void) {
    // Android WebView 触摸和渲染优化
    // 通过 JNI 调用 WebView 设置
    use jni::objects::{JObject, JValue};
    use jni::JNIEnv;

    let vm = match jni::JavaVM::from_raw(ndk_context::android_context().vm().cast()) {
        Ok(vm) => vm,
        Err(_) => return,
    };
    let mut env = match vm.attach_current_thread() {
        Ok(env) => env,
        Err(_) => return,
    };

    // 获取 WebView 实例
    let webview_obj = unsafe { JObject::from_raw(_webview.cast()) };
    if webview_obj.is_null() {
        return;
    }

    // 获取 WebSettings
    if let Ok(settings) = env.call_method(
        &webview_obj,
        "getSettings",
        "()Landroid/webkit/WebSettings;",
        &[],
    )
    .and_then(|v| v.l())
    {
        let settings = settings.as_obj();

        // 启用硬件加速渲染
        let _ = env.call_method(settings, "setRenderPriority", "(Landroid/webkit/WebSettings$RenderPriority;)V",
            &[JValue::from(env.find_class("android/webkit/WebSettings$RenderPriority")
                .and_then(|cls| env.get_static_field(cls, "HIGH", "Landroid/webkit/WebSettings$RenderPriority;")
                    .and_then(|v| v.l())).unwrap_or(JObject::null()))]);

        // 优化触摸滚动
        let _ = env.call_method(settings, "setSupportZoom", "(Z)V", &[JValue::from(false)]);
        let _ = env.call_method(settings, "setBuiltInZoomControls", "(Z)V", &[JValue::from(false)]);
        let _ = env.call_method(settings, "setDisplayZoomControls", "(Z)V", &[JValue::from(false)]);
        let _ = env.call_method(settings, "setAllowFileAccess", "(Z)V", &[JValue::from(true)]);
        let _ = env.call_method(settings, "setDomStorageEnabled", "(Z)V", &[JValue::from(true)]);
        let _ = env.call_method(settings, "setDatabaseEnabled", "(Z)V", &[JValue::from(true)]);
        // 使用更平滑的滚动
        let _ = env.call_method(settings, "setLoadWithOverviewMode", "(Z)V", &[JValue::from(true)]);
        let _ = env.call_method(settings, "setUseWideViewPort", "(Z)V", &[JValue::from(true)]);
    }

    // 设置 WebView 透明背景
    let _ = env.call_method(&webview_obj, "setBackgroundColor", "(I)V", &[JValue::from(0x00000000)]);
}

impl Default for PinchZoomDisablePlugin {
    fn default() -> Self {
        Self
    }
}

impl<R: Runtime> Plugin<R> for PinchZoomDisablePlugin {
    fn name(&self) -> &'static str {
        "Does not matter here"
    }

    fn webview_created(&mut self, webview: Webview<R>) {
        let _ = webview.with_webview(|_webview| {
            #[cfg(target_os = "macos")]
            unsafe {
                apply_macos_window_rounding(_webview.inner().cast());
            }

            #[cfg(target_os = "android")]
            unsafe {
                configure_android_webview(_webview.inner().cast());
            }

            #[cfg(target_os = "linux")]
            unsafe {
                use gtk::GestureZoom;
                use gtk::glib::ObjectExt;
                use webkit2gtk::glib::gobject_ffi;

                if let Some(data) = _webview.inner().data::<GestureZoom>("wk-view-zoom-gesture") {
                    gobject_ffi::g_signal_handlers_destroy(data.as_ptr().cast());
                }
            }
        });
    }
}
