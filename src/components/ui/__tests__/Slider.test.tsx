import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Slider from '../Slider';

vi.mock('../../../utils/hapticFeedback', () => ({
  hapticOnSliderChange: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { hapticOnSliderChange } from '../../../utils/hapticFeedback';

describe('Slider', () => {
  const defaultProps = {
    label: 'Test Slider',
    min: 0,
    max: 100,
    step: 1,
    value: 50,
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本渲染', () => {
    it('渲染 label 文本', () => {
      render(<Slider {...defaultProps} />);
      expect(screen.getByText('Test Slider')).toBeInTheDocument();
    });

    it('渲染为 range input', () => {
      render(<Slider {...defaultProps} />);
      const input = screen.getByRole('slider');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'range');
    });

    it('显示当前值', () => {
      render(<Slider {...defaultProps} value={50} />);
      expect(screen.getByText('50')).toBeInTheDocument();
    });
  });

  describe('value 和 defaultValue', () => {
    it('value 属性正确反映在 input 上', () => {
      render(<Slider {...defaultProps} value={30} />);
      const input = screen.getByRole('slider');
      expect(input).toHaveAttribute('value', '30');
    });

    it('value 为 0 时正确显示', () => {
      render(<Slider {...defaultProps} value={0} />);
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('defaultValue 默认为 0', () => {
      render(<Slider {...defaultProps} value={50} />);
      const input = screen.getByRole('slider');
      expect(input).toBeInTheDocument();
    });
  });

  describe('onChange 回调', () => {
    it('input 值改变时调用 onChange', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} onChange={onChange} />);
      const input = screen.getByRole('slider');
      fireEvent.change(input, { target: { value: '75' } });
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('onChange 事件包含正确的 value', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} onChange={onChange} />);
      const input = screen.getByRole('slider');
      fireEvent.change(input, { target: { value: '75' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: '75' }),
        }),
      );
    });

    it('值改变时调用 hapticOnSliderChange', () => {
      render(<Slider {...defaultProps} />);
      const input = screen.getByRole('slider');
      fireEvent.change(input, { target: { value: '75' } });
      expect(hapticOnSliderChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('onDragStateChange 回调', () => {
    it('鼠标按下时调用 onDragStateChange(true)', () => {
      const onDragStateChange = vi.fn();
      render(<Slider {...defaultProps} onDragStateChange={onDragStateChange} />);
      const input = screen.getByRole('slider');

      fireEvent.mouseDown(input, { clientX: 50 });
      expect(onDragStateChange).toHaveBeenCalledWith(true);
    });
  });

  describe('min/max 范围', () => {
    it('input 具有正确的 min 属性', () => {
      render(<Slider {...defaultProps} min={10} max={90} />);
      const input = screen.getByRole('slider');
      expect(input).toHaveAttribute('min', '10');
    });

    it('input 具有正确的 max 属性', () => {
      render(<Slider {...defaultProps} min={10} max={90} />);
      const input = screen.getByRole('slider');
      expect(input).toHaveAttribute('max', '90');
    });
  });

  describe('step 步长', () => {
    it('input 具有正确的 step 属性（整数步长）', () => {
      render(<Slider {...defaultProps} step={5} />);
      const input = screen.getByRole('slider');
      expect(input).toHaveAttribute('step', '5');
    });

    it('input 具有正确的 step 属性（小数步长）', () => {
      render(<Slider {...defaultProps} step={0.5} />);
      const input = screen.getByRole('slider');
      expect(input).toHaveAttribute('step', '0.5');
    });

    it('小数步长时显示对应小数位数的值', () => {
      render(<Slider {...defaultProps} step={0.1} value={50.5} />);
      expect(screen.getByText('50.5')).toBeInTheDocument();
    });

    it('步长为 0.01 时显示两位小数', () => {
      render(<Slider {...defaultProps} step={0.01} value={25.5} />);
      expect(screen.getByText('25.50')).toBeInTheDocument();
    });
  });

  describe('disabled 状态', () => {
    it('disabled prop 被接受且不报错', () => {
      expect(() => {
        render(<Slider {...defaultProps} disabled={true} />);
      }).not.toThrow();
    });

    it('disabled 为 false 时正常渲染', () => {
      render(<Slider {...defaultProps} disabled={false} />);
      const input = screen.getByRole('slider');
      expect(input).toBeInTheDocument();
    });
  });

  describe('trackClassName', () => {
    it('自定义 trackClassName 被应用', () => {
      render(<Slider {...defaultProps} trackClassName="custom-track-class" />);
      const container = screen.getByRole('slider').closest('.relative');
      const trackDiv = container?.firstElementChild;
      expect(trackDiv).toHaveClass('custom-track-class');
    });

    it('默认 track 样式类存在', () => {
      render(<Slider {...defaultProps} />);
      const container = screen.getByRole('slider').closest('.relative');
      const trackDiv = container?.firstElementChild;
      expect(trackDiv).toHaveClass('bg-card-active');
    });
  });

  describe('label 标签', () => {
    it('字符串 label 被渲染', () => {
      render(<Slider {...defaultProps} label="Brightness" />);
      expect(screen.getByText('Brightness')).toBeInTheDocument();
    });

    it('非字符串 label 被渲染', () => {
      render(<Slider {...defaultProps} label={<span data-testid="custom-label">Custom Label</span>} />);
      expect(screen.getByTestId('custom-label')).toBeInTheDocument();
    });

    it('字符串 label 点击时重置为 defaultValue', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} label="Test" defaultValue={25} value={75} onChange={onChange} />);
      const label = screen.getByText('Test');
      fireEvent.click(label);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: 25 }),
        }),
      );
    });

    it('字符串 label 双击时重置为 defaultValue', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} label="Test" defaultValue={25} value={75} onChange={onChange} />);
      const label = screen.getByText('Test');
      fireEvent.doubleClick(label);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: 25 }),
        }),
      );
    });

    it('鼠标悬停在字符串 label 上显示 reset 文本', () => {
      render(<Slider {...defaultProps} label="Test" />);
      const labelContainer = screen.getByText('Test').closest('.grid');
      fireEvent.mouseEnter(labelContainer!);
      expect(screen.getByText('ui.slider.reset')).toBeInTheDocument();
    });
  });

  describe('值显示', () => {
    it('显示当前数值', () => {
      render(<Slider {...defaultProps} value={42} />);
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('suffix 后缀正确显示', () => {
      render(<Slider {...defaultProps} value={50} suffix="%" />);
      expect(screen.getByText('%')).toBeInTheDocument();
    });

    it('点击值进入编辑模式', () => {
      render(<Slider {...defaultProps} value={50} />);
      const valueSpan = screen.getByText('50');
      fireEvent.click(valueSpan);
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveFocus();
    });

    it('双击值重置为 defaultValue', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} value={75} defaultValue={25} onChange={onChange} />);
      const valueSpan = screen.getByText('75');
      fireEvent.doubleClick(valueSpan);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: 25 }),
        }),
      );
    });

    it('值具有 data-tooltip 属性', () => {
      render(<Slider {...defaultProps} value={50} />);
      const valueSpan = screen.getByText('50');
      expect(valueSpan).toHaveAttribute('data-tooltip', 'ui.slider.clickToEdit');
    });
  });

  describe('值编辑模式', () => {
    it('进入编辑模式时 input 显示当前值', () => {
      render(<Slider {...defaultProps} value={50} />);
      fireEvent.click(screen.getByText('50'));
      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('50');
    });

    it('编辑 input 值时调用 onChange', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} value={50} onChange={onChange} />);
      fireEvent.click(screen.getByText('50'));
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '75' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: 75 }),
        }),
      );
    });

    it('失焦时提交值', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} value={50} onChange={onChange} />);
      fireEvent.click(screen.getByText('50'));
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '80' } });
      fireEvent.blur(input);
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: 80 }),
        }),
      );
    });

    it('按 Enter 键提交值', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} value={50} onChange={onChange} />);
      fireEvent.click(screen.getByText('50'));
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '80' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: 80 }),
        }),
      );
    });

    it('按 Escape 键取消编辑并恢复原值', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} value={50} onChange={onChange} />);
      fireEvent.click(screen.getByText('50'));
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '80' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('ArrowUp 键增加值', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} value={50} step={1} onChange={onChange} />);
      fireEvent.click(screen.getByText('50'));
      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: 51 }),
        }),
      );
    });

    it('ArrowDown 键减少值', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} value={50} step={1} onChange={onChange} />);
      fireEvent.click(screen.getByText('50'));
      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: 49 }),
        }),
      );
    });

    it('输入无效字符被拒绝', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} value={50} onChange={onChange} />);
      fireEvent.click(screen.getByText('50'));
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'abc' } });
      expect(input).toHaveValue('50');
    });

    it('输入超出范围的值被截断到 max', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} value={50} min={0} max={100} onChange={onChange} />);
      fireEvent.click(screen.getByText('50'));
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '200' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: 100 }),
        }),
      );
    });

    it('输入低于范围的值被截断到 min', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} value={50} min={0} max={100} onChange={onChange} />);
      fireEvent.click(screen.getByText('50'));
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '-50' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: 0 }),
        }),
      );
    });

    it('支持逗号作为小数点', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} step={0.5} value={50} onChange={onChange} />);
      fireEvent.click(screen.getByText('50.0'));
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '50,5' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: 50.5 }),
        }),
      );
    });
  });

  describe('fillOrigin', () => {
    it('fillOrigin 为 default 时从 defaultValue 开始填充', () => {
      render(<Slider {...defaultProps} fillOrigin="default" defaultValue={50} value={75} />);
      const input = screen.getByRole('slider');
      expect(input).toBeInTheDocument();
    });

    it('fillOrigin 为 min 时从最小值开始填充', () => {
      render(<Slider {...defaultProps} fillOrigin="min" value={75} />);
      const input = screen.getByRole('slider');
      expect(input).toBeInTheDocument();
    });
  });

  describe('双击滑块重置', () => {
    it('双击滑块重置为 defaultValue', () => {
      const onChange = vi.fn();
      render(<Slider {...defaultProps} value={75} defaultValue={25} onChange={onChange} />);
      const input = screen.getByRole('slider');
      fireEvent.doubleClick(input);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: 25 }),
        }),
      );
    });
  });

  describe('键盘操作（range input）', () => {
    it('按全局键时失焦', () => {
      render(<Slider {...defaultProps} value={50} />);
      const input = screen.getByRole('slider');
      input.focus();
      fireEvent.keyDown(input, { key: ' ' });
      expect(input).not.toHaveFocus();
    });

    it('按 ArrowUp 键时失焦（全局键）', () => {
      render(<Slider {...defaultProps} value={50} />);
      const input = screen.getByRole('slider');
      input.focus();
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(input).not.toHaveFocus();
    });
  });

  describe('鼠标拖拽交互', () => {
    it('mouseDown 时设置 isDragging 状态并调用 onChange', () => {
      const onChange = vi.fn();
      const onDragStateChange = vi.fn();
      render(<Slider {...defaultProps} value={50} onChange={onChange} onDragStateChange={onDragStateChange} />);
      const input = screen.getByRole('slider');
      fireEvent.mouseDown(input, { clientX: 100 });
      expect(onDragStateChange).toHaveBeenCalledWith(true);
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('触摸交互', () => {
    it('touchStart 事件不报错', () => {
      render(<Slider {...defaultProps} value={50} />);
      const input = screen.getByRole('slider');
      expect(() => {
        fireEvent.touchStart(input, {
          touches: [{ clientX: 50, clientY: 50 }],
        });
      }).not.toThrow();
    });

    it('没有 touch 时 touchStart 直接返回', () => {
      render(<Slider {...defaultProps} value={50} />);
      const input = screen.getByRole('slider');
      expect(() => {
        fireEvent.touchStart(input, {
          touches: [],
        });
      }).not.toThrow();
    });

    it('touchEnd 事件不报错', () => {
      render(<Slider {...defaultProps} value={50} />);
      const input = screen.getByRole('slider');
      fireEvent.touchStart(input, {
        touches: [{ clientX: 50, clientY: 50 }],
      });
      expect(() => {
        fireEvent.touchEnd(input);
      }).not.toThrow();
    });

    it('touchCancel 事件不报错', () => {
      render(<Slider {...defaultProps} value={50} />);
      const input = screen.getByRole('slider');
      fireEvent.touchStart(input, {
        touches: [{ clientX: 50, clientY: 50 }],
      });
      expect(() => {
        fireEvent.touchCancel(input);
      }).not.toThrow();
    });
  });

  describe('容器结构', () => {
    it('最外层容器有 mb-2 group 类', () => {
      const { container } = render(<Slider {...defaultProps} />);
      const outerDiv = container.firstChild;
      expect(outerDiv).toHaveClass('mb-2');
      expect(outerDiv).toHaveClass('group');
    });

    it('滑块容器有 relative w-full h-5 类', () => {
      render(<Slider {...defaultProps} />);
      const input = screen.getByRole('slider');
      const sliderContainer = input.parentElement;
      expect(sliderContainer).toHaveClass('relative');
      expect(sliderContainer).toHaveClass('w-full');
      expect(sliderContainer).toHaveClass('h-5');
    });

    it('slider input 有 slider-input 类', () => {
      render(<Slider {...defaultProps} />);
      const input = screen.getByRole('slider');
      expect(input).toHaveClass('slider-input');
    });

    it('slider input 有 z-10 类', () => {
      render(<Slider {...defaultProps} />);
      const input = screen.getByRole('slider');
      expect(input).toHaveClass('z-10');
    });
  });

  describe('标签行布局', () => {
    it('标签和值在同一行，两端对齐', () => {
      render(<Slider {...defaultProps} label="Test" value={50} />);
      const label = screen.getByText('Test');
      const rowDiv = label.closest('div')?.parentElement;
      expect(rowDiv).toHaveClass('flex');
      expect(rowDiv).toHaveClass('justify-between');
      expect(rowDiv).toHaveClass('items-center');
    });

    it('值显示区域宽度为 w-12', () => {
      render(<Slider {...defaultProps} value={50} />);
      const valueSpan = screen.getByText('50');
      const valueContainer = valueSpan.parentElement;
      expect(valueContainer).toHaveClass('w-12');
      expect(valueContainer).toHaveClass('text-right');
    });
  });
});
