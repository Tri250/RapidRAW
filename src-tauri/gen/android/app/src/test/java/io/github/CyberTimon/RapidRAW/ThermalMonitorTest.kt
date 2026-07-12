package io.github.CyberTimon.RapidRAW

import org.junit.Assert.*
import org.junit.Test

/**
 * ThermalMonitor 单元测试
 */
class ThermalMonitorTest {

    @Test
    fun testThermalStatusOrdering() {
        assertTrue(ThermalMonitor.ThermalStatus.NORMAL.level < ThermalMonitor.ThermalStatus.WARM.level)
        assertTrue(ThermalMonitor.ThermalStatus.WARM.level < ThermalMonitor.ThermalStatus.HOT.level)
        assertTrue(ThermalMonitor.ThermalStatus.HOT.level < ThermalMonitor.ThermalStatus.CRITICAL.level)
        assertTrue(ThermalMonitor.ThermalStatus.CRITICAL.level < ThermalMonitor.ThermalStatus.EMERGENCY.level)
    }

    @Test
    fun testThermalParamsNormal() {
        val params = ThermalMonitor.ThermalStatus.NORMAL.let {
            ThermalMonitor.ThermalParams(
                previewResolution = 1920,
                maxThreads = 4,
                allowBackgroundProcessing = true,
                allowAIFeatures = true,
            )
        }
        assertEquals(1920, params.previewResolution)
        assertEquals(4, params.maxThreads)
        assertTrue(params.allowBackgroundProcessing)
        assertTrue(params.allowAIFeatures)
    }

    @Test
    fun testThermalStatusLabels() {
        assertEquals("normal", ThermalMonitor.ThermalStatus.NORMAL.label)
        assertEquals("emergency", ThermalMonitor.ThermalStatus.EMERGENCY.label)
    }
}
