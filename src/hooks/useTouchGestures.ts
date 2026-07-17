import { useEffect, useCallback, useRef, RefObject } from 'react';

interface Point {
  x: number;
  y: number;
}

function getTouchPoint(touch: Touch): Point {
  return { x: touch.clientX, y: touch.clientY };
}

function getDistance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getAngle(p1: Point, p2: Point): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

function getMidpoint(p1: Point, p2: Point): Point {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

/**
 * 双指缩放手势 hook
 * 监听元素上的双指捏合/张开手势，回调当前缩放比例
 */
export function usePinchZoom(
  ref: RefObject<HTMLElement>,
  options?: {
    minScale?: number;
    maxScale?: number;
    onScaleChange?: (scale: number) => void;
  },
) {
  const minScale = options?.minScale ?? 0.1;
  const maxScale = options?.maxScale ?? 10;
  const onScaleChange = options?.onScaleChange;

  const initialDistanceRef = useRef(0);
  const currentScaleRef = useRef(1);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const p1 = getTouchPoint(e.touches[0]);
    const p2 = getTouchPoint(e.touches[1]);
    initialDistanceRef.current = getDistance(p1, p2);
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const p1 = getTouchPoint(e.touches[0]);
      const p2 = getTouchPoint(e.touches[1]);
      const currentDistance = getDistance(p1, p2);
      if (initialDistanceRef.current === 0) {
        initialDistanceRef.current = currentDistance;
        return;
      }
      const ratio = currentDistance / initialDistanceRef.current;
      const newScale = Math.min(maxScale, Math.max(minScale, currentScaleRef.current * ratio));
      onScaleChange?.(newScale);
    },
    [minScale, maxScale, onScaleChange],
  );

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (e.touches.length < 2) {
      // Finalize the scale
      // The last scale value is already applied via onScaleChange
      initialDistanceRef.current = 0;
      // Update the ref to the last emitted scale so next gesture is relative
      // Consumer should call a setter to keep currentScaleRef in sync
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    setCurrentScale: (scale: number) => {
      currentScaleRef.current = scale;
    },
  };
}

/**
 * 双指旋转手势 hook
 * 监听元素上的双指旋转手势，回调旋转角度（弧度）
 */
export function useTwoFingerRotate(
  ref: RefObject<HTMLElement>,
  options?: {
    onRotationChange?: (rotation: number) => void;
  },
) {
  const onRotationChange = options?.onRotationChange;
  const initialAngleRef = useRef(0);
  const currentRotationRef = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const p1 = getTouchPoint(e.touches[0]);
    const p2 = getTouchPoint(e.touches[1]);
    initialAngleRef.current = getAngle(p1, p2);
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const p1 = getTouchPoint(e.touches[0]);
      const p2 = getTouchPoint(e.touches[1]);
      const currentAngle = getAngle(p1, p2);
      const delta = currentAngle - initialAngleRef.current;
      const newRotation = currentRotationRef.current + delta;
      onRotationChange?.(newRotation);
    },
    [onRotationChange],
  );

  const handleTouchEnd = useCallback(() => {
    if (initialAngleRef.current !== 0) {
      initialAngleRef.current = 0;
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    setCurrentRotation: (rotation: number) => {
      currentRotationRef.current = rotation;
    },
  };
}

/**
 * 单指拖拽画布手势 hook
 * 监听元素上的单指拖拽，回调偏移量 {dx, dy}
 */
export function useCanvasPan(
  ref: RefObject<HTMLElement>,
  options?: {
    onPanChange?: (offset: { dx: number; dy: number }) => void;
    onPanStart?: () => void;
    onPanEnd?: () => void;
  },
) {
  const onPanChange = options?.onPanChange;
  const onPanStart = options?.onPanStart;
  const onPanEnd = options?.onPanEnd;

  const startPointRef = useRef<Point | null>(null);
  const accumulatedRef = useRef({ dx: 0, dy: 0 });
  const isPanningRef = useRef(false);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const point = getTouchPoint(e.touches[0]);
      startPointRef.current = point;
      isPanningRef.current = true;
      onPanStart?.();
    },
    [onPanStart],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isPanningRef.current || e.touches.length !== 1 || !startPointRef.current) return;
      e.preventDefault();
      const currentPoint = getTouchPoint(e.touches[0]);
      const dx = currentPoint.x - startPointRef.current.x;
      const dy = currentPoint.y - startPointRef.current.y;
      onPanChange?.({ dx: accumulatedRef.current.dx + dx, dy: accumulatedRef.current.dy + dy });
    },
    [onPanChange],
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!isPanningRef.current || !startPointRef.current) return;
      // Finalize: accumulate the delta
      if (e.changedTouches.length > 0) {
        const endPoint = getTouchPoint(e.changedTouches[0]);
        const dx = endPoint.x - startPointRef.current.x;
        const dy = endPoint.y - startPointRef.current.y;
        accumulatedRef.current = {
          dx: accumulatedRef.current.dx + dx,
          dy: accumulatedRef.current.dy + dy,
        };
      }
      isPanningRef.current = false;
      startPointRef.current = null;
      onPanEnd?.();
    },
    [onPanEnd],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    resetOffset: () => {
      accumulatedRef.current = { dx: 0, dy: 0 };
      onPanChange?.({ dx: 0, dy: 0 });
    },
    setOffset: (dx: number, dy: number) => {
      accumulatedRef.current = { dx, dy };
    },
  };
}

/**
 * 滑动翻页手势 hook（胶片条使用）
 * 检测左滑/右滑手势并回调方向
 */
export function useSwipeNavigation(
  options?: {
    threshold?: number;
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
  },
) {
  const threshold = options?.threshold ?? 50;
  const onSwipeLeft = options?.onSwipeLeft;
  const onSwipeRight = options?.onSwipeRight;

  const startPointRef = useRef<Point | null>(null);
  const startTimeRef = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    startPointRef.current = getTouchPoint(e.touches[0]);
    startTimeRef.current = Date.now();
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      // Optional: could add real-time visual feedback here
    },
    [],
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!startPointRef.current || e.changedTouches.length === 0) return;
      const endPoint = getTouchPoint(e.changedTouches[0]);
      const dx = endPoint.x - startPointRef.current.x;
      const dy = endPoint.y - startPointRef.current.y;
      const dt = Date.now() - startTimeRef.current;

      // Only count as swipe if horizontal movement is dominant and exceeds threshold
      const isHorizontalSwipe = Math.abs(dx) > Math.abs(dy) * 1.5;
      const isFastEnough = dt < 500;
      const exceedsThreshold = Math.abs(dx) > threshold;

      if (isHorizontalSwipe && isFastEnough && exceedsThreshold) {
        if (dx < 0) {
          onSwipeLeft?.();
        } else {
          onSwipeRight?.();
        }
      }

      startPointRef.current = null;
    },
    [threshold, onSwipeLeft, onSwipeRight],
  );

  useEffect(() => {
    const handler = {
      start: handleTouchStart,
      move: handleTouchMove,
      end: handleTouchEnd,
    };

    // Attach to window for global swipe detection (e.g. filmstrip)
    window.addEventListener('touchstart', handler.start, { passive: true });
    window.addEventListener('touchmove', handler.move, { passive: true });
    window.addEventListener('touchend', handler.end);

    return () => {
      window.removeEventListener('touchstart', handler.start);
      window.removeEventListener('touchmove', handler.move);
      window.removeEventListener('touchend', handler.end);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);
}
