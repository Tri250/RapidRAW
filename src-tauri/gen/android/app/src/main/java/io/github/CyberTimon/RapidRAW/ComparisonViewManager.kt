package io.github.CyberTimon.RapidRAW

import android.content.Context
import android.graphics.*
import android.view.MotionEvent
import android.view.View

class ComparisonViewManager(private val context: Context) {
    enum class ComparisonMode {
        NONE,           // No comparison
        SPLIT_VERTICAL, // Left/right split
        SPLIT_HORIZONTAL, // Top/bottom split
        SLIDER,         // Draggable divider
        FULL_TOGGLE     // Full before/after toggle
    }

    var mode: ComparisonMode = ComparisonMode.NONE
    var dividerPosition: Float = 0.5f  // 0.0 to 1.0
    var isShowingOriginal: Boolean = false

    private var comparisonView: ComparisonView? = null

    inner class ComparisonView(context: Context) : View(context) {
        private val dividerPaint = Paint().apply {
            color = Color.WHITE
            strokeWidth = 3f
            style = Paint.Style.STROKE
        }
        private val handlePaint = Paint().apply {
            color = Color.WHITE
            style = Paint.Style.FILL
            isAntiAlias = true
        }
        private val overlayPaint = Paint().apply {
            color = Color.argb(40, 0, 0, 0)
        }

        var isDragging = false

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            when (mode) {
                ComparisonMode.SPLIT_VERTICAL -> {
                    val x = width * dividerPosition
                    canvas.drawLine(x, 0f, x, height.toFloat(), dividerPaint)
                    // Draw handle circle
                    canvas.drawCircle(x, height / 2f, 20f, handlePaint)
                    canvas.drawCircle(x, height / 2f, 12f, Paint().apply { color = Color.GRAY; style = Paint.Style.FILL })
                }
                ComparisonMode.SPLIT_HORIZONTAL -> {
                    val y = height * dividerPosition
                    canvas.drawLine(0f, y, width.toFloat(), y, dividerPaint)
                    canvas.drawCircle(width / 2f, y, 20f, handlePaint)
                }
                ComparisonMode.SLIDER -> {
                    val x = width * dividerPosition
                    canvas.drawLine(x, 0f, x, height.toFloat(), dividerPaint)
                    canvas.drawRect(x - 15f, 0f, x + 15f, height.toFloat(), overlayPaint)
                    canvas.drawCircle(x, height / 2f, 25f, handlePaint)
                    // Arrows
                    canvas.drawLine(x - 8f, height / 2f - 8f, x, height / 2f, dividerPaint)
                    canvas.drawLine(x - 8f, height / 2f + 8f, x, height / 2f, dividerPaint)
                    canvas.drawLine(x + 8f, height / 2f - 8f, x, height / 2f, dividerPaint)
                    canvas.drawLine(x + 8f, height / 2f + 8f, x, height / 2f, dividerPaint)
                }
                else -> {}
            }
        }

        override fun onTouchEvent(event: MotionEvent): Boolean {
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    isDragging = true
                }
                MotionEvent.ACTION_MOVE -> {
                    if (isDragging) {
                        dividerPosition = when (mode) {
                            ComparisonMode.SPLIT_VERTICAL, ComparisonMode.SLIDER ->
                                (event.x / width).coerceIn(0.05f, 0.95f)
                            ComparisonMode.SPLIT_HORIZONTAL ->
                                (event.y / height).coerceIn(0.05f, 0.95f)
                            else -> dividerPosition
                        }
                        invalidate()
                    }
                }
                MotionEvent.ACTION_UP -> {
                    isDragging = false
                }
            }
            return true
        }
    }

    fun getView(): View {
        if (comparisonView == null) {
            comparisonView = ComparisonView(context)
        }
        return comparisonView!!
    }

    fun cycleMode() {
        mode = when (mode) {
            ComparisonMode.NONE -> ComparisonMode.SPLIT_VERTICAL
            ComparisonMode.SPLIT_VERTICAL -> ComparisonMode.SPLIT_HORIZONTAL
            ComparisonMode.SPLIT_HORIZONTAL -> ComparisonMode.SLIDER
            ComparisonMode.SLIDER -> ComparisonMode.FULL_TOGGLE
            ComparisonMode.FULL_TOGGLE -> ComparisonMode.NONE
        }
        isShowingOriginal = mode == ComparisonMode.FULL_TOGGLE
        comparisonView?.invalidate()
    }

    fun disable() {
        mode = ComparisonMode.NONE
        isShowingOriginal = false
        comparisonView?.invalidate()
    }

    fun getOriginalRegion(): Pair<Float, Float>? {
        return when (mode) {
            ComparisonMode.SPLIT_VERTICAL -> Pair(dividerPosition, 0.5f)
            ComparisonMode.SPLIT_HORIZONTAL -> Pair(0.5f, dividerPosition)
            else -> null
        }
    }
}