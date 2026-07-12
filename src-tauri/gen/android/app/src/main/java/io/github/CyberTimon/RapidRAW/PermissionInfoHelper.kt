package io.github.CyberTimon.RapidRAW

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

/**
 * 权限检查辅助类
 *
 * 统一管理所有权限检查逻辑，包括：
 * - 必需权限 vs 可选权限区分
 * - Android 版本适配（分叉权限声明）
 * - 权限用途说明（供隐私政策引用）
 */
object PermissionInfoHelper {

    data class PermissionInfo(
        val permission: String,
        val required: Boolean,
        val minSdk: Int,
        val maxSdk: Int = Int.MAX_VALUE,
        val rationale: String
    )

    val ALL_PERMISSIONS = listOf(
        PermissionInfo(
            permission = Manifest.permission.READ_MEDIA_IMAGES,
            required = true,
            minSdk = 33,
            rationale = "读取照片和 RAW 文件"
        ),
        PermissionInfo(
            permission = Manifest.permission.READ_EXTERNAL_STORAGE,
            required = true,
            minSdk = 26,
            maxSdk = 32,
            rationale = "读取照片和 RAW 文件"
        ),
        PermissionInfo(
            permission = Manifest.permission.WRITE_EXTERNAL_STORAGE,
            required = true,
            minSdk = 26,
            maxSdk = 29,
            rationale = "导出编辑后的照片"
        ),
        PermissionInfo(
            permission = Manifest.permission.ACCESS_MEDIA_LOCATION,
            required = false,
            minSdk = 29,
            rationale = "读取照片 EXIF 位置信息（可选）"
        ),
        PermissionInfo(
            permission = Manifest.permission.POST_NOTIFICATIONS,
            required = false,
            minSdk = 33,
            rationale = "导出完成通知（可选）"
        ),
    )

    fun getRequiredPermissionsForApiLevel(sdkInt: Int = Build.VERSION.SDK_INT): List<String> {
        return ALL_PERMISSIONS
            .filter { it.required && sdkInt in it.minSdk..it.maxSdk }
            .map { it.permission }
    }

    fun getOptionalPermissionsForApiLevel(sdkInt: Int = Build.VERSION.SDK_INT): List<String> {
        return ALL_PERMISSIONS
            .filter { !it.required && sdkInt in it.minSdk..it.maxSdk }
            .map { it.permission }
    }

    fun getMissingPermissions(context: Context): Array<String> {
        val sdkInt = Build.VERSION.SDK_INT
        val required = getRequiredPermissionsForApiLevel(sdkInt)
        val optional = getOptionalPermissionsForApiLevel(sdkInt)
        val all = required + optional

        return all.filter {
            ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
        }.toTypedArray()
    }

    fun hasAllRequiredPermissions(context: Context): Boolean {
        return getRequiredPermissionsForApiLevel().all {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
    }

    fun getRationaleForPermission(permission: String): String {
        return ALL_PERMISSIONS.find { it.permission == permission }?.rationale ?: ""
    }
}
