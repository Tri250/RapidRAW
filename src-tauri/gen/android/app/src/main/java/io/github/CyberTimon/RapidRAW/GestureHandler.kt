package io.github.CyberTimon.RapidRAW

import android.content.Context
import android.view.GestureDetector
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.VelocityTracker
import android.view.View
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.sqrt

class GestureHandler(context: Context) {
    // Callbacks for Rust/WGPU integration
    interface GestureCallback {
        fun onZoomChanged(scale: Float, focusX: Float, focusY: Float)
        fun onRotationChanged(angle: Float)
        fun onPanChanged(dx: Float, dy: Float)
        fun onDoubleTap()
        fun onLongPressStart()  // Show original image
        fun onLongPressEnd()    // Show edited image
        fun onSingleTap()       // Toggle UI
        fun onSwipeLeft()
        fun onSwipeRight()
    }

    var callback: GestureCallback? = null
    private var scaleDetector: ScaleGestureDetector
    private var gestureDetector: GestureDetector
    private var isLongPressing = false
    private var currentScale = 1.0f
    private var currentRotation = 0.0f

    // Two-finger rotation tracking
    private var isRotating = false
    private var previousRotationAngle = 0.0f
    private var cumulativeRotation = 0.0f

    // View reference for haptic feedback
    private var targetView: View? = null

    // 滑动导航相关
    private var velocityTracker: VelocityTracker? = null
    private var swipeStartX = 0f
    private var swipeStartY = 0f
    private var isSwiping = false
    private var isSwipeHorizontal = false

    companion object {
        private const val SWIPE_THRESHOLD = 100 // dp
        private const val SWIPE_VELOCITY_THRESHOLD = 300 // dp/s
    }

    init {
        scaleDetector = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScaleBegin(detector: ScaleGestureDetector): Boolean = true
            override fun onScale(detector: ScaleGestureDetector): Boolean {
                currentScale *= detector.scaleFactor
                currentScale = currentScale.coerceIn(0.1f, 10.0f)
                callback?.onZoomChanged(currentScale, detector.focusX, detector.focusY)
                return true
            }
            override fun onScaleEnd(detector: ScaleGestureDetector) {}
        })

        gestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDoubleTap(e: MotionEvent): Boolean {
                callback?.onDoubleTap()
                return true
            }
            override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                callback?.onSingleTap()
                return true
            }
            override fun onLongPress(e: MotionEvent) {
                isLongPressing = true
                callback?.onLongPressStart()
                // Haptic feedback
                targetView?.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            }
            override fun onScroll(e1: MotionEvent?, e2: MotionEvent, dx: Float, dy: Float): Boolean {
                callback?.onPanChanged(-dx, -dy)
                return true
            }
        })
    }

    fun setTargetView(view: View) {
        targetView = view
    }

    fun onTouchEvent(event: MotionEvent): Boolean {
        // Handle long press release
        if (isLongPressing && event.action == MotionEvent.ACTION_UP) {
            isLongPressing = false
            callback?.onLongPressEnd()
        }

        // Two-finger rotation detection
        if (event.pointerCount >= 2) {
            handleRotation(event)
        } else {
            if (isRotating && event.action == MotionEvent.ACTION_UP) {
                isRotating = false
            }
        }

        scaleDetector.onTouchEvent(event)
        gestureDetector.onTouchEvent(event)
        return true
    }

    private fun handleRotation(event: MotionEvent) {
        if (event.pointerCount < 2) return

        val dx = event.getX(0) - event.getX(1)
        val dy = event.getY(0) - event.getY(1)
        val angle = Math.toDegrees(atan2(dy.toDouble(), dx.toDouble())).toFloat()

        when (event.actionMasked) {
            MotionEvent.ACTION_POINTER_DOWN -> {
                isRotating = true
                previousRotationAngle = angle
            }
            MotionEvent.ACTION_MOVE -> {
                if (isRotating) {
                    val delta = angle - previousRotationAngle
                    // Normalize delta to [-180, 180]
                    val normalizedDelta = when {
                        delta > 180f -> delta - 360f
                        delta < -180f -> delta + 360f
                        else -> delta
                    }
                    cumulativeRotation += normalizedDelta
                    previousRotationAngle = angle
                    callback?.onRotationChanged(cumulativeRotation)
                }
            }
            MotionEvent.ACTION_POINTER_UP -> {
                isRotating = false
            }
        }
    }

    fun resetTransform() {
        currentScale = 1.0f
        currentRotation = 0.0f
        cumulativeRotation = 0.0f
        callback?.onZoomChanged(1.0f, 0f, 0f)
        callback?.onRotationChanged(0.0f)
    }

    /**
     * 处理水平滑动手势（图片导航）
     */
    private fun handleSwipeGesture(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                swipeStartX = event.x
                swipeStartY = event.y
                isSwiping = false
                isSwipeHorizontal = false
                velocityTracker = VelocityTracker.obtain()
                velocityTracker?.addMovement(event)
            }
            MotionEvent.ACTION_MOVE -> {
                velocityTracker?.addMovement(event)
                val dx = event.x - swipeStartX
                val dy = event.y - swipeStartY

                if (!isSwiping && (Math.abs(dx) > 20 || Math.abs(dy) > 20)) {
                    isSwiping = true
                    isSwipeHorizontal = Math.abs(dx) > Math.abs(dy)
                }
            }
            MotionEvent.ACTION_UP -> {
                velocityTracker?.addMovement(event)
                velocityTracker?.computeCurrentVelocity(1000)

                val velocityX = velocityTracker?.xVelocity ?: 0f
                val dx = event.x - swipeStartX

                if (isSwipeHorizontal && Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(velocityX) > SWIPE_VELOCITY_THRESHOLD) {
                    if (dx > 0) {
                        callback?.onSwipeRight()
                    } else {
                        callback?.onSwipeLeft()
                    }
                }

                velocityTracker?.recycle()
                velocityTracker = null
                isSwiping = false
            }
            MotionEvent.ACTION_CANCEL -> {
                velocityTracker?.recycle()
                velocityTracker = null
                isSwiping = false
            }
        }
    }

    interface GestureListener : GestureCallback {
    }
}