import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Resizer from '../Resizer';
import { Orientation } from '../AppProperties';

describe('Resizer', () => {
  const defaultProps = {
    direction: Orientation.Vertical,
    onMouseDown: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本渲染', () => {
    it('渲染为 div 元素', () => {
      render(<Resizer {...defaultProps} />);
      const resizer = screen.getByRole('separator');
      expect(resizer).toBeInTheDocument();
      expect(resizer.tagName).toBe('DIV');
    });

    it('具有 separator role', () => {
      render(<Resizer {...defaultProps} />);
      expect(screen.getByRole('separator')).toBeInTheDocument();
    });
  });

  describe('方向 (direction)', () => {
    it('Vertical 方向时 aria-orientation 为 vertical', () => {
      render(<Resizer {...defaultProps} direction={Orientation.Vertical} />);
      const resizer = screen.getByRole('separator');
      expect(resizer).toHaveAttribute('aria-orientation', 'vertical');
    });

    it('Horizontal 方向时 aria-orientation 为 horizontal', () => {
      render(<Resizer {...defaultProps} direction={Orientation.Horizontal} />);
      const resizer = screen.getByRole('separator');
      expect(resizer).toHaveAttribute('aria-orientation', 'horizontal');
    });

    it('Vertical 方向时有 w-2 和 cursor-col-resize 类', () => {
      render(<Resizer {...defaultProps} direction={Orientation.Vertical} />);
      const resizer = screen.getByRole('separator');
      expect(resizer.className).toContain('w-2');
      expect(resizer.className).toContain('cursor-col-resize');
    });

    it('Horizontal 方向时有 h-2 和 cursor-row-resize 类', () => {
      render(<Resizer {...defaultProps} direction={Orientation.Horizontal} />);
      const resizer = screen.getByRole('separator');
      expect(resizer.className).toContain('h-2');
      expect(resizer.className).toContain('cursor-row-resize');
    });

    it('Vertical 方向时没有 h-2 和 cursor-row-resize 类', () => {
      render(<Resizer {...defaultProps} direction={Orientation.Vertical} />);
      const resizer = screen.getByRole('separator');
      expect(resizer.className).not.toContain('h-2');
      expect(resizer.className).not.toContain('cursor-row-resize');
    });

    it('Horizontal 方向时没有 w-2 和 cursor-col-resize 类', () => {
      render(<Resizer {...defaultProps} direction={Orientation.Horizontal} />);
      const resizer = screen.getByRole('separator');
      expect(resizer.className).not.toContain('w-2');
      expect(resizer.className).not.toContain('cursor-col-resize');
    });
  });

  describe('基础样式类', () => {
    it('具有 shrink-0 类', () => {
      render(<Resizer {...defaultProps} />);
      const resizer = screen.getByRole('separator');
      expect(resizer.className).toContain('shrink-0');
    });

    it('具有 bg-transparent 类', () => {
      render(<Resizer {...defaultProps} />);
      const resizer = screen.getByRole('separator');
      expect(resizer.className).toContain('bg-transparent');
    });

    it('具有 z-10 类', () => {
      render(<Resizer {...defaultProps} />);
      const resizer = screen.getByRole('separator');
      expect(resizer.className).toContain('z-10');
    });

    it('具有 touch-none 类', () => {
      render(<Resizer {...defaultProps} />);
      const resizer = screen.getByRole('separator');
      expect(resizer.className).toContain('touch-none');
    });
  });

  describe('内联样式', () => {
    it('具有 touchAction: none 样式', () => {
      render(<Resizer {...defaultProps} />);
      const resizer = screen.getByRole('separator');
      expect(resizer).toHaveStyle({ touchAction: 'none' });
    });
  });

  describe('onMouseDown 回调 (onPointerDown)', () => {
    it('pointerDown 事件触发 onMouseDown 回调', () => {
      const onMouseDown = vi.fn();
      render(<Resizer direction={Orientation.Vertical} onMouseDown={onMouseDown} />);
      const resizer = screen.getByRole('separator');

      fireEvent.pointerDown(resizer);
      expect(onMouseDown).toHaveBeenCalledTimes(1);
    });

    it('pointerDown 事件传递正确的事件对象', () => {
      const onMouseDown = vi.fn();
      render(<Resizer direction={Orientation.Vertical} onMouseDown={onMouseDown} />);
      const resizer = screen.getByRole('separator');

      fireEvent.pointerDown(resizer, { clientX: 100, clientY: 200, pointerId: 1 });
      expect(onMouseDown).toHaveBeenCalledWith(
        expect.objectContaining({
          clientX: 100,
          clientY: 200,
          pointerId: 1,
        }),
      );
    });

    it('Vertical 方向时 pointerDown 触发回调', () => {
      const onMouseDown = vi.fn();
      render(<Resizer direction={Orientation.Vertical} onMouseDown={onMouseDown} />);
      const resizer = screen.getByRole('separator');

      fireEvent.pointerDown(resizer);
      expect(onMouseDown).toHaveBeenCalledTimes(1);
    });

    it('Horizontal 方向时 pointerDown 触发回调', () => {
      const onMouseDown = vi.fn();
      render(<Resizer direction={Orientation.Horizontal} onMouseDown={onMouseDown} />);
      const resizer = screen.getByRole('separator');

      fireEvent.pointerDown(resizer);
      expect(onMouseDown).toHaveBeenCalledTimes(1);
    });

    it('多次 pointerDown 触发多次回调', () => {
      const onMouseDown = vi.fn();
      render(<Resizer direction={Orientation.Vertical} onMouseDown={onMouseDown} />);
      const resizer = screen.getByRole('separator');

      fireEvent.pointerDown(resizer);
      fireEvent.pointerDown(resizer);
      fireEvent.pointerDown(resizer);
      expect(onMouseDown).toHaveBeenCalledTimes(3);
    });
  });

  describe('事件类型', () => {
    it('使用 onPointerDown 事件处理器', () => {
      const onMouseDown = vi.fn();
      render(<Resizer direction={Orientation.Vertical} onMouseDown={onMouseDown} />);
      const resizer = screen.getByRole('separator');

      expect(resizer.onpointerdown).toBeDefined();
    });

    it('pointerDown 事件是 React.PointerEvent 类型', () => {
      const onMouseDown = vi.fn();
      render(<Resizer direction={Orientation.Vertical} onMouseDown={onMouseDown} />);
      const resizer = screen.getByRole('separator');

      fireEvent.pointerDown(resizer, { pointerType: 'mouse' });
      expect(onMouseDown).toHaveBeenCalledWith(
        expect.objectContaining({
          pointerType: 'mouse',
        }),
      );
    });

    it('支持 touch 类型的 pointer 事件', () => {
      const onMouseDown = vi.fn();
      render(<Resizer direction={Orientation.Vertical} onMouseDown={onMouseDown} />);
      const resizer = screen.getByRole('separator');

      fireEvent.pointerDown(resizer, { pointerType: 'touch' });
      expect(onMouseDown).toHaveBeenCalledWith(
        expect.objectContaining({
          pointerType: 'touch',
        }),
      );
    });

    it('支持 pen 类型的 pointer 事件', () => {
      const onMouseDown = vi.fn();
      render(<Resizer direction={Orientation.Vertical} onMouseDown={onMouseDown} />);
      const resizer = screen.getByRole('separator');

      fireEvent.pointerDown(resizer, { pointerType: 'pen' });
      expect(onMouseDown).toHaveBeenCalledWith(
        expect.objectContaining({
          pointerType: 'pen',
        }),
      );
    });
  });

  describe('组合场景', () => {
    it('Vertical 方向 + 完整样式验证', () => {
      render(<Resizer direction={Orientation.Vertical} onMouseDown={vi.fn()} />);
      const resizer = screen.getByRole('separator');

      expect(resizer.className).toContain('shrink-0');
      expect(resizer.className).toContain('bg-transparent');
      expect(resizer.className).toContain('z-10');
      expect(resizer.className).toContain('touch-none');
      expect(resizer.className).toContain('w-2');
      expect(resizer.className).toContain('cursor-col-resize');
      expect(resizer).toHaveAttribute('aria-orientation', 'vertical');
      expect(resizer).toHaveStyle({ touchAction: 'none' });
    });

    it('Horizontal 方向 + 完整样式验证', () => {
      render(<Resizer direction={Orientation.Horizontal} onMouseDown={vi.fn()} />);
      const resizer = screen.getByRole('separator');

      expect(resizer.className).toContain('shrink-0');
      expect(resizer.className).toContain('bg-transparent');
      expect(resizer.className).toContain('z-10');
      expect(resizer.className).toContain('touch-none');
      expect(resizer.className).toContain('h-2');
      expect(resizer.className).toContain('cursor-row-resize');
      expect(resizer).toHaveAttribute('aria-orientation', 'horizontal');
      expect(resizer).toHaveStyle({ touchAction: 'none' });
    });
  });
});
