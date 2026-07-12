package io.github.CyberTimon.RapidRAW

import org.junit.Assert.*
import org.junit.Test

/**
 * PermissionInfoHelper 单元测试
 */
class PermissionInfoHelperTest {

    @Test
    fun testRequiredPermissionsForApi33() {
        val permissions = PermissionInfoHelper.getRequiredPermissionsForApiLevel(33)
        assertTrue(permissions.contains("android.permission.READ_MEDIA_IMAGES"))
        assertFalse(permissions.contains("android.permission.READ_EXTERNAL_STORAGE"))
    }

    @Test
    fun testRequiredPermissionsForApi29() {
        val permissions = PermissionInfoHelper.getRequiredPermissionsForApiLevel(29)
        assertTrue(permissions.contains("android.permission.READ_EXTERNAL_STORAGE"))
        assertFalse(permissions.contains("android.permission.READ_MEDIA_IMAGES"))
    }

    @Test
    fun testOptionalPermissionsForApi33() {
        val permissions = PermissionInfoHelper.getOptionalPermissionsForApiLevel(33)
        assertTrue(permissions.contains("android.permission.ACCESS_MEDIA_LOCATION"))
        assertTrue(permissions.contains("android.permission.POST_NOTIFICATIONS"))
    }

    @Test
    fun testNoPermissionsForApi25() {
        val permissions = PermissionInfoHelper.getRequiredPermissionsForApiLevel(25)
        // minSdk is 26, so no permissions should match for API 25
        assertTrue(permissions.isEmpty())
    }

    @Test
    fun testRationaleExists() {
        for (perm in PermissionInfoHelper.ALL_PERMISSIONS) {
            assertTrue("Rationale missing for ${perm.permission}", perm.rationale.isNotEmpty())
        }
    }
}
