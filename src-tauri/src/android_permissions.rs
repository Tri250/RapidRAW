use tauri::Manager;

/// Android 权限列表
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AndroidPermission {
    /// 读取图片 (Android 13+)
    ReadMediaImages,
    /// 读取视频 (Android 13+)
    ReadMediaVideo,
    /// 读取外部存储 (Android 12-)
    ReadExternalStorage,
    /// 写入外部存储 (Android 10-)
    WriteExternalStorage,
    /// 访问 EXIF 地理位置 (Android 10+)
    AccessMediaLocation,
    /// 管理所有文件 (Android 11+)
    ManageExternalStorage,
    /// 前台服务 (导出任务)
    ForegroundService,
    /// 网络访问
    Internet,
}

impl AndroidPermission {
    fn permission_name(&self) -> &'static str {
        match self {
            Self::ReadMediaImages => "android.permission.READ_MEDIA_IMAGES",
            Self::ReadMediaVideo => "android.permission.READ_MEDIA_VIDEO",
            Self::ReadExternalStorage => "android.permission.READ_EXTERNAL_STORAGE",
            Self::WriteExternalStorage => "android.permission.WRITE_EXTERNAL_STORAGE",
            Self::AccessMediaLocation => "android.permission.ACCESS_MEDIA_LOCATION",
            Self::ManageExternalStorage => "android.permission.MANAGE_EXTERNAL_STORAGE",
            Self::ForegroundService => "android.permission.FOREGROUND_SERVICE",
            Self::Internet => "android.permission.INTERNET",
        }
    }
}

/// 所需的全部权限列表
const REQUIRED_PERMISSIONS: &[AndroidPermission] = &[
    AndroidPermission::ReadMediaImages,
    AndroidPermission::ReadExternalStorage,
    AndroidPermission::WriteExternalStorage,
    AndroidPermission::AccessMediaLocation,
    AndroidPermission::Internet,
];

/// 检查并请求 Android 运行时权限
/// 返回未被授予的权限列表
#[cfg(target_os = "android")]
pub fn check_and_request_permissions() -> Vec<String> {
    use jni::objects::JObject;
    use jni::JNIEnv;

    // Validate ndk_context before using it
    let ctx = ndk_context::android_context();
    if ctx.vm().is_null() || ctx.context().is_null() {
        log::error!("Android: ndk_context not initialized - cannot check permissions");
        return vec![];
    }

    let vm = match unsafe {
        jni::JavaVM::from_raw(ctx.vm().cast())
    } {
        Ok(vm) => vm,
        Err(_) => return vec![],
    };

    let mut env = match vm.attach_current_thread() {
        Ok(env) => env,
        Err(_) => return vec![],
    };

    let context = env
        .new_local_ref(unsafe {
            JObject::from_raw(ctx.context().cast())
        })
        .unwrap_or_else(|_| JObject::null());

    let mut denied_permissions: Vec<String> = Vec::new();

    for permission in REQUIRED_PERMISSIONS {
        let perm_name = match env.new_string(permission.permission_name()) {
            Ok(s) => s,
            Err(_) => match env.new_string("") {
                Ok(s) => s,
                Err(_) => continue,
            },
        };

        let has_permission = env
            .call_method(
                &context,
                "checkSelfPermission",
                "(Ljava/lang/String;)I",
                &[(&perm_name).into()],
            )
            .and_then(|v| v.i())
            .unwrap_or(-1);

        // 0 = PackageManager.PERMISSION_GRANTED
        if has_permission != 0 {
            denied_permissions.push(permission.permission_name().to_string());
        }
    }

    denied_permissions
}

#[cfg(not(target_os = "android"))]
pub fn check_and_request_permissions() -> Vec<String> {
    vec![]
}

