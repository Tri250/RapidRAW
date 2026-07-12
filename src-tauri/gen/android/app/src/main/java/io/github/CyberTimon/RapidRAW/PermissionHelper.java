package io.github.CyberTimon.RapidRAW;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.content.Intent;
import android.net.Uri;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

/**
 * RapidRAW Android 权限管理辅助类
 * 处理运行时权限请求和所有文件访问权限
 */
public class PermissionHelper {

    private static final int REQUEST_CODE_PERMISSIONS = 1001;
    private static final int REQUEST_CODE_MANAGE_STORAGE = 1002;

    /**
     * 从前端调用的权限请求方法
     */
    public static void requestPermissions(Activity activity, String[] permissions) {
        if (activity == null || permissions == null) {
            return;
        }
        ActivityCompat.requestPermissions(activity, permissions, REQUEST_CODE_PERMISSIONS);
    }

    /**
     * 请求管理所有文件权限 (Android 11+)
     */
    public static void requestManageStoragePermission(Activity activity) {
        if (activity == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!Environment.isExternalStorageManager()) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                intent.setData(Uri.parse("package:" + activity.getPackageName()));
                activity.startActivityForResult(intent, REQUEST_CODE_MANAGE_STORAGE);
            }
        }
    }

    /**
     * 检查所有必需权限是否已授予
     */
    public static boolean hasAllRequiredPermissions(Activity activity) {
        if (activity == null) return false;

        String[] requiredPermissions = getRequiredPermissions();
        for (String permission : requiredPermissions) {
            if (ContextCompat.checkSelfPermission(activity, permission)
                    != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    /**
     * 获取仍然缺失的权限列表
     */
    public static String[] getMissingPermissions(Activity activity) {
        if (activity == null) return new String[0];

        List<String> missing = new ArrayList<>();
        String[] requiredPermissions = getRequiredPermissions();

        for (String permission : requiredPermissions) {
            if (ContextCompat.checkSelfPermission(activity, permission)
                    != PackageManager.PERMISSION_GRANTED) {
                missing.add(permission);
            }
        }
        return missing.toArray(new String[0]);
    }

    /**
     * 获取应用所需的全部权限列表
     */
    private static String[] getRequiredPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+
            return new String[]{
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.ACCESS_MEDIA_LOCATION,
                Manifest.permission.INTERNET,
                Manifest.permission.ACCESS_NETWORK_STATE,
                Manifest.permission.FOREGROUND_SERVICE,
            };
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10-12
            return new String[]{
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.ACCESS_MEDIA_LOCATION,
                Manifest.permission.INTERNET,
                Manifest.permission.ACCESS_NETWORK_STATE,
                Manifest.permission.FOREGROUND_SERVICE,
            };
        } else {
            // Android 8-9
            return new String[]{
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE,
                Manifest.permission.INTERNET,
                Manifest.permission.ACCESS_NETWORK_STATE,
            };
        }
    }
}