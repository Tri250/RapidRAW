import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImageRenderSize } from '../useImageRenderSize';
import type { ImageDimensions } from '../useImageRenderSize';

const createMockContainer = (width: number, height: number): HTMLElement => {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: width, writable: true });
  Object.defineProperty(container, 'clientHeight', { value: height, writable: true });
  return container;
};

const createContainerRef = (width: number, height: number) => {
  const container = createMockContainer(width, height);
  return { ref: { current: container }, container };
};

describe('useImageRenderSize', () => {
  let resizeObserverCallback: ((entries: any[]) => void) | null = null;
  let observeMock = vi.fn();
  let disconnectMock = vi.fn();

  beforeEach(() => {
    observeMock = vi.fn();
    disconnectMock = vi.fn();
    resizeObserverCallback = null;

    class ResizeObserverMock {
      constructor(callback: (entries: any[]) => void) {
        resizeObserverCallback = callback;
      }
      observe = observeMock;
      disconnect = disconnectMock;
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  describe('初始状态', () => {
    it('没有 container 时返回默认值', () => {
      const containerRef = { current: null };
      const imageDimensions: ImageDimensions = { width: 800, height: 600 };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current).toEqual({
        width: 0,
        height: 0,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      });
    });

    it('没有 imageDimensions 时返回默认值', () => {
      const { ref: containerRef } = createContainerRef(1000, 800);

      const { result } = renderHook(() => useImageRenderSize(containerRef, null));

      expect(result.current).toEqual({
        width: 0,
        height: 0,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      });
    });

    it('imageDimensions 宽度为 0 时返回默认值', () => {
      const { ref: containerRef } = createContainerRef(1000, 800);
      const imageDimensions: ImageDimensions = { width: 0, height: 600 };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current).toEqual({
        width: 0,
        height: 0,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      });
    });

    it('imageDimensions 高度为 0 时返回默认值', () => {
      const { ref: containerRef } = createContainerRef(1000, 800);
      const imageDimensions: ImageDimensions = { width: 800, height: 0 };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current).toEqual({
        width: 0,
        height: 0,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      });
    });
  });

  describe('图片比容器宽（宽图）', () => {
    it('宽度适应容器，高度按比例，居中', () => {
      const containerWidth = 800;
      const containerHeight = 600;
      const imgWidth = 1600;
      const imgHeight = 600;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      const expectedWidth = containerWidth;
      const expectedHeight = containerWidth / (imgWidth / imgHeight);
      const expectedScale = expectedWidth / imgWidth;
      const expectedOffsetX = (containerWidth - expectedWidth) / 2;
      const expectedOffsetY = (containerHeight - expectedHeight) / 2;

      expect(result.current.width).toBe(expectedWidth);
      expect(result.current.height).toBeCloseTo(expectedHeight);
      expect(result.current.scale).toBeCloseTo(expectedScale);
      expect(result.current.offsetX).toBe(expectedOffsetX);
      expect(result.current.offsetY).toBeCloseTo(expectedOffsetY);
    });

    it('宽高比差距很大的宽图', () => {
      const containerWidth = 500;
      const containerHeight = 500;
      const imgWidth = 2000;
      const imgHeight = 200;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(containerWidth);
      expect(result.current.height).toBe(50);
      expect(result.current.scale).toBe(0.25);
      expect(result.current.offsetX).toBe(0);
      expect(result.current.offsetY).toBe(225);
    });
  });

  describe('图片比容器高（高图）', () => {
    it('高度适应容器，宽度按比例，居中', () => {
      const containerWidth = 600;
      const containerHeight = 800;
      const imgWidth = 600;
      const imgHeight = 1600;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      const expectedHeight = containerHeight;
      const expectedWidth = containerHeight * (imgWidth / imgHeight);
      const expectedScale = expectedWidth / imgWidth;
      const expectedOffsetX = (containerWidth - expectedWidth) / 2;
      const expectedOffsetY = (containerHeight - expectedHeight) / 2;

      expect(result.current.width).toBeCloseTo(expectedWidth);
      expect(result.current.height).toBe(expectedHeight);
      expect(result.current.scale).toBeCloseTo(expectedScale);
      expect(result.current.offsetX).toBeCloseTo(expectedOffsetX);
      expect(result.current.offsetY).toBe(expectedOffsetY);
    });

    it('宽高比差距很大的高图', () => {
      const containerWidth = 500;
      const containerHeight = 500;
      const imgWidth = 200;
      const imgHeight = 2000;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(50);
      expect(result.current.height).toBe(containerHeight);
      expect(result.current.scale).toBe(0.25);
      expect(result.current.offsetX).toBe(225);
      expect(result.current.offsetY).toBe(0);
    });
  });

  describe('正方形图片在矩形容器中', () => {
    it('宽矩形容器中的正方形图片', () => {
      const containerWidth = 800;
      const containerHeight = 400;
      const imgSize = 400;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgSize, height: imgSize };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(400);
      expect(result.current.height).toBe(400);
      expect(result.current.scale).toBe(1);
      expect(result.current.offsetX).toBe(200);
      expect(result.current.offsetY).toBe(0);
    });

    it('高矩形容器中的正方形图片', () => {
      const containerWidth = 400;
      const containerHeight = 800;
      const imgSize = 400;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgSize, height: imgSize };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(400);
      expect(result.current.height).toBe(400);
      expect(result.current.scale).toBe(1);
      expect(result.current.offsetX).toBe(0);
      expect(result.current.offsetY).toBe(200);
    });
  });

  describe('矩形图片在正方形容器中', () => {
    it('正方形容器中的宽矩形图片', () => {
      const containerSize = 500;
      const imgWidth = 800;
      const imgHeight = 400;
      const { ref: containerRef } = createContainerRef(containerSize, containerSize);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(500);
      expect(result.current.height).toBe(250);
      expect(result.current.scale).toBe(0.625);
      expect(result.current.offsetX).toBe(0);
      expect(result.current.offsetY).toBe(125);
    });

    it('正方形容器中的高矩形图片', () => {
      const containerSize = 500;
      const imgWidth = 400;
      const imgHeight = 800;
      const { ref: containerRef } = createContainerRef(containerSize, containerSize);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(250);
      expect(result.current.height).toBe(500);
      expect(result.current.scale).toBe(0.625);
      expect(result.current.offsetX).toBe(125);
      expect(result.current.offsetY).toBe(0);
    });
  });

  describe('图片和容器比例相同', () => {
    it('宽屏比例相同（16:9）', () => {
      const containerWidth = 1600;
      const containerHeight = 900;
      const imgWidth = 800;
      const imgHeight = 450;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(1600);
      expect(result.current.height).toBe(900);
      expect(result.current.scale).toBe(2);
      expect(result.current.offsetX).toBe(0);
      expect(result.current.offsetY).toBe(0);
    });

    it('竖屏比例相同（9:16）', () => {
      const containerWidth = 450;
      const containerHeight = 800;
      const imgWidth = 900;
      const imgHeight = 1600;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(450);
      expect(result.current.height).toBe(800);
      expect(result.current.scale).toBe(0.5);
      expect(result.current.offsetX).toBe(0);
      expect(result.current.offsetY).toBe(0);
    });

    it('正方形比例相同', () => {
      const containerSize = 500;
      const imgSize = 1000;
      const { ref: containerRef } = createContainerRef(containerSize, containerSize);
      const imageDimensions: ImageDimensions = { width: imgSize, height: imgSize };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(500);
      expect(result.current.height).toBe(500);
      expect(result.current.scale).toBe(0.5);
      expect(result.current.offsetX).toBe(0);
      expect(result.current.offsetY).toBe(0);
    });

    it('图片比容器小但比例相同时会放大', () => {
      const containerWidth = 800;
      const containerHeight = 600;
      const imgWidth = 400;
      const imgHeight = 300;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(800);
      expect(result.current.height).toBe(600);
      expect(result.current.scale).toBe(2);
      expect(result.current.offsetX).toBe(0);
      expect(result.current.offsetY).toBe(0);
    });
  });

  describe('container 变为 null 时重置为默认值', () => {
    it('从有 container 变为 null', () => {
      const containerWidth = 800;
      const containerHeight = 600;
      const { ref: containerRef, container } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: 1000, height: 800 };

      const { result, rerender } = renderHook(
        ({ ref, dims }) => useImageRenderSize(ref, dims),
        {
          initialProps: { ref: containerRef, dims: imageDimensions },
        },
      );

      expect(result.current.width).toBeGreaterThan(0);
      expect(result.current.height).toBeGreaterThan(0);

      const nullRef = { current: null };
      rerender({ ref: nullRef, dims: imageDimensions });

      expect(result.current).toEqual({
        width: 0,
        height: 0,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      });
    });
  });

  describe('imageDimensions 变为 null 时重置为默认值', () => {
    it('从有 imageDimensions 变为 null', () => {
      const containerWidth = 800;
      const containerHeight = 600;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: 1000, height: 800 };

      const { result, rerender } = renderHook(
        ({ ref, dims }) => useImageRenderSize(ref, dims),
        {
          initialProps: { ref: containerRef, dims: imageDimensions },
        },
      );

      expect(result.current.width).toBeGreaterThan(0);
      expect(result.current.height).toBeGreaterThan(0);

      rerender({ ref: containerRef, dims: null });

      expect(result.current).toEqual({
        width: 0,
        height: 0,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      });
    });
  });

  describe('scale 计算正确', () => {
    it('scale = 渲染宽度 / 原始宽度（宽图）', () => {
      const containerWidth = 800;
      const containerHeight = 600;
      const imgWidth = 1600;
      const imgHeight = 800;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.scale).toBe(0.5);
      expect(result.current.width / imgWidth).toBe(result.current.scale);
      expect(result.current.height / imgHeight).toBe(result.current.scale);
    });

    it('scale = 渲染宽度 / 原始宽度（高图）', () => {
      const containerWidth = 600;
      const containerHeight = 800;
      const imgWidth = 800;
      const imgHeight = 1600;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.scale).toBe(0.5);
      expect(result.current.width / imgWidth).toBe(result.current.scale);
      expect(result.current.height / imgHeight).toBe(result.current.scale);
    });

    it('图片比容器小时 scale > 1', () => {
      const containerWidth = 800;
      const containerHeight = 600;
      const imgWidth = 400;
      const imgHeight = 300;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.scale).toBe(2);
      expect(result.current.width / imgWidth).toBe(result.current.scale);
      expect(result.current.height / imgHeight).toBe(result.current.scale);
    });
  });

  describe('offsetX 和 offsetY 计算正确（居中）', () => {
    it('宽图在容器中垂直居中', () => {
      const containerWidth = 800;
      const containerHeight = 600;
      const imgWidth = 1600;
      const imgHeight = 400;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.offsetX).toBe(0);
      expect(result.current.offsetY).toBe(200);
      expect(result.current.offsetY * 2 + result.current.height).toBe(containerHeight);
    });

    it('高图在容器中水平居中', () => {
      const containerWidth = 600;
      const containerHeight = 800;
      const imgWidth = 400;
      const imgHeight = 1600;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.offsetX).toBe(200);
      expect(result.current.offsetY).toBe(0);
      expect(result.current.offsetX * 2 + result.current.width).toBe(containerWidth);
    });

    it('正方形图片在宽矩形容器中水平居中', () => {
      const containerWidth = 1000;
      const containerHeight = 500;
      const imgSize = 400;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgSize, height: imgSize };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(500);
      expect(result.current.height).toBe(500);
      expect(result.current.scale).toBe(1.25);
      expect(result.current.offsetX).toBe(250);
      expect(result.current.offsetY).toBe(0);
      expect(result.current.offsetX * 2 + result.current.width).toBe(containerWidth);
      expect(result.current.offsetY * 2 + result.current.height).toBe(containerHeight);
    });

    it('比例相同时 offsetX 和 offsetY 都为 0', () => {
      const containerWidth = 800;
      const containerHeight = 600;
      const imgWidth = 400;
      const imgHeight = 300;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.offsetX).toBe(0);
      expect(result.current.offsetY).toBe(0);
    });
  });

  describe('ResizeObserver 在容器尺寸变化时更新', () => {
    it('容器宽度变化时重新计算尺寸', () => {
      const initialWidth = 800;
      const initialHeight = 600;
      const newWidth = 1200;
      const imgWidth = 1600;
      const imgHeight = 800;
      const { ref: containerRef, container } = createContainerRef(initialWidth, initialHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(800);
      expect(result.current.height).toBe(400);

      act(() => {
        Object.defineProperty(container, 'clientWidth', { value: newWidth, writable: true });
        if (resizeObserverCallback) {
          resizeObserverCallback([{ contentRect: { width: newWidth, height: initialHeight } }]);
        }
      });

      expect(result.current.width).toBe(1200);
      expect(result.current.height).toBe(600);
      expect(result.current.scale).toBe(0.75);
    });

    it('容器高度变化时重新计算尺寸', () => {
      const initialWidth = 600;
      const initialHeight = 400;
      const newHeight = 800;
      const imgWidth = 400;
      const imgHeight = 800;
      const { ref: containerRef, container } = createContainerRef(initialWidth, initialHeight);
      const imageDimensions: ImageDimensions = { width: imgWidth, height: imgHeight };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(200);
      expect(result.current.height).toBe(400);

      act(() => {
        Object.defineProperty(container, 'clientHeight', { value: newHeight, writable: true });
        if (resizeObserverCallback) {
          resizeObserverCallback([{ contentRect: { width: initialWidth, height: newHeight } }]);
        }
      });

      expect(result.current.width).toBe(400);
      expect(result.current.height).toBe(800);
      expect(result.current.scale).toBe(1);
    });

    it('ResizeObserver 已正确注册到 container', () => {
      const { ref: containerRef, container } = createContainerRef(800, 600);
      const imageDimensions: ImageDimensions = { width: 1000, height: 800 };

      renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(observeMock).toHaveBeenCalledTimes(1);
      expect(observeMock).toHaveBeenCalledWith(container);
    });

    it('卸载时断开 ResizeObserver', () => {
      const { ref: containerRef } = createContainerRef(800, 600);
      const imageDimensions: ImageDimensions = { width: 1000, height: 800 };

      const { unmount } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(disconnectMock).not.toHaveBeenCalled();

      unmount();

      expect(disconnectMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('边界情况', () => {
    it('极小尺寸图片', () => {
      const containerWidth = 800;
      const containerHeight = 600;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: 1, height: 1 };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(600);
      expect(result.current.height).toBe(600);
      expect(result.current.scale).toBe(600);
      expect(result.current.offsetX).toBe(100);
      expect(result.current.offsetY).toBe(0);
    });

    it('超大尺寸图片', () => {
      const containerWidth = 800;
      const containerHeight = 600;
      const { ref: containerRef } = createContainerRef(containerWidth, containerHeight);
      const imageDimensions: ImageDimensions = { width: 10000, height: 5000 };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(800);
      expect(result.current.height).toBe(400);
      expect(result.current.scale).toBe(0.08);
      expect(result.current.offsetX).toBe(0);
      expect(result.current.offsetY).toBe(100);
    });

    it('容器宽度为 0', () => {
      const { ref: containerRef } = createContainerRef(0, 600);
      const imageDimensions: ImageDimensions = { width: 800, height: 600 };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(0);
      expect(result.current.height).toBe(0);
      expect(result.current.scale).toBe(0);
      expect(result.current.offsetX).toBe(0);
      expect(result.current.offsetY).toBe(300);
    });

    it('容器高度为 0', () => {
      const { ref: containerRef } = createContainerRef(800, 0);
      const imageDimensions: ImageDimensions = { width: 800, height: 600 };

      const { result } = renderHook(() => useImageRenderSize(containerRef, imageDimensions));

      expect(result.current.width).toBe(0);
      expect(result.current.height).toBe(0);
      expect(result.current.scale).toBe(0);
      expect(result.current.offsetX).toBe(400);
      expect(result.current.offsetY).toBe(0);
    });
  });
});
