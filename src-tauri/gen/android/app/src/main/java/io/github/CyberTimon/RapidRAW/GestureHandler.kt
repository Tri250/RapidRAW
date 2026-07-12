package io.github.CyberTimon.RapidRAW

import android.content.Context
import android.view.GestureDetector
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.ScaleGestureDetector
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
}