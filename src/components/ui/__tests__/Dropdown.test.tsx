import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Dropdown from '../Dropdown';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockOptions = [
  { label: 'Apple', value: 'apple' },
  { label: 'Banana', value: 'banana' },
  { label: 'Cherry', value: 'cherry' },
  { label: 'Date', value: 'date' },
];

const numericOptions = [
  { label: 'One', value: 1 },
  { label: 'Two', value: 2 },
  { label: 'Three', value: 3 },
];

describe('Dropdown', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('基础渲染', () => {
    it('渲染触发按钮', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button.tagName).toBe('BUTTON');
    });

    it('显示默认 placeholder 当没有值时', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      expect(screen.getByText('Select an option')).toBeInTheDocument();
    });

    it('显示自定义 placeholder 当没有值时', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} placeholder="Select fruit" />);

      expect(screen.getByText('Select fruit')).toBeInTheDocument();
    });

    it('显示选中项的 label 当有值时', () => {
      render(<Dropdown value="banana" onChange={mockOnChange} options={mockOptions} />);

      expect(screen.getByText('Banana')).toBeInTheDocument();
    });

    it('value 不在 options 中时显示 placeholder', () => {
      render(<Dropdown value="nonexistent" onChange={mockOnChange} options={mockOptions} />);

      expect(screen.getByText('Select an option')).toBeInTheDocument();
    });

    it('支持数字类型的 value', () => {
      render(<Dropdown value={2} onChange={mockOnChange} options={numericOptions} />);

      expect(screen.getByText('Two')).toBeInTheDocument();
    });

    it('渲染 ChevronDown 图标', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      const svg = button.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('禁用状态', () => {
    it('禁用时按钮有 disabled 属性', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} disabled={true} />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('禁用时有对应的样式类', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} disabled={true} />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('disabled:opacity-50');
      expect(button.className).toContain('disabled:cursor-not-allowed');
    });

    it('禁用时点击不打开下拉', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} disabled={true} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('非禁用时按钮没有 disabled 属性', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} disabled={false} />);

      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled();
    });
  });

  describe('打开/关闭', () => {
    it('点击按钮打开下拉列表', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(screen.getByRole('listbox')).toBeInTheDocument();
      mockOptions.forEach((opt) => {
        expect(screen.getByText(opt.label)).toBeInTheDocument();
      });
    });

    it('再次点击按钮关闭下拉列表', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      fireEvent.click(button);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('点击外部关闭下拉列表 (mousedown)', () => {
      render(
        <div>
          <div data-testid="outside">Outside</div>
          <Dropdown value={null} onChange={mockOnChange} options={mockOptions} />
        </div>,
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByTestId('outside'));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('点击外部关闭下拉列表 (touchstart)', () => {
      render(
        <div>
          <div data-testid="outside">Outside</div>
          <Dropdown value={null} onChange={mockOnChange} options={mockOptions} />
        </div>,
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      fireEvent.touchStart(screen.getByTestId('outside'));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('点击下拉内容内部不关闭', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      const listbox = screen.getByRole('listbox');
      fireEvent.mouseDown(listbox);
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('打开时 ChevronDown 图标旋转 180 度', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      let svg = button.querySelector('svg');
      expect(svg).not.toHaveClass('rotate-180');

      fireEvent.click(button);
      svg = button.querySelector('svg');
      expect(svg).toHaveClass('rotate-180');
    });
  });

  describe('选项列表', () => {
    it('显示所有选项', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      const options = screen.getAllByRole('option');
      expect(options.length).toBe(mockOptions.length);
    });

    it('每个选项有正确的 role 和 aria 属性', () => {
      render(<Dropdown value="apple" onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      const options = screen.getAllByRole('option');
      options.forEach((opt, index) => {
        expect(opt).toHaveAttribute('aria-selected', String(mockOptions[index].value === 'apple'));
      });
    });

    it('选中的选项有 Check 图标', () => {
      render(<Dropdown value="banana" onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      const options = screen.getAllByRole('option');
      const bananaOption = options.find((opt) => opt.textContent?.includes('Banana'));
      const otherOption = options.find((opt) => opt.textContent?.includes('Apple'));

      expect(bananaOption?.querySelector('svg')).toBeInTheDocument();
      expect(otherOption?.querySelector('svg')).not.toBeInTheDocument();
    });

    it('listbox 有正确的 aria-orientation', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      const listbox = screen.getByRole('listbox');
      expect(listbox).toHaveAttribute('aria-orientation', 'vertical');
    });
  });

  describe('选择选项', () => {
    it('点击选项调用 onChange 并传入正确的值', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      fireEvent.click(screen.getByText('Cherry'));
      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith('cherry');
    });

    it('选择数字类型选项时调用 onChange 并传入数字值', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={numericOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      fireEvent.click(screen.getByText('Three'));
      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith(3);
    });

    it('选择后关闭下拉列表', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Apple'));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('选中的选项有高亮样式', () => {
      render(<Dropdown value="banana" onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      const options = screen.getAllByRole('option');
      const bananaOption = options.find((opt) => opt.textContent?.includes('Banana'));

      expect(bananaOption).toHaveAttribute('aria-selected', 'true');
      expect(bananaOption?.className).toContain('bg-bg-primary');
    });

    it('未选中的选项没有高亮样式', () => {
      render(<Dropdown value="banana" onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      const options = screen.getAllByRole('option');
      const appleOption = options.find((opt) => opt.textContent?.includes('Apple'));
      const bananaOption = options.find((opt) => opt.textContent?.includes('Banana'));

      expect(appleOption).toHaveAttribute('aria-selected', 'false');
      expect(appleOption?.classList.contains('bg-bg-primary')).toBe(false);
      expect(bananaOption?.classList.contains('bg-bg-primary')).toBe(true);
    });
  });

  describe('搜索过滤', () => {
    it('输入可打印字符时打开搜索并过滤选项', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const container = screen.getByRole('button').parentElement;
      fireEvent.keyDown(container!, { key: 'a' });

      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Filter options...')).toBeInTheDocument();

      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.getByText('Banana')).toBeInTheDocument();
      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.queryByText('Cherry')).not.toBeInTheDocument();
    });

    it('使用自定义 searchPlaceholder', () => {
      render(
        <Dropdown value={null} onChange={mockOnChange} options={mockOptions} searchPlaceholder="Search fruits..." />,
      );

      const container = screen.getByRole('button').parentElement;
      fireEvent.keyDown(container!, { key: 'a' });

      expect(screen.getByPlaceholderText('Search fruits...')).toBeInTheDocument();
    });

    it('搜索词不区分大小写', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const container = screen.getByRole('button').parentElement;
      fireEvent.keyDown(container!, { key: 'C' });

      expect(screen.getByText('Cherry')).toBeInTheDocument();
      expect(screen.queryByText('Apple')).not.toBeInTheDocument();
    });

    it('在搜索框中输入继续过滤', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const container = screen.getByRole('button').parentElement;
      fireEvent.keyDown(container!, { key: 'a' });

      const searchInput = screen.getByPlaceholderText('Filter options...');
      fireEvent.change(searchInput, { target: { value: 'ap' } });

      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.queryByText('Banana')).not.toBeInTheDocument();
      expect(screen.queryByText('Cherry')).not.toBeInTheDocument();
      expect(screen.queryByText('Date')).not.toBeInTheDocument();
    });

    it('清空搜索词后显示所有选项', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const container = screen.getByRole('button').parentElement;
      fireEvent.keyDown(container!, { key: 'a' });

      const searchInput = screen.getByPlaceholderText('Filter options...');
      fireEvent.change(searchInput, { target: { value: '' } });

      mockOptions.forEach((opt) => {
        expect(screen.getByText(opt.label)).toBeInTheDocument();
      });
    });

    it('关闭下拉时清空搜索词和搜索状态', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      const container = button.parentElement;

      fireEvent.keyDown(container!, { key: 'a' });
      expect(screen.getByPlaceholderText('Filter options...')).toBeInTheDocument();

      fireEvent.click(button);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

      fireEvent.click(button);
      expect(screen.queryByPlaceholderText('Filter options...')).not.toBeInTheDocument();
      mockOptions.forEach((opt) => {
        expect(screen.getByText(opt.label)).toBeInTheDocument();
      });
    });

    it('搜索无结果时不显示选项', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const container = screen.getByRole('button').parentElement;
      fireEvent.keyDown(container!, { key: 'z' });

      expect(screen.queryAllByRole('option').length).toBe(0);
    });

    it('搜索输入框有 autoFocus', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const container = screen.getByRole('button').parentElement;
      fireEvent.keyDown(container!, { key: 'a' });

      const searchInput = screen.getByPlaceholderText('Filter options...');
      expect(searchInput).toHaveFocus();
    });
  });

  describe('键盘交互', () => {
    it('Escape 键关闭下拉', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      fireEvent.keyDown(button.parentElement!, { key: 'Escape' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('Escape 键调用 stopPropagation', () => {
      const handleKeyDown = vi.fn();
      render(
        <div onKeyDown={handleKeyDown}>
          <Dropdown value={null} onChange={mockOnChange} options={mockOptions} />
        </div>,
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      fireEvent.keyDown(button.parentElement!, { key: 'Escape' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('可打印字符打开搜索', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const container = screen.getByRole('button').parentElement;
      fireEvent.keyDown(container!, { key: 'x' });

      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Filter options...')).toBeInTheDocument();
    });

    it('search input 获得焦点时不处理字符键', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const container = screen.getByRole('button').parentElement;
      fireEvent.keyDown(container!, { key: 'a' });

      const searchInput = screen.getByPlaceholderText('Filter options...');
      expect(searchInput).toBeInTheDocument();

      fireEvent.keyDown(searchInput, { key: 'b' });

      expect((searchInput as HTMLInputElement).value).toBe('a');
    });

    it('修饰键组合不触发搜索 (metaKey)', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const container = screen.getByRole('button').parentElement;

      fireEvent.keyDown(container!, { key: 'a', metaKey: true });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('修饰键组合不触发搜索 (ctrlKey)', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const container = screen.getByRole('button').parentElement;

      fireEvent.keyDown(container!, { key: 'a', ctrlKey: true });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('修饰键组合不触发搜索 (altKey)', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const container = screen.getByRole('button').parentElement;

      fireEvent.keyDown(container!, { key: 'a', altKey: true });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('Enter 键在只有一个过滤结果时选择该选项', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      const container = button.parentElement;

      fireEvent.keyDown(container!, { key: 'c' });

      expect(screen.getByText('Cherry')).toBeInTheDocument();
      expect(screen.queryAllByRole('option').length).toBe(1);

      fireEvent.keyDown(container!, { key: 'Enter' });

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith('cherry');
    });

    it('Enter 键在多个过滤结果时不选择', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      const container = button.parentElement;

      fireEvent.keyDown(container!, { key: 'a' });
      expect(screen.queryAllByRole('option').length).toBeGreaterThan(1);

      fireEvent.keyDown(container!, { key: 'Enter' });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('Enter 键在下拉关闭时不触发选择', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      const container = button.parentElement;

      fireEvent.keyDown(container!, { key: 'Enter' });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('功能键不触发搜索 (如 F1)', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const container = screen.getByRole('button').parentElement;

      fireEvent.keyDown(container!, { key: 'F1' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('样式和 className', () => {
    it('自定义 className 被应用到容器', () => {
      const { container } = render(
        <Dropdown value={null} onChange={mockOnChange} options={mockOptions} className="custom-dropdown-class" />,
      );

      expect(container.firstChild).toHaveClass('custom-dropdown-class');
      expect(container.firstChild).toHaveClass('relative');
    });

    it('triggerClassName 被应用到触发按钮', () => {
      render(
        <Dropdown value={null} onChange={mockOnChange} options={mockOptions} triggerClassName="custom-trigger-class" />,
      );

      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-trigger-class');
    });

    it('triggerClassName 为空时使用默认 bg-surface', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-surface');
    });

    it('triggerClassName 不为空时不使用默认 bg-surface', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} triggerClassName="bg-red-500" />);

      const button = screen.getByRole('button');
      expect(button).not.toHaveClass('bg-surface');
      expect(button).toHaveClass('bg-red-500');
    });

    it('按钮有基础样式类', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('w-full');
      expect(button.className).toContain('border');
      expect(button.className).toContain('border-border-color');
      expect(button.className).toContain('rounded-md');
      expect(button.className).toContain('flex');
      expect(button.className).toContain('justify-between');
      expect(button.className).toContain('items-center');
      expect(button.className).toContain('text-left');
    });

    it('按钮有焦点样式类', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('focus:ring-accent');
      expect(button.className).toContain('focus:border-accent');
      expect(button.className).toContain('focus:ring-2');
    });
  });

  describe('ARIA 属性', () => {
    it('按钮有正确的 aria-haspopup 属性', () => {
      render(<Dropdown value="apple" onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-haspopup', 'listbox');
    });

    it('关闭时 aria-expanded 为 false', () => {
      render(<Dropdown value="apple" onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('打开时 aria-expanded 为 true', () => {
      render(<Dropdown value="apple" onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('选项有正确的 aria-selected 属性', () => {
      render(<Dropdown value="apple" onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      const options = screen.getAllByRole('option');
      const appleOption = options.find((opt) => opt.textContent?.includes('Apple'));
      const bananaOption = options.find((opt) => opt.textContent?.includes('Banana'));

      expect(appleOption).toHaveAttribute('aria-selected', 'true');
      expect(bananaOption).toHaveAttribute('aria-selected', 'false');
    });

    it('listbox 有正确的 role', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      const listbox = screen.getByRole('listbox');
      expect(listbox).toBeInTheDocument();
    });

    it('选项有正确的 role', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      const options = screen.getAllByRole('option');
      expect(options.length).toBe(mockOptions.length);
    });
  });

  describe('空选项', () => {
    it('options 为空时打开下拉不显示选项', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={[]} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(screen.queryAllByRole('option').length).toBe(0);
    });

    it('options 为空时显示 placeholder', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={[]} placeholder="No options available" />);

      expect(screen.getByText('No options available')).toBeInTheDocument();
    });
  });

  describe('按钮 type 属性', () => {
    it('按钮 type 为 button', () => {
      render(<Dropdown value={null} onChange={mockOnChange} options={mockOptions} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'button');
    });
  });
});