/// 检查是否允许访问所有文件（Android 11+）
#[cfg(target_os = "android")]
pub fn has_manage_external_storage_permission() -> bool {
    use jni::objects::JObject;

    // Validate ndk_context before using it
    let ctx = ndk_context::android_context();
    if ctx.vm().is_null() || ctx.context().is_null() {
        log::error!("Android: ndk_context not initialized - cannot check MANAGE_EXTERNAL_STORAGE");
        return false;
    }

    let vm = match unsafe {
        jni::JavaVM::from_raw(ctx.vm().cast())
    } {
        Ok(vm) => vm,
        Err(_) => return false,
    };

    let mut env = match vm.attach_current_thread() {
        Ok(env) => env,
        Err(_) => return false,
    };

    // 检查是否是 Android 11+ (API 30+)
    if let Ok(build_version) = env
        .find_class("android/os/Build$VERSION")
        .and_then(|cls| {
            env.get_static_field(cls, "SDK_INT", "I")
                .and_then(|v| v.i())
        })
    {
        if build_version < 30 {
            return true; // Android 10 及以下，不需要此权限
        }
    }

    let context = env
        .new_local_ref(unsafe {
            JObject::from_raw(ctx.context().cast())
        })
        .unwrap_or_else(|_| JObject::null());

    let perm_str = match env.new_string("android.permission.MANAGE_EXTERNAL_STORAGE") {
        Ok(s) => s,
        Err(_) => return false,
    };

    env.call_method(
        &context,
        "checkSelfPermission",
        "(Ljava/lang/String;)I",
        &[(&perm_str).into()],
    )
    .and_then(|v| v.i())
    .unwrap_or(-1)
        == 0
}

#[cfg(not(target_os = "android"))]
pub fn has_manage_external_storage_permission() -> bool {
    true
}

/// 请求运行时权限
/// 返回 true 表示请求已成功发起或所有权限已授予
#[cfg(target_os = "android")]
pub fn request_permissions() -> bool {
    let denied = check_and_request_permissions();
    if denied.is_empty() {
        return true;
    }

    log::warn!(
        "Android: Permissions need to be granted via system settings: {:?}",
        denied
    );

    // Note: On Android, permissions should be requested via the frontend
    // using Tauri's standard permission APIs or system intents.
    // Direct Activity-based permission request requires access to the
    // current Activity which is not available from background threads.
    false
}

#[cfg(not(target_os = "android"))]
pub fn request_permissions() -> bool {
    true
}

/// Tauri 命令：检查 Android 权限状态
#[tauri::command]
pub fn android_check_permissions() -> Result<bool, String> {
    let denied = check_and_request_permissions();
    Ok(denied.is_empty())
}

/// Tauri 命令：请求 Android 权限
#[tauri::command]
pub fn android_request_permissions() -> Result<bool, String> {
    Ok(request_permissions())
}

/// Tauri 命令：检查是否拥有所有文件访问权限
#[tauri::command]
pub fn android_has_manage_storage() -> Result<bool, String> {
    Ok(has_manage_external_storage_permission())
}

/// 初始化 Android 权限检查（在 app 启动时调用）
#[cfg(target_os = "android")]
pub fn init_permissions(app: &tauri::AppHandle) {
    use tauri::Emitter;

    // Safely check permissions, catching any JNI errors
    let denied = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        check_and_request_permissions()
    })) {
        Ok(result) => result,
        Err(_) => {
            log::error!("Android: Panic during permission check - ndk_context may not be initialized");
            let _ = app.emit("android-permissions-missing", vec!["android.permission.INTERNET".to_string()]);
            return;
        }
    };

    if !denied.is_empty() {
        log::warn!(
            "Android: 以下权限未被授予: {:?}",
            denied
        );
        // 通过事件通知前端权限缺失
        let _ = app.emit("android-permissions-missing", denied);
    } else {
        log::info!("Android: 所有必需权限已授予");
        let _ = app.emit("android-permissions-granted", true);
    }
}

#[cfg(not(target_os = "android"))]
pub fn init_permissions(_app: &tauri::AppHandle) {
    // No-op on non-Android platforms
}
