import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Input from '../Input';

describe('Input', () => {
  describe('基础渲染', () => {
    it('渲染为 input 元素', () => {
      render(<Input onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input.tagName).toBe('INPUT');
    });

    it('默认 type 为 text', () => {
      render(<Input onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('type', 'text');
    });

    it('id 属性正确设置', () => {
      render(<Input id="test-input" onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('id', 'test-input');
    });
  });

  describe('值和变化', () => {
    it('value 属性正确显示', () => {
      render(<Input value="hello" onChange={() => {}} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('hello');
    });

    it('defaultValue 初始值正确', () => {
      render(<Input defaultValue="default" onChange={() => {}} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('default');
    });

    it('onChange 在输入时被调用', () => {
      const handleChange = vi.fn();
      render(<Input value="" onChange={handleChange} />);
      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: 'new value' } });
      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith(expect.any(Object));
    });

    it('onChange 事件被正确传递', () => {
      const handleChange = vi.fn();
      render(<Input value="" onChange={handleChange} />);
      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: 'test value' } });
      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange.mock.calls[0][0]).toBeInstanceOf(Object);
      expect(handleChange.mock.calls[0][0].type).toBe('change');
    });

    it('使用 userEvent 输入时 onChange 被调用', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Input value="" onChange={handleChange} />);
      const input = screen.getByRole('textbox');

      await user.type(input, 'hello');
      expect(handleChange).toHaveBeenCalled();
    });
  });

  describe('焦点事件', () => {
    it('onFocus 在获得焦点时被调用', () => {
      const handleFocus = vi.fn();
      render(<Input value="" onChange={() => {}} onFocus={handleFocus} />);
      const input = screen.getByRole('textbox');

      fireEvent.focus(input);
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('onBlur 在失焦时被调用', () => {
      const handleBlur = vi.fn();
      render(<Input value="" onChange={() => {}} onBlur={handleBlur} />);
      const input = screen.getByRole('textbox');

      fireEvent.blur(input);
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });

    it('autoFocus 自动获得焦点', () => {
      render(<Input autoFocus onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveFocus();
    });
  });

  describe('键盘事件', () => {
    it('onKeyDown 在按键时被调用', () => {
      const handleKeyDown = vi.fn();
      render(<Input value="" onChange={() => {}} onKeyDown={handleKeyDown} />);
      const input = screen.getByRole('textbox');

      fireEvent.keyDown(input, { key: 'Enter' });
      expect(handleKeyDown).toHaveBeenCalledTimes(1);
      expect(handleKeyDown).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'Enter' }),
      );
    });

    it('onKeyDown 支持不同按键', () => {
      const handleKeyDown = vi.fn();
      render(<Input value="" onChange={() => {}} onKeyDown={handleKeyDown} />);
      const input = screen.getByRole('textbox');

      fireEvent.keyDown(input, { key: 'Escape' });
      expect(handleKeyDown).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'Escape' }),
      );

      fireEvent.keyDown(input, { key: 'Tab' });
      expect(handleKeyDown).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'Tab' }),
      );
    });
  });

  describe('禁用状态', () => {
    it('disabled 时 input 有 disabled 属性', () => {
      render(<Input disabled onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
      expect(input).toHaveAttribute('disabled');
    });

    it('disabled 时 input 不可编辑', () => {
      render(<Input disabled value="initial" onChange={() => {}} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toBeDisabled();
      expect(input.value).toBe('initial');
    });

    it('禁用时有对应的样式类', () => {
      render(<Input disabled onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input.className).toContain('disabled:cursor-not-allowed');
      expect(input.className).toContain('disabled:opacity-50');
    });
  });

  describe('只读状态', () => {
    it('readOnly 时 input 有 readOnly 属性', () => {
      render(<Input readOnly onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('readonly');
    });

    it('readOnly 时 input 不可编辑但可聚焦', () => {
      render(<Input readOnly value="readonly value" onChange={() => {}} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('readonly value');
      expect(input).not.toBeDisabled();
    });
  });

  describe('占位符', () => {
    it('placeholder 属性正确设置', () => {
      render(<Input placeholder="请输入内容" onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('placeholder', '请输入内容');
    });

    it('占位符样式类存在', () => {
      render(<Input placeholder="test" onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input.className).toContain('placeholder:text-text-secondary');
    });
  });

  describe('样式类', () => {
    it('有基础样式类', () => {
      render(<Input onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('flex');
      expect(input).toHaveClass('h-10');
      expect(input).toHaveClass('w-full');
      expect(input).toHaveClass('rounded-md');
      expect(input).toHaveClass('border');
      expect(input).toHaveClass('px-3');
    });

    it('默认背景是 bg-surface', () => {
      render(<Input onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('bg-surface');
    });

    it('bgClassName 可以自定义背景', () => {
      render(<Input bgClassName="bg-red-500" onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('bg-red-500');
      expect(input).not.toHaveClass('bg-surface');
    });

    it('自定义 className 被合并', () => {
      render(<Input className="custom-class" onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('custom-class');
      expect(input).toHaveClass('flex');
    });

    it('焦点样式类存在', () => {
      render(<Input onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input.className).toContain('focus-visible:outline-hidden');
      expect(input.className).toContain('focus-visible:ring-2');
      expect(input.className).toContain('focus-visible:ring-accent');
    });

    it('文字样式类存在', () => {
      render(<Input onChange={() => {}} />);
      const input = screen.getByRole('textbox');
      expect(input.className).toContain('text-sm');
      expect(input.className).toContain('text-text-primary');
      expect(input.className).toContain('border-border-color');
    });
  });

  describe('ref 转发', () => {
    it('forwardRef 正确工作，可以获取到 input 元素', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} onChange={() => {}} />);
      expect(ref.current).not.toBeNull();
      expect(ref.current?.tagName).toBe('INPUT');
    });

    it('ref 可以调用 input 的原生方法', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} onChange={() => {}} />);
      expect(typeof ref.current?.focus).toBe('function');
      expect(typeof ref.current?.blur).toBe('function');
    });
  });

  describe('displayName', () => {
    it('Input.displayName 为 Input', () => {
      expect(Input.displayName).toBe('Input');
    });
  });

  describe('各种 type', () => {
    it('password 类型正确', () => {
      render(<Input type="password" onChange={() => {}} />);
      const input = document.querySelector('input') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.type).toBe('password');
    });

    it('email 类型正确', () => {
      render(<Input type="email" onChange={() => {}} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.type).toBe('email');
    });

    it('number 类型正确', () => {
      render(<Input type="number" onChange={() => {}} />);
      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input.type).toBe('number');
    });

    it('search 类型正确', () => {
      render(<Input type="search" onChange={() => {}} />);
      const input = screen.getByRole('searchbox') as HTMLInputElement;
      expect(input.type).toBe('search');
    });

    it('tel 类型正确', () => {
      render(<Input type="tel" onChange={() => {}} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.type).toBe('tel');
    });

    it('url 类型正确', () => {
      render(<Input type="url" onChange={() => {}} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.type).toBe('url');
    });
  });

  describe('文件输入样式', () => {
    it('file 类型有文件输入样式类', () => {
      render(<Input type="file" onChange={() => {}} />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.className).toContain('file:border-0');
      expect(input.className).toContain('file:bg-transparent');
      expect(input.className).toContain('file:text-sm');
      expect(input.className).toContain('file:font-medium');
    });
  });
});
