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

    let vm = match unsafe {
        jni::JavaVM::from_raw(ndk_context::android_context().vm().cast())
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
            JObject::from_raw(ndk_context::android_context().context().cast())
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

    let vm = match unsafe {
        jni::JavaVM::from_raw(ndk_context::android_context().vm().cast())
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
            JObject::from_raw(ndk_context::android_context().context().cast())
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

    // 使用 JNI 启动权限请求 Activity
    use jni::objects::JObject;

    let vm = match unsafe {
        jni::JavaVM::from_raw(ndk_context::android_context().vm().cast())
    } {
        Ok(vm) => vm,
        Err(_) => return false,
    };

    let mut env = match vm.attach_current_thread() {
        Ok(env) => env,
        Err(_) => return false,
    };

    let context = env
        .new_local_ref(unsafe {
            JObject::from_raw(ndk_context::android_context().context().cast())
        })
        .unwrap_or_else(|_| JObject::null());

    // 转换为 Java 字符串数组
    let string_class = match env.find_class("java/lang/String") {
        Ok(cls) => cls,
        Err(_) => return false,
    };

    let perm_array = match env.new_object_array(
        denied.len() as i32,
        &string_class,
        &JObject::null(),
    ) {
        Ok(arr) => arr,
        Err(_) => return false,
    };

    for (i, perm) in denied.iter().enumerate() {
        let perm_str = match env.new_string(perm) {
            Ok(s) => s,
            Err(_) => return false,
        };
        let _ = env.set_object_array_element(&perm_array, i as i32, &perm_str);
    }

    // 调用 requestPermissions (需要 Activity 上下文)
    let request_result = env.call_static_method(
        "io/github/CyberTimon/RapidRAW/PermissionHelper",
        "requestPermissions",
        "(Landroid/app/Activity;[Ljava/lang/String;)V",
        &[(&context).into(), (&perm_array).into()],
    );

    // 权限请求是异步的，无法立即确认授予结果
    // 返回 true 表示请求已成功发起，false 表示请求发起失败
    request_result.is_ok()
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
    let denied = check_and_request_permissions();
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
