import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Button from '../Button';

vi.mock('../../../utils/hapticFeedback', () => ({
  hapticOnButtonPress: vi.fn(),
}));

import { hapticOnButtonPress } from '../../../utils/hapticFeedback';

describe('Button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基础渲染', () => {
    it('渲染 children 内容', () => {
      render(<Button onClick={() => {}}>Click Me</Button>);
      expect(screen.getByText('Click Me')).toBeInTheDocument();
    });

    it('渲染为 button 元素', () => {
      render(<Button onClick={() => {}}>Test</Button>);
      const button = screen.getByRole('button');
      expect(button.tagName).toBe('BUTTON');
    });

    it('应用 className', () => {
      render(
        <Button onClick={() => {}} className="custom-class">
          Test
        </Button>
      );
      const button = screen.getByRole('button');
      expect(button.className).toContain('custom-class');
    });
  });

  describe('点击行为', () => {
    it('点击时调用 onClick', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Test</Button>);
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('禁用时点击不调用 onClick', () => {
      const handleClick = vi.fn();
      render(
        <Button onClick={handleClick} disabled>
          Test
        </Button>
      );
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('点击时调用 hapticOnButtonPress', () => {
      render(<Button onClick={() => {}}>Test</Button>);
      fireEvent.click(screen.getByRole('button'));
      expect(hapticOnButtonPress).toHaveBeenCalledTimes(1);
    });

    it('禁用时点击不调用 hapticOnButtonPress', () => {
      render(
        <Button onClick={() => {}} disabled>
          Test
        </Button>
      );
      fireEvent.click(screen.getByRole('button'));
      expect(hapticOnButtonPress).not.toHaveBeenCalled();
    });
  });

  describe('禁用状态', () => {
    it('disabled 为 true 时 button 有 disabled 属性', () => {
      render(
        <Button onClick={() => {}} disabled>
          Test
        </Button>
      );
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('disabled 为 false 时 button 没有 disabled 属性', () => {
      render(<Button onClick={() => {}}>Test</Button>);
      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled();
    });

    it('禁用时有对应的样式类', () => {
      render(
        <Button onClick={() => {}} disabled>
          Test
        </Button>
      );
      const button = screen.getByRole('button');
      expect(button.className).toContain('disabled:opacity-50');
      expect(button.className).toContain('disabled:cursor-not-allowed');
      expect(button.className).toContain('disabled:shadow-none');
      expect(button.className).toContain('disabled:hover:scale-100');
    });
  });

  describe('变体和样式', () => {
    it('默认有 bg-accent 类', () => {
      render(<Button onClick={() => {}}>Test</Button>);
      const button = screen.getByRole('button');
      expect(button.className).toContain('bg-accent');
    });

    it('默认有 shadow-shiny 类', () => {
      render(<Button onClick={() => {}}>Test</Button>);
      const button = screen.getByRole('button');
      expect(button.className).toContain('shadow-shiny');
    });

    it('className 包含 bg-surface 时有 bg-surface 类', () => {
      render(
        <Button onClick={() => {}} className="bg-surface">
          Test
        </Button>
      );
      const button = screen.getByRole('button');
      expect(button.className).toContain('bg-surface');
    });

    it('className 包含 bg-surface 时没有 bg-accent 类', () => {
      render(
        <Button onClick={() => {}} className="bg-surface">
          Test
        </Button>
      );
      const button = screen.getByRole('button');
      expect(button.className).not.toContain('bg-accent');
    });

    it('className 包含 bg-surface 时没有 shadow-shiny 类', () => {
      render(
        <Button onClick={() => {}} className="bg-surface">
          Test
        </Button>
      );
      const button = screen.getByRole('button');
      expect(button.className).not.toContain('shadow-shiny');
    });

    it('有正确的基础样式类 - flex 布局', () => {
      render(<Button onClick={() => {}}>Test</Button>);
      const button = screen.getByRole('button');
      expect(button.className).toContain('flex');
      expect(button.className).toContain('items-center');
      expect(button.className).toContain('justify-center');
      expect(button.className).toContain('gap-2');
      expect(button.className).toContain('sm:gap-3');
    });

    it('有正确的基础样式类 - 字体和间距', () => {
      render(<Button onClick={() => {}}>Test</Button>);
      const button = screen.getByRole('button');
      expect(button.className).toContain('font-semibold');
      expect(button.className).toContain('py-2.5');
      expect(button.className).toContain('px-4');
      expect(button.className).toContain('sm:px-5');
      expect(button.className).toContain('rounded-md');
    });

    it('有正确的基础样式类 - 文字和尺寸', () => {
      render(<Button onClick={() => {}}>Test</Button>);
      const button = screen.getByRole('button');
      expect(button.className).toContain('text-button-text');
      expect(button.className).toContain('text-sm');
      expect(button.className).toContain('sm:text-base');
      expect(button.className).toContain('min-h-[40px]');
      expect(button.className).toContain('sm:min-h-[44px]');
    });

    it('有正确的基础样式类 - 过渡和缩放效果', () => {
      render(<Button onClick={() => {}}>Test</Button>);
      const button = screen.getByRole('button');
      expect(button.className).toContain('transition-transform');
      expect(button.className).toContain('duration-200');
      expect(button.className).toContain('hover:scale-[1.01]');
      expect(button.className).toContain('active:scale-[.98]');
    });
  });

  describe('属性传递', () => {
    it('传递 autoFocus 属性', () => {
      render(<Button onClick={() => {}} autoFocus>Test</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveFocus();
    });

    it('传递 title 属性', () => {
      render(
        <Button onClick={() => {}} title="Test Title">
          Test
        </Button>
      );
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Test Title');
    });

    it('传递 tabIndex 属性', () => {
      render(
        <Button onClick={() => {}} tabIndex={-1}>
          Test
        </Button>
      );
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('tabindex', '-1');
    });

    it('默认 tabIndex 为 0', () => {
      render(<Button onClick={() => {}}>Test</Button>);
      const button = screen.getByRole('button');
      expect(button.tabIndex).toBe(0);
    });
  });
});
