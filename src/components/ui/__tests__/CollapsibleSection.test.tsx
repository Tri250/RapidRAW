import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CollapsibleSection from '../CollapsibleSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('lucide-react', () => ({
  ChevronDown: ({ className, size }: { className?: string; size?: number }) => (
    <svg data-testid="chevron-down" className={className} data-size={size} />
  ),
  Eye: ({ size }: { size?: number }) => <svg data-testid="eye-icon" data-size={size} />,
  EyeOff: ({ size }: { size?: number }) => <svg data-testid="eye-off-icon" data-size={size} />,
}));

describe('CollapsibleSection', () => {
  const defaultProps = {
    title: 'Test Section',
    isOpen: true,
    isContentVisible: true,
    onToggle: vi.fn(),
    onToggleVisibility: vi.fn(),
    canToggleVisibility: true,
    children: <div>Test Content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基础渲染', () => {
    it('渲染 title 标题', () => {
      render(<CollapsibleSection {...defaultProps} />);
      expect(screen.getByText('Test Section')).toBeInTheDocument();
    });

    it('渲染 children 内容', () => {
      render(<CollapsibleSection {...defaultProps} />);
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('渲染最外层容器', () => {
      render(<CollapsibleSection {...defaultProps} />);
      const container = screen.getByText('Test Section').closest('.bg-surface');
      expect(container).toBeInTheDocument();
      expect(container).toHaveClass('rounded-lg');
      expect(container).toHaveClass('overflow-hidden');
      expect(container).toHaveClass('shrink-0');
    });

    it('渲染 header 区域', () => {
      render(<CollapsibleSection {...defaultProps} />);
      const header = screen.getByText('Test Section').closest('div[class*="flex items-center justify-between"]');
      expect(header).toBeInTheDocument();
      expect(header).toHaveClass('w-full');
      expect(header).toHaveClass('px-4');
      expect(header).toHaveClass('py-3');
      expect(header).toHaveClass('text-left');
    });

    it('渲染 ChevronDown 图标', () => {
      render(<CollapsibleSection {...defaultProps} />);
      expect(screen.getByTestId('chevron-down')).toBeInTheDocument();
    });

    it('渲染内容包装器', () => {
      render(<CollapsibleSection {...defaultProps} />);
      const contentWrapper = screen.getByText('Test Content').closest('div[class*="overflow-hidden"]');
      expect(contentWrapper).toBeInTheDocument();
      expect(contentWrapper).toHaveClass('transition-all');
      expect(contentWrapper).toHaveClass('duration-300');
      expect(contentWrapper).toHaveClass('ease-in-out');
    });
  });

  describe('展开/收起状态', () => {
    it('isOpen 为 true 时内容在 DOM 中存在', () => {
      render(<CollapsibleSection {...defaultProps} isOpen={true} />);
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('isOpen 为 false 时内容在 DOM 中存在（只是被收起）', () => {
      render(<CollapsibleSection {...defaultProps} isOpen={false} />);
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('isOpen 为 true 时 Chevron 图标旋转 180 度', () => {
      render(<CollapsibleSection {...defaultProps} isOpen={true} />);
      const chevron = screen.getByTestId('chevron-down');
      expect(chevron).toHaveClass('rotate-180');
      expect(chevron).toHaveClass('transition-transform');
      expect(chevron).toHaveClass('duration-300');
      expect(chevron).toHaveClass('text-accent');
    });

    it('isOpen 为 false 时 Chevron 图标不旋转', () => {
      render(<CollapsibleSection {...defaultProps} isOpen={false} />);
      const chevron = screen.getByTestId('chevron-down');
      expect(chevron).not.toHaveClass('rotate-180');
    });
  });

  describe('点击交互', () => {
    it('点击标题区域时调用 onToggle', () => {
      render(<CollapsibleSection {...defaultProps} />);
      const header = screen.getByText('Test Section').closest('div[class*="flex items-center justify-between"]');
      fireEvent.click(header!);
      expect(defaultProps.onToggle).toHaveBeenCalledTimes(1);
    });

    it('点击 Chevron 图标时调用 onToggle', () => {
      render(<CollapsibleSection {...defaultProps} />);
      const chevron = screen.getByTestId('chevron-down');
      fireEvent.click(chevron);
      expect(defaultProps.onToggle).toHaveBeenCalledTimes(1);
    });

    it('点击标题文字时调用 onToggle', () => {
      render(<CollapsibleSection {...defaultProps} />);
      fireEvent.click(screen.getByText('Test Section'));
      expect(defaultProps.onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('可见性切换', () => {
    describe('canToggleVisibility 控制', () => {
      it('canToggleVisibility 为 true 时显示眼睛图标', () => {
        render(<CollapsibleSection {...defaultProps} canToggleVisibility={true} />);
        expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
      });

      it('canToggleVisibility 为 false 时不显示眼睛图标', () => {
        render(<CollapsibleSection {...defaultProps} canToggleVisibility={false} />);
        expect(screen.queryByTestId('eye-icon')).not.toBeInTheDocument();
        expect(screen.queryByTestId('eye-off-icon')).not.toBeInTheDocument();
      });
    });

    describe('isContentVisible 控制图标', () => {
      it('isContentVisible 为 true 时显示 Eye 图标', () => {
        render(<CollapsibleSection {...defaultProps} isContentVisible={true} />);
        expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
        expect(screen.queryByTestId('eye-off-icon')).not.toBeInTheDocument();
      });

      it('isContentVisible 为 false 时显示 EyeOff 图标', () => {
        render(<CollapsibleSection {...defaultProps} isContentVisible={false} />);
        expect(screen.getByTestId('eye-off-icon')).toBeInTheDocument();
        expect(screen.queryByTestId('eye-icon')).not.toBeInTheDocument();
      });
    });

    describe('点击可见性按钮', () => {
      it('点击眼睛图标调用 onToggleVisibility', () => {
        render(<CollapsibleSection {...defaultProps} />);
        const eyeButton = screen.getByTestId('eye-icon').closest('button');
        fireEvent.click(eyeButton!);
        expect(defaultProps.onToggleVisibility).toHaveBeenCalledTimes(1);
      });

      it('点击眼睛图标时 stopPropagation（不触发 onToggle）', () => {
        render(<CollapsibleSection {...defaultProps} />);
        const eyeButton = screen.getByTestId('eye-icon').closest('button');
        fireEvent.click(eyeButton!);
        expect(defaultProps.onToggleVisibility).toHaveBeenCalledTimes(1);
        expect(defaultProps.onToggle).not.toHaveBeenCalled();
      });

      it('isContentVisible 为 false 时点击 EyeOff 也调用 onToggleVisibility', () => {
        render(<CollapsibleSection {...defaultProps} isContentVisible={false} />);
        const eyeOffButton = screen.getByTestId('eye-off-icon').closest('button');
        fireEvent.click(eyeOffButton!);
        expect(defaultProps.onToggleVisibility).toHaveBeenCalledTimes(1);
      });
    });

    describe('内容可见性样式', () => {
      it('isContentVisible 为 false 时内容有 opacity-30 样式', () => {
        render(<CollapsibleSection {...defaultProps} isContentVisible={false} />);
        const contentWrapper = screen.getByText('Test Content').closest('div[class*="transition-opacity"]');
        expect(contentWrapper).toHaveClass('opacity-30');
      });

      it('isContentVisible 为 false 时内容有 pointer-events-none 样式', () => {
        render(<CollapsibleSection {...defaultProps} isContentVisible={false} />);
        const contentWrapper = screen.getByText('Test Content').closest('div[class*="transition-opacity"]');
        expect(contentWrapper).toHaveClass('pointer-events-none');
      });

      it('isContentVisible 为 true 时内容没有 opacity-30 样式', () => {
        render(<CollapsibleSection {...defaultProps} isContentVisible={true} />);
        const contentWrapper = screen.getByText('Test Content').closest('div[class*="transition-opacity"]');
        expect(contentWrapper).not.toHaveClass('opacity-30');
        expect(contentWrapper).not.toHaveClass('pointer-events-none');
      });

      it('内容区域有 px-4 pb-4 样式', () => {
        render(<CollapsibleSection {...defaultProps} />);
        const contentWrapper = screen.getByText('Test Content').closest('div[class*="transition-opacity"]');
        expect(contentWrapper).toHaveClass('px-4');
        expect(contentWrapper).toHaveClass('pb-4');
      });
    });

    describe('按钮 tooltip', () => {
      it('isContentVisible 为 true 时 tooltip 是 disableSection', () => {
        render(<CollapsibleSection {...defaultProps} isContentVisible={true} />);
        const eyeButton = screen.getByTestId('eye-icon').closest('button');
        expect(eyeButton).toHaveAttribute('data-tooltip', 'ui.collapsibleSection.disableSection');
      });

      it('isContentVisible 为 false 时 tooltip 是 enableSection', () => {
        render(<CollapsibleSection {...defaultProps} isContentVisible={false} />);
        const eyeOffButton = screen.getByTestId('eye-off-icon').closest('button');
        expect(eyeOffButton).toHaveAttribute('data-tooltip', 'ui.collapsibleSection.enableSection');
      });
    });
  });

  describe('悬停效果', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('鼠标进入 250ms 后眼睛图标变为 opacity-100', () => {
      render(<CollapsibleSection {...defaultProps} isContentVisible={true} />);
      const header = screen.getByText('Test Section').closest('div[class*="flex items-center justify-between"]');
      const eyeButton = screen.getByTestId('eye-icon').closest('button');

      expect(eyeButton).toHaveClass('opacity-0');
      expect(eyeButton).toHaveClass('pointer-events-none');

      fireEvent.mouseEnter(header!);
      expect(eyeButton).toHaveClass('opacity-0');

      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(eyeButton).toHaveClass('opacity-100');
      expect(eyeButton).not.toHaveClass('pointer-events-none');
    });

    it('鼠标进入不足 250ms 时眼睛图标仍为 opacity-0', () => {
      render(<CollapsibleSection {...defaultProps} isContentVisible={true} />);
      const header = screen.getByText('Test Section').closest('div[class*="flex items-center justify-between"]');
      const eyeButton = screen.getByTestId('eye-icon').closest('button');

      fireEvent.mouseEnter(header!);
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(eyeButton).toHaveClass('opacity-0');
    });

    it('鼠标离开后眼睛图标变为 opacity-0', () => {
      render(<CollapsibleSection {...defaultProps} isContentVisible={true} />);
      const header = screen.getByText('Test Section').closest('div[class*="flex items-center justify-between"]');
      const eyeButton = screen.getByTestId('eye-icon').closest('button');

      fireEvent.mouseEnter(header!);
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(eyeButton).toHaveClass('opacity-100');

      fireEvent.mouseLeave(header!);
      expect(eyeButton).toHaveClass('opacity-0');
    });

    it('canToggleVisibility 为 false 时不处理悬停', () => {
      render(<CollapsibleSection {...defaultProps} canToggleVisibility={false} />);
      const header = screen.getByText('Test Section').closest('div[class*="flex items-center justify-between"]');

      fireEvent.mouseEnter(header!);
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(screen.queryByTestId('eye-icon')).not.toBeInTheDocument();
      expect(screen.queryByTestId('eye-off-icon')).not.toBeInTheDocument();
    });

    it('鼠标离开时清除悬停定时器（快速进出不显示）', () => {
      render(<CollapsibleSection {...defaultProps} isContentVisible={true} />);
      const header = screen.getByText('Test Section').closest('div[class*="flex items-center justify-between"]');
      const eyeButton = screen.getByTestId('eye-icon').closest('button');

      fireEvent.mouseEnter(header!);
      act(() => {
        vi.advanceTimersByTime(100);
      });
      fireEvent.mouseLeave(header!);
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(eyeButton).toHaveClass('opacity-0');
    });

    it('isContentVisible 为 false 时眼睛图标默认显示（opacity-100）', () => {
      render(<CollapsibleSection {...defaultProps} isContentVisible={false} />);
      const eyeOffButton = screen.getByTestId('eye-off-icon').closest('button');
      expect(eyeOffButton).toHaveClass('opacity-100');
    });
  });

  describe('右键菜单', () => {
    it('onContextMenu 被正确传递到容器', () => {
      const onContextMenu = vi.fn();
      render(<CollapsibleSection {...defaultProps} onContextMenu={onContextMenu} />);
      const container = screen.getByText('Test Section').closest('.bg-surface');
      fireEvent.contextMenu(container!);
      expect(onContextMenu).toHaveBeenCalledTimes(1);
    });

    it('未传递 onContextMenu 时不报错', () => {
      const { container } = render(<CollapsibleSection {...defaultProps} onContextMenu={undefined} />);
      const sectionContainer = container.querySelector('.bg-surface');
      expect(() => fireEvent.contextMenu(sectionContainer!)).not.toThrow();
    });
  });

  describe('默认 props', () => {
    it('canToggleVisibility 默认为 true', () => {
      const props = {
        title: 'Test Section',
        isOpen: true,
        isContentVisible: true,
        onToggle: vi.fn(),
        children: <div>Test Content</div>,
      };
      render(<CollapsibleSection {...props} />);
      expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
    });

    it('onToggleVisibility 默认为空函数（不报错）', () => {
      const props = {
        title: 'Test Section',
        isOpen: true,
        isContentVisible: true,
        onToggle: vi.fn(),
        children: <div>Test Content</div>,
      };
      render(<CollapsibleSection {...props} />);
      const eyeButton = screen.getByTestId('eye-icon').closest('button');
      expect(() => fireEvent.click(eyeButton!)).not.toThrow();
    });
  });

  describe('动画效果', () => {
    it('内容包装器有过渡动画类', () => {
      render(<CollapsibleSection {...defaultProps} />);
      const contentWrapper = screen.getByText('Test Content').closest('div[class*="overflow-hidden"]');
      expect(contentWrapper).toHaveClass('transition-all');
      expect(contentWrapper).toHaveClass('duration-300');
      expect(contentWrapper).toHaveClass('ease-in-out');
    });

    it('Chevron 图标有过渡动画类', () => {
      render(<CollapsibleSection {...defaultProps} />);
      const chevron = screen.getByTestId('chevron-down');
      expect(chevron).toHaveClass('transition-transform');
      expect(chevron).toHaveClass('duration-300');
    });

    it('可见性按钮有过渡动画类', () => {
      render(<CollapsibleSection {...defaultProps} />);
      const eyeButton = screen.getByTestId('eye-icon').closest('button');
      expect(eyeButton).toHaveClass('transition-opacity');
      expect(eyeButton).toHaveClass('duration-300');
    });

    it('内容区域有 opacity 过渡动画类', () => {
      render(<CollapsibleSection {...defaultProps} />);
      const contentWrapper = screen.getByText('Test Content').closest('div[class*="transition-opacity"]');
      expect(contentWrapper).toHaveClass('transition-opacity');
      expect(contentWrapper).toHaveClass('duration-300');
    });

    it('header 有 hover 背景色过渡', () => {
      render(<CollapsibleSection {...defaultProps} />);
      const header = screen.getByText('Test Section').closest('div[class*="flex items-center justify-between"]');
      expect(header).toHaveClass('hover:bg-card-active');
      expect(header).toHaveClass('transition-colors');
      expect(header).toHaveClass('duration-200');
    });
  });

  describe('受控模式', () => {
    it('isOpen 从 true 变为 false 时更新 Chevron 图标状态', () => {
      const { rerender } = render(<CollapsibleSection {...defaultProps} isOpen={true} />);
      const chevron = screen.getByTestId('chevron-down');
      expect(chevron).toHaveClass('rotate-180');

      rerender(<CollapsibleSection {...defaultProps} isOpen={false} />);
      expect(chevron).not.toHaveClass('rotate-180');
    });

    it('isContentVisible 变化时更新图标和样式', () => {
      const { rerender } = render(<CollapsibleSection {...defaultProps} isContentVisible={true} />);
      expect(screen.getByTestId('eye-icon')).toBeInTheDocument();

      rerender(<CollapsibleSection {...defaultProps} isContentVisible={false} />);
      expect(screen.getByTestId('eye-off-icon')).toBeInTheDocument();

      const contentWrapper = screen.getByText('Test Content').closest('div[class*="transition-opacity"]');
      expect(contentWrapper).toHaveClass('opacity-30');
      expect(contentWrapper).toHaveClass('pointer-events-none');
    });

    it('onToggle 回调被正确调用', () => {
      const onToggle = vi.fn();
      render(<CollapsibleSection {...defaultProps} onToggle={onToggle} />);
      const header = screen.getByText('Test Section').closest('div[class*="flex items-center justify-between"]');
      fireEvent.click(header!);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('onToggleVisibility 回调被正确调用', () => {
      const onToggleVisibility = vi.fn();
      render(<CollapsibleSection {...defaultProps} onToggleVisibility={onToggleVisibility} />);
      const eyeButton = screen.getByTestId('eye-icon').closest('button');
      fireEvent.click(eyeButton!);
      expect(onToggleVisibility).toHaveBeenCalledTimes(1);
    });
  });

  describe('多种 children 类型', () => {
    it('支持字符串 children', () => {
      render(<CollapsibleSection {...defaultProps}>String Content</CollapsibleSection>);
      expect(screen.getByText('String Content')).toBeInTheDocument();
    });

    it('支持多个子元素', () => {
      render(
        <CollapsibleSection {...defaultProps}>
          <div>Child 1</div>
          <div>Child 2</div>
          <span>Child 3</span>
        </CollapsibleSection>,
      );
      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
      expect(screen.getByText('Child 3')).toBeInTheDocument();
    });

    it('支持复杂的嵌套结构', () => {
      render(
        <CollapsibleSection {...defaultProps}>
          <div>
            <h3>Subtitle</h3>
            <p>Paragraph text</p>
            <button>Action</button>
          </div>
        </CollapsibleSection>,
      );
      expect(screen.getByText('Subtitle')).toBeInTheDocument();
      expect(screen.getByText('Paragraph text')).toBeInTheDocument();
      expect(screen.getByText('Action')).toBeInTheDocument();
    });
  });
});
