import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImageRenderSize, RenderSize } from './useImageRenderSize';

interface ResizeObserverMock {
  callback: ResizeObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

const instances: ResizeObserverMock[] = [];

class ResizeObserverMockImpl implements ResizeObserver {
  callback: ResizeObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    instances.push(this);
  }

  unobserve(): void {}
}

const DEFAULT_SIZE: RenderSize = { width: 0, height: 0, scale: 1, offsetX: 0, offsetY: 0 };

const setContainerSize = (el: HTMLElement, width: number, height: number) => {
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
};

const triggerResize = (width: number, height: number, container: HTMLElement) => {
  setContainerSize(container, width, height);
  const latest = instances[instances.length - 1];
  act(() => {
    latest.callback([], latest as unknown as ResizeObserver);
  });
};

describe('useImageRenderSize', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    instances.length = 0;
    container = document.createElement('div');
    container.style.width = '400px';
    container.style.height = '800px';
    Object.defineProperty(container, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 800, configurable: true });
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.unstubAllGlobals();
  });

  it('returns the default size when no image dimensions are provided', () => {
    const ref = { current: container };
    const { result } = renderHook(() => useImageRenderSize(ref, null));
    expect(result.current).toEqual(DEFAULT_SIZE);
  });

  it('returns the default size when the container has zero size', () => {
    const zeroContainer = document.createElement('div');
    Object.defineProperty(zeroContainer, 'clientWidth', { value: 0, configurable: true });
    Object.defineProperty(zeroContainer, 'clientHeight', { value: 0, configurable: true });
    const ref = { current: zeroContainer };
    const { result } = renderHook(() => useImageRenderSize(ref, { width: 1600, height: 900 }));
    expect(result.current).toEqual(DEFAULT_SIZE);
  });

  it('letterboxes a landscape image inside a portrait container', () => {
    Object.defineProperty(container, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 800, configurable: true });
    const ref = { current: container };
    const { result } = renderHook(() => useImageRenderSize(ref, { width: 1600, height: 900 }));

    // imageAspect 1.78 > containerAspect 0.5 -> width-limited fit
    expect(result.current.width).toBeCloseTo(400);
    expect(result.current.height).toBeCloseTo(400 / (1600 / 900));
    expect(result.current.offsetX).toBeCloseTo(0);
    expect(result.current.offsetY).toBeCloseTo((800 - 400 / (1600 / 900)) / 2);
    expect(result.current.scale).toBeCloseTo(400 / 1600);
  });

  it('letterboxes a portrait image inside a landscape container', () => {
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
    const ref = { current: container };
    const { result } = renderHook(() => useImageRenderSize(ref, { width: 900, height: 1600 }));

    // imageAspect 0.5625 < containerAspect 2 -> height-limited fit
    expect(result.current.height).toBeCloseTo(400);
    expect(result.current.width).toBeCloseTo(400 * (900 / 1600));
    expect(result.current.offsetY).toBeCloseTo(0);
    expect(result.current.offsetX).toBeCloseTo((800 - 400 * (900 / 1600)) / 2);
    expect(result.current.scale).toBeCloseTo((400 * (900 / 1600)) / 900);
  });

  it('matches the exact fit for equal aspect ratios', () => {
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    const ref = { current: container };
    const { result } = renderHook(() => useImageRenderSize(ref, { width: 1600, height: 1200 }));

    // imageAspect == containerAspect -> both fit branches yield the same box
    expect(result.current.width).toBeCloseTo(800);
    expect(result.current.height).toBeCloseTo(600);
    expect(result.current.offsetX).toBeCloseTo(0);
    expect(result.current.offsetY).toBeCloseTo(0);
    expect(result.current.scale).toBeCloseTo(0.5);
  });

  it('recomputes when the container is resized through the ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMockImpl);

    const ref = { current: container };
    const { result } = renderHook(() => useImageRenderSize(ref, { width: 1600, height: 900 }));

    expect(result.current.width).toBeCloseTo(400);

    triggerResize(800, 800, container);
    // container 800x800 aspect 1, image aspect 1.78 -> width-limited, width 800
    expect(result.current.width).toBeCloseTo(800);
    expect(result.current.height).toBeCloseTo(800 / (1600 / 900));
  });

  it('recomputes when image dimensions change', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMockImpl);

    Object.defineProperty(container, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
    const ref = { current: container };
    const { result, rerender } = renderHook(({ dims }) => useImageRenderSize(ref, dims), {
      initialProps: { dims: { width: 1600, height: 900 } },
    });

    expect(result.current.width).toBeCloseTo(400);

    rerender({ dims: { width: 900, height: 1600 } });
    // portrait image in square container -> height-limited: height 400, width 225
    expect(result.current.height).toBeCloseTo(400);
    expect(result.current.width).toBeCloseTo(225);
  });
});
