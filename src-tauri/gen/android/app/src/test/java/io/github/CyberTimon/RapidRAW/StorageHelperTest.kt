package io.github.CyberTimon.RapidRAW

import org.junit.Assert.*
import org.junit.Test

/**
 * StorageHelper 单元测试
 */
class StorageHelperTest {

    @Test
    fun testStorageInfoCalculation() {
        val info = StorageHelper.StorageInfo(
            totalBytes = 10L * 1024 * 1024 * 1024, // 10GB
            availableBytes = 5L * 1024 * 1024 * 1024, // 5GB
            isLow = false,
            isCritical = false
        )
        assertEquals(5120, info.availableMB)
        assertEquals(10240, info.totalMB)
        assertEquals(50, info.usagePercent)
        assertFalse(info.isLow)
        assertFalse(info.isCritical)
    }

    @Test
    fun testLowStorageDetection() {
        val info = StorageHelper.StorageInfo(
            totalBytes = 10L * 1024 * 1024 * 1024,
            availableBytes = 200L * 1024 * 1024, // 200MB
            isLow = true,
            isCritical = false
        )
        assertTrue(info.isLow)
        assertFalse(info.isCritical)
    }

    @Test
    fun testCriticalStorageDetection() {
        val info = StorageHelper.StorageInfo(
            totalBytes = 10L * 1024 * 1024 * 1024,
            availableBytes = 50L * 1024 * 1024, // 50MB
            isLow = true,
            isCritical = true
        )
        assertTrue(info.isCritical)
    }
}
