import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import GlobalTooltip from '../GlobalTooltip';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ref, ...props }: any) => {
      const { initial, animate, exit, transition, ...rest } = props;
      return <div ref={ref} {...rest}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('GlobalTooltip', () => {
  const originalInnerHeight = window.innerHeight;
  const originalInnerWidth = window.innerWidth;
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRafId: number;
  let originalRAF: typeof window.requestAnimationFrame;
  let originalCAF: typeof window.cancelAnimationFrame;

  beforeEach(() => {
    vi.useFakeTimers();
    window.innerHeight = 800;
    window.innerWidth = 1024;

    rafCallbacks = new Map();
    nextRafId = 1;
    originalRAF = window.requestAnimationFrame;
    originalCAF = window.cancelAnimationFrame;

    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = nextRafId++;
      rafCallbacks.set(id, callback);
      return id;
    });

    window.cancelAnimationFrame = vi.fn((id: number) => {
      rafCallbacks.delete(id);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    window.innerHeight = originalInnerHeight;
    window.innerWidth = originalInnerWidth;
    window.requestAnimationFrame = originalRAF;
    window.cancelAnimationFrame = originalCAF;
  });

  const tickRAF = () => {
    const currentCallbacks = new Map(rafCallbacks);
    rafCallbacks.clear();
    currentCallbacks.forEach((callback) => {
      callback(performance.now());
    });
  };

  const createTooltipElement = (content: string, rect?: Partial<DOMRect>) => {
    const el = document.createElement('button');
    el.setAttribute('data-tooltip', content);
    el.textContent = 'Hover Me';
    document.body.appendChild(el);

    const defaultRect = {
      left: 100,
      top: 100,
      right: 200,
      bottom: 140,
      width: 100,
      height: 40,
      x: 100,
      y: 100,
      toJSON: () => {},
    };

    const mockRect = { ...defaultRect, ...rect };
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(mockRect as DOMRect);

    return el;
  };

  const showTooltip = (el: HTMLElement) => {
    fireEvent.mouseOver(el, { target: el });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      tickRAF();
    });
  };

  describe('基本渲染', () => {
    it('初始时不显示 tooltip', () => {
      render(<GlobalTooltip />);
      const tooltip = document.querySelector('[class*="z-100"]');
      expect(tooltip).not.toBeInTheDocument();
    });
  });

  describe('悬停显示 tooltip', () => {
    it('鼠标悬停在有 data-tooltip 的元素上时显示 tooltip', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Test Tooltip');

      showTooltip(el);

      expect(screen.getByText('Test Tooltip')).toBeInTheDocument();

      el.remove();
    });

    it('悬停在没有 data-tooltip 的元素上不显示 tooltip', () => {
      render(<GlobalTooltip />);
      const el = document.createElement('button');
      el.textContent = 'No Tooltip';
      document.body.appendChild(el);

      fireEvent.mouseOver(el, { target: el });
      act(() => {
        vi.advanceTimersByTime(500);
      });

      const tooltip = document.querySelector('[class*="z-100"]');
      expect(tooltip).not.toBeInTheDocument();

      el.remove();
    });

    it('悬停在 data-tooltip 为空的元素上不显示 tooltip', () => {
      render(<GlobalTooltip />);
      const el = document.createElement('button');
      el.setAttribute('data-tooltip', '');
      el.textContent = 'Empty Tooltip';
      document.body.appendChild(el);

      fireEvent.mouseOver(el, { target: el });
      act(() => {
        vi.advanceTimersByTime(500);
      });

      const tooltip = document.querySelector('[class*="z-100"]');
      expect(tooltip).not.toBeInTheDocument();

      el.remove();
    });
  });

  describe('延迟显示', () => {
    it('延迟 500ms 后显示 tooltip', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Delayed Tooltip');

      fireEvent.mouseOver(el, { target: el });

      act(() => {
        vi.advanceTimersByTime(499);
      });

      let tooltip = document.querySelector('[class*="z-100"]');
      expect(tooltip).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      act(() => {
        tickRAF();
      });

      expect(screen.getByText('Delayed Tooltip')).toBeInTheDocument();

      el.remove();
    });

    it('快速移开鼠标不显示 tooltip', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Quick Tooltip');

      fireEvent.mouseOver(el, { target: el });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      fireEvent.mouseOut(el, { target: el, relatedTarget: document.body });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      const tooltip = document.querySelector('[class*="z-100"]');
      expect(tooltip).not.toBeInTheDocument();

      el.remove();
    });
  });

  describe('鼠标移开隐藏 tooltip', () => {
    it('鼠标移开后隐藏 tooltip', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Hide Tooltip');

      showTooltip(el);
      expect(screen.getByText('Hide Tooltip')).toBeInTheDocument();

      fireEvent.mouseOut(el, { target: el, relatedTarget: document.body });

      expect(screen.queryByText('Hide Tooltip')).not.toBeInTheDocument();

      el.remove();
    });

    it('鼠标在元素内部移动不隐藏 tooltip', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Stay Tooltip');
      const innerSpan = document.createElement('span');
      innerSpan.textContent = 'Inner';
      el.appendChild(innerSpan);

      showTooltip(el);
      expect(screen.getByText('Stay Tooltip')).toBeInTheDocument();

      fireEvent.mouseOut(el, { target: el, relatedTarget: innerSpan });

      expect(screen.getByText('Stay Tooltip')).toBeInTheDocument();

      el.remove();
    });
  });

  describe('tooltip 内容显示', () => {
    it('显示正确的 tooltip 内容', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Correct Content');

      showTooltip(el);

      const tooltip = screen.getByText('Correct Content');
      expect(tooltip).toBeInTheDocument();

      el.remove();
    });

    it('切换到另一个元素时显示新的 tooltip 内容', () => {
      render(<GlobalTooltip />);
      const el1 = createTooltipElement('First Tooltip');
      const el2 = createTooltipElement('Second Tooltip', { left: 300, top: 200, right: 400, bottom: 240, x: 300, y: 200 });

      showTooltip(el1);
      expect(screen.getByText('First Tooltip')).toBeInTheDocument();

      showTooltip(el2);

      expect(screen.getByText('Second Tooltip')).toBeInTheDocument();
      expect(screen.queryByText('First Tooltip')).not.toBeInTheDocument();

      el1.remove();
      el2.remove();
    });
  });

  describe('位置计算', () => {
    it('默认在元素下方显示 tooltip', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Bottom Tooltip', {
        left: 100,
        top: 100,
        right: 200,
        bottom: 140,
        width: 100,
        height: 40,
      });

      showTooltip(el);

      const tooltip = document.querySelector('[class*="z-100"]');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).not.toHaveClass('-translate-y-full');

      el.remove();
    });

    it('空间不足时在元素上方显示 tooltip', () => {
      render(<GlobalTooltip />);
      window.innerHeight = 150;
      const el = createTooltipElement('Top Tooltip', {
        left: 100,
        top: 100,
        right: 200,
        bottom: 140,
        width: 100,
        height: 40,
      });

      showTooltip(el);

      const tooltip = document.querySelector('[class*="z-100"]');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveClass('-translate-y-full');

      el.remove();
    });
  });

  describe('点击时的行为', () => {
    it('点击时隐藏 tooltip', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Click Hide');

      showTooltip(el);
      expect(screen.getByText('Click Hide')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);

      expect(screen.queryByText('Click Hide')).not.toBeInTheDocument();

      el.remove();
    });
  });

  describe('键盘事件', () => {
    it('按 Escape 键隐藏 tooltip', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Escape Tooltip');

      showTooltip(el);
      expect(screen.getByText('Escape Tooltip')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByText('Escape Tooltip')).not.toBeInTheDocument();

      el.remove();
    });

    it('其他按键不隐藏 tooltip', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Key Tooltip');

      showTooltip(el);
      expect(screen.getByText('Key Tooltip')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Enter' });

      expect(screen.getByText('Key Tooltip')).toBeInTheDocument();

      el.remove();
    });
  });

  describe('滚动时隐藏', () => {
    it('滚动时隐藏 tooltip', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Scroll Tooltip');

      showTooltip(el);
      expect(screen.getByText('Scroll Tooltip')).toBeInTheDocument();

      fireEvent.scroll(document, { target: { scrollTop: 100 } });

      expect(screen.queryByText('Scroll Tooltip')).not.toBeInTheDocument();

      el.remove();
    });
  });

  describe('长文本处理', () => {
    it('能显示长文本 tooltip', () => {
      render(<GlobalTooltip />);
      const longText = '这是一个非常长的 tooltip 文本内容，用于测试长文本的显示情况，确保 tooltip 能够正确处理较长的文本内容。';
      const el = createTooltipElement(longText);

      showTooltip(el);

      const tooltip = screen.getByText(longText);
      expect(tooltip).toBeInTheDocument();

      el.remove();
    });
  });

  describe('样式和类名', () => {
    it('tooltip 有正确的基础样式类', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Style Test');

      showTooltip(el);

      const tooltip = document.querySelector('[class*="z-100"]');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveClass('fixed');
      expect(tooltip).toHaveClass('z-100');
      expect(tooltip).toHaveClass('pointer-events-none');
      expect(tooltip).toHaveClass('bg-surface/80');
      expect(tooltip).toHaveClass('backdrop-blur-xs');
      expect(tooltip).toHaveClass('border');
      expect(tooltip).toHaveClass('border-text-secondary/10');
      expect(tooltip).toHaveClass('shadow-xl');
      expect(tooltip).toHaveClass('rounded-md');
      expect(tooltip).toHaveClass('px-2.5');
      expect(tooltip).toHaveClass('py-1.5');
      expect(tooltip).toHaveClass('whitespace-nowrap');

      el.remove();
    });

    it('tooltip 渲染在 document.body 中（使用 portal）', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Portal Test');

      showTooltip(el);

      const tooltip = document.querySelector('[class*="z-100"]');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip?.parentElement).toBe(document.body);

      el.remove();
    });
  });

  describe('元素移除', () => {
    it('元素从 DOM 中移除后隐藏 tooltip', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Remove Test');

      showTooltip(el);
      expect(screen.getByText('Remove Test')).toBeInTheDocument();

      el.remove();
      act(() => {
        tickRAF();
      });

      expect(screen.queryByText('Remove Test')).not.toBeInTheDocument();
    });
  });

  describe('data-tooltip 属性移除', () => {
    it('移除 data-tooltip 属性后隐藏 tooltip', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Attr Remove Test');

      showTooltip(el);
      expect(screen.getByText('Attr Remove Test')).toBeInTheDocument();

      el.removeAttribute('data-tooltip');
      act(() => {
        tickRAF();
      });

      expect(screen.queryByText('Attr Remove Test')).not.toBeInTheDocument();

      el.remove();
    });
  });

  describe('组件卸载', () => {
    it('组件卸载后清理事件监听器', () => {
      const { unmount } = render(<GlobalTooltip />);
      const el = createTooltipElement('Unmount Test');

      showTooltip(el);
      expect(screen.getByText('Unmount Test')).toBeInTheDocument();

      unmount();

      expect(screen.queryByText('Unmount Test')).not.toBeInTheDocument();

      el.remove();
    });
  });

  describe('嵌套元素', () => {
    it('悬停在有 data-tooltip 元素的子元素上也能显示 tooltip', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Nested Tooltip');
      const innerSpan = document.createElement('span');
      innerSpan.textContent = 'Inner Text';
      innerSpan.setAttribute('data-testid', 'inner-span');
      el.appendChild(innerSpan);

      fireEvent.mouseOver(innerSpan, { target: innerSpan });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      act(() => {
        tickRAF();
      });

      expect(screen.getByText('Nested Tooltip')).toBeInTheDocument();

      el.remove();
    });
  });

  describe('多次悬停同一元素', () => {
    it('多次悬停同一元素不会重复触发', () => {
      render(<GlobalTooltip />);
      const el = createTooltipElement('Same Element');

      showTooltip(el);
      expect(screen.getByText('Same Element')).toBeInTheDocument();

      fireEvent.mouseOver(el, { target: el });
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByText('Same Element')).toBeInTheDocument();

      el.remove();
    });
  });
});
