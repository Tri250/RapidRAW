package io.github.CyberTimon.RapidRAW

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * MemoryManager 单元测试
 */
@RunWith(AndroidJUnit4::class)
class MemoryManagerTest {

    private lateinit var memoryManager: MemoryManager

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        memoryManager = MemoryManager.getInstance(context)
    }

    @Test
    fun testMemoryManagerNotNull() {
        assertNotNull(memoryManager)
    }

    @Test
    fun testCanLoadSmallImage() {
        // 100x100 RGBA = 40KB + overhead, should always fit
        assertTrue(memoryManager.canLoadImage(100, 100))
    }

    @Test
    fun testCanLoadLargeImage() {
        // 10000x10000 = ~400MB + overhead, may not fit on some devices
        val result = memoryManager.canLoadImage(10000, 10000)
        // Just verify it doesn't crash
        assertNotNull(result)
    }

    @Test
    fun testGetRecommendedMaxDimension() {
        val dim = memoryManager.getRecommendedMaxDimension(100, 100)
        assertTrue(dim > 0)
    }

    @Test
    fun testClearAllDoesNotCrash() {
        memoryManager.clearAll()
        // Verify cache is accessible after clear
        assertTrue(memoryManager.canLoadImage(100, 100))
    }
}
