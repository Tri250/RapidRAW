import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { usePinchZoom, useTwoFingerRotate, useCanvasPan, useSwipeNavigation } from './useTouchGestures';

describe('usePinchZoom', () => {
  let el: HTMLDivElement;

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  it('attaches touch listeners', () => {
    const addEventListener = vi.spyOn(el, 'addEventListener');
    const { result } = renderHook(() => {
      const ref = useRef<HTMLElement>(el);
      return usePinchZoom(ref as any, { onScaleChange: vi.fn() });
    });
    expect(addEventListener).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: false });
    expect(addEventListener).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false });
    expect(addEventListener).toHaveBeenCalledWith('touchend', expect.any(Function));
  });
});

describe('useTwoFingerRotate', () => {
  let el: HTMLDivElement;

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  it('attaches touch listeners', () => {
    const addEventListener = vi.spyOn(el, 'addEventListener');
    renderHook(() => {
      const ref = useRef<HTMLElement>(el);
      return useTwoFingerRotate(ref as any, { onRotationChange: vi.fn() });
    });
    expect(addEventListener).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: false });
    expect(addEventListener).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false });
    expect(addEventListener).toHaveBeenCalledWith('touchend', expect.any(Function));
  });
});

describe('useCanvasPan', () => {
  let el: HTMLDivElement;

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  it('attaches touch listeners', () => {
    const addEventListener = vi.spyOn(el, 'addEventListener');
    renderHook(() => {
      const ref = useRef<HTMLElement>(el);
      return useCanvasPan(ref as any, { onPanChange: vi.fn() });
    });
    expect(addEventListener).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: false });
    expect(addEventListener).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false });
    expect(addEventListener).toHaveBeenCalledWith('touchend', expect.any(Function));
  });
});

describe('useSwipeNavigation', () => {
  it('attaches window touch listeners', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    renderHook(() => useSwipeNavigation({ onSwipeLeft: vi.fn(), onSwipeRight: vi.fn() }));
    expect(addEventListener).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: true });
    expect(addEventListener).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: true });
    expect(addEventListener).toHaveBeenCalledWith('touchend', expect.any(Function));
  });
});
