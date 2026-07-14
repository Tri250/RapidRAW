import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Switch from '../Switch';

vi.mock('../../../utils/hapticFeedback', () => ({
  hapticOnToggle: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, initial, animate, transition, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

import { hapticOnToggle } from '../../../utils/hapticFeedback';

describe('Switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基础渲染', () => {
    it('渲染 label 文本', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} />);
      expect(screen.getByText('Test Switch')).toBeInTheDocument();
    });

    it('渲染为 checkbox input', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} />);
      const input = screen.getByRole('checkbox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'checkbox');
    });

    it('checked 状态为 true 时正确反映', () => {
      render(<Switch label="Test Switch" checked={true} onChange={() => {}} />);
      const input = screen.getByRole('checkbox');
      expect(input).toBeChecked();
    });

    it('checked 状态为 false 时正确反映', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} />);
      const input = screen.getByRole('checkbox');
      expect(input).not.toBeChecked();
    });
  });

  describe('切换行为', () => {
    it('点击时调用 onChange 并传入新值（false -> true）', () => {
      const onChange = vi.fn();
      render(<Switch label="Test Switch" checked={false} onChange={onChange} />);
      const input = screen.getByRole('checkbox');
      fireEvent.click(input);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('点击时调用 onChange 并传入新值（true -> false）', () => {
      const onChange = vi.fn();
      render(<Switch label="Test Switch" checked={true} onChange={onChange} />);
      const input = screen.getByRole('checkbox');
      fireEvent.click(input);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(false);
    });

    it('禁用时点击不调用 onChange', () => {
      const onChange = vi.fn();
      render(<Switch label="Test Switch" checked={false} onChange={onChange} disabled={true} />);
      const input = screen.getByRole('checkbox');
      fireEvent.click(input);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('切换时调用 hapticOnToggle', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} />);
      const input = screen.getByRole('checkbox');
      fireEvent.click(input);
      expect(hapticOnToggle).toHaveBeenCalledTimes(1);
    });

    it('禁用时切换不调用 hapticOnToggle', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} disabled={true} />);
      const input = screen.getByRole('checkbox');
      fireEvent.click(input);
      expect(hapticOnToggle).not.toHaveBeenCalled();
    });
  });

  describe('禁用状态', () => {
    it('disabled 时 input 有 disabled 属性', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} disabled={true} />);
      const input = screen.getByRole('checkbox');
      expect(input).toBeDisabled();
    });

    it('非禁用时 input 没有 disabled 属性', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} disabled={false} />);
      const input = screen.getByRole('checkbox');
      expect(input).not.toBeDisabled();
    });

    it('禁用时有对应的样式类', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} disabled={true} />);
      const label = screen.getByText('Test Switch').closest('label');
      expect(label).toHaveClass('cursor-not-allowed');
      expect(label).toHaveClass('opacity-50');
    });

    it('非禁用时有 pointer 样式类', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} disabled={false} />);
      const label = screen.getByText('Test Switch').closest('label');
      expect(label).toHaveClass('cursor-pointer');
      expect(label).not.toHaveClass('cursor-not-allowed');
      expect(label).not.toHaveClass('opacity-50');
    });
  });

  describe('id 和关联', () => {
    it('label 的 htmlFor 与 input 的 id 匹配', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} />);
      const input = screen.getByRole('checkbox');
      const label = screen.getByText('Test Switch').closest('label');
      expect(label).toHaveAttribute('for', input.id);
    });

    it('id 是基于 label 生成的（空格替换为 -，转小写）', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} />);
      const input = screen.getByRole('checkbox');
      expect(input.id).toBe('switch-test-switch');
    });

    it('单个单词的 label 生成正确的 id', () => {
      render(<Switch label="Toggle" checked={false} onChange={() => {}} />);
      const input = screen.getByRole('checkbox');
      expect(input.id).toBe('switch-toggle');
    });

    it('多个空格的 label 生成正确的 id', () => {
      render(<Switch label="My  Cool   Switch" checked={false} onChange={() => {}} />);
      const input = screen.getByRole('checkbox');
      expect(input.id).toBe('switch-my-cool-switch');
    });

    it('大写字母的 label 转小写', () => {
      render(<Switch label="UPPER CASE" checked={false} onChange={() => {}} />);
      const input = screen.getByRole('checkbox');
      expect(input.id).toBe('switch-upper-case');
    });
  });

  describe('tooltip 属性', () => {
    it('data-tooltip 属性设置正确', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} tooltip="This is a tooltip" />);
      const label = screen.getByText('Test Switch').closest('label');
      expect(label).toHaveAttribute('data-tooltip', 'This is a tooltip');
    });

    it('未提供 tooltip 时没有 data-tooltip 属性', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} />);
      const label = screen.getByText('Test Switch').closest('label');
      expect(label).not.toHaveAttribute('data-tooltip');
    });
  });

  describe('trackClassName', () => {
    it('自定义 trackClassName 被应用', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} trackClassName="custom-track-class" />);
      const trackDiv = screen.getByRole('checkbox').nextElementSibling;
      expect(trackDiv).toHaveClass('custom-track-class');
    });

    it('默认 track 样式类存在', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} />);
      const trackDiv = screen.getByRole('checkbox').nextElementSibling;
      expect(trackDiv).toHaveClass('w-full');
      expect(trackDiv).toHaveClass('h-full');
      expect(trackDiv).toHaveClass('bg-card-active/50');
      expect(trackDiv).toHaveClass('rounded-full');
      expect(trackDiv).toHaveClass('shadow-inner');
    });

    it('自定义 trackClassName 与默认样式类共存', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} trackClassName="custom-class" />);
      const trackDiv = screen.getByRole('checkbox').nextElementSibling;
      expect(trackDiv).toHaveClass('w-full');
      expect(trackDiv).toHaveClass('custom-class');
    });
  });

  describe('className 属性', () => {
    it('自定义 className 被应用到 label', () => {
      render(<Switch label="Test Switch" checked={false} onChange={() => {}} className="custom-label-class" />);
      const label = screen.getByText('Test Switch').closest('label');
      expect(label).toHaveClass('custom-label-class');
    });
  });
});
