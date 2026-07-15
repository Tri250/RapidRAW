import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import ColorWheel from '../ColorWheel';
import { HueSatLum } from '../../../utils/adjustments';

let resizeObserverCallback: ((entries: Array<{ contentRect: { width: number } }>) => void) | null = null;

class MockResizeObserver {
  constructor(callback: any) {
    resizeObserverCallback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@uiw/react-color-wheel', () => ({
  default: vi.fn(({ color, onChange, pointer, width, height }) => {
    const MockPointer = pointer as React.ComponentType<any>;
    return (
      <div
        data-testid="color-wheel"
        style={{ width, height }}
        onClick={() => onChange && onChange({ hsva: { h: 180, s: 50, v: 100, a: 1 } })}
      >
        {MockPointer && <MockPointer style={{ left: '50%', top: '50%' }} />}
      </div>
    );
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, exit, transition, ...restProps } = props;
      return (
        <div data-testid="motion-div" {...restProps}>
          {children}
        </div>
      );
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('lucide-react', () => ({
  Sun: ({ size, className }: any) => (
    <div data-testid="sun-icon" className={className} style={{ width: size, height: size }} />
  ),
}));

vi.mock('../Slider', () => ({
  default: vi.fn(({ label, value, onChange, onDragStateChange, min, max, step, trackClassName }) => (
    <div data-testid={`slider-${trackClassName || 'default'}`}>
      <div data-testid="slider-label">{typeof label === 'string' ? label : 'icon-label'}</div>
      <input
        type="range"
        data-testid={`slider-input-${trackClassName || 'default'}`}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange && onChange(e)}
        onMouseDown={() => onDragStateChange && onDragStateChange(true)}
        onMouseUp={() => onDragStateChange && onDragStateChange(false)}
      />
      <span data-testid="slider-value">{value}</span>
    </div>
  )),
}));

vi.mock('../Text', () => ({
  default: ({ children, variant, color, className, as }: any) => {
    const Component = as || 'span';
    const variantStr = typeof variant === 'string' ? variant : 'default';
    return (
      <Component data-testid={`text-${variantStr}`} className={className} data-color={color || ''}>
        {children}
      </Component>
    );
  },
}));

const triggerResizeObserver = (width: number = 200) => {
  if (resizeObserverCallback) {
    act(() => {
      resizeObserverCallback!([{ contentRect: { width } }]);
    });
  }
};

describe('ColorWheel', () => {
  const defaultProps = {
    defaultValue: { hue: 0, saturation: 0, luminance: 0 } as HueSatLum,
    label: 'Test Color',
    onChange: vi.fn(),
    value: { hue: 0, saturation: 0, luminance: 0 } as HueSatLum,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resizeObserverCallback = null;
    (window as any).ResizeObserver = MockResizeObserver;
  });

  afterEach(() => {
    resizeObserverCallback = null;
  });

  const renderWithResize = (props: any) => {
    const result = render(<ColorWheel {...props} />);
    triggerResizeObserver(200);
    return result;
  };

  describe('基本渲染', () => {
    it('渲染组件而不崩溃', () => {
      renderWithResize(defaultProps);
      expect(screen.getByText('Test Color')).toBeInTheDocument();
    });

    it('渲染色轮组件', () => {
      renderWithResize(defaultProps);
      expect(screen.getByTestId('color-wheel')).toBeInTheDocument();
    });

    it('渲染亮度滑块', () => {
      renderWithResize(defaultProps);
      expect(screen.getByTestId('slider-cg-lum-gradient')).toBeInTheDocument();
    });

    it('默认不渲染色相和饱和度滑块（isExpanded=false）', () => {
      renderWithResize(defaultProps);
      expect(screen.queryByTestId('slider-cg-hue-gradient')).not.toBeInTheDocument();
      expect(screen.queryByTestId('slider-cg-sat-gradient')).not.toBeInTheDocument();
    });

    it('isExpanded=true 时渲染色相和饱和度滑块', () => {
      renderWithResize({ ...defaultProps, isExpanded: true });
      expect(screen.getByTestId('slider-cg-hue-gradient')).toBeInTheDocument();
      expect(screen.getByTestId('slider-cg-sat-gradient')).toBeInTheDocument();
    });

    it('isExpanded=false 时亮度滑块使用图标 label（非文本）', () => {
      renderWithResize({ ...defaultProps, isExpanded: false });
      const lumSliderLabel = screen.getByTestId('slider-cg-lum-gradient').querySelector('[data-testid="slider-label"]');
      expect(lumSliderLabel?.textContent).toBe('icon-label');
    });

    it('isExpanded=true 时亮度滑块使用文本 label', () => {
      renderWithResize({ ...defaultProps, isExpanded: true });
      const lumSliderLabel = screen.getByTestId('slider-cg-lum-gradient').querySelector('[data-testid="slider-label"]');
      expect(lumSliderLabel?.textContent).toBe('ui.colorWheel.luminance');
    });
  });

  describe('显示当前颜色', () => {
    it('默认状态显示 label 文本', () => {
      renderWithResize({ ...defaultProps, value: { hue: 120, saturation: 80, luminance: 50 } });
      expect(screen.getByText('Test Color')).toBeInTheDocument();
    });

    it('鼠标悬停在 label 上时显示 reset 文本', () => {
      renderWithResize(defaultProps);
      const labelContainer = screen.getByText('Test Color').closest('.relative');
      fireEvent.mouseEnter(labelContainer!);
      expect(screen.getByText('ui.colorWheel.reset')).toBeInTheDocument();
    });
  });

  describe('选择颜色（点击色轮）', () => {
    it('点击色轮时调用 onChange', () => {
      const onChange = vi.fn();
      renderWithResize({ ...defaultProps, onChange });

      const wheel = screen.getByTestId('color-wheel');
      fireEvent.click(wheel);

      expect(onChange).toHaveBeenCalled();
    });

    it('点击色轮时返回正确的 hue 和 saturation', () => {
      const onChange = vi.fn();
      renderWithResize({ ...defaultProps, onChange });

      const wheel = screen.getByTestId('color-wheel');
      fireEvent.click(wheel);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          hue: 180,
          saturation: 50,
        }),
      );
    });

    it('点击色轮时保持 luminance 不变', () => {
      const onChange = vi.fn();
      renderWithResize({ ...defaultProps, value: { hue: 0, saturation: 0, luminance: 50 }, onChange });

      const wheel = screen.getByTestId('color-wheel');
      fireEvent.click(wheel);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          luminance: 50,
        }),
      );
    });
  });

  describe('饱和度/亮度调整', () => {
    it('亮度滑块值变化时调用 onChange', () => {
      const onChange = vi.fn();
      renderWithResize({ ...defaultProps, onChange, isExpanded: true });

      const lumInput = screen.getByTestId('slider-input-cg-lum-gradient');
      fireEvent.change(lumInput, { target: { value: '50' } });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          luminance: 50,
        }),
      );
    });

    it('饱和度滑块值变化时调用 onChange', () => {
      const onChange = vi.fn();
      renderWithResize({ ...defaultProps, onChange, isExpanded: true });

      const satInput = screen.getByTestId('slider-input-cg-sat-gradient');
      fireEvent.change(satInput, { target: { value: '75' } });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          saturation: 75,
        }),
      );
    });

    it('亮度滑块范围为 -100 到 100', () => {
      renderWithResize({ ...defaultProps, isExpanded: true });

      const lumInput = screen.getByTestId('slider-input-cg-lum-gradient');
      expect(lumInput).toHaveAttribute('min', '-100');
      expect(lumInput).toHaveAttribute('max', '100');
    });

    it('饱和度滑块范围为 0 到 100', () => {
      renderWithResize({ ...defaultProps, isExpanded: true });

      const satInput = screen.getByTestId('slider-input-cg-sat-gradient');
      expect(satInput).toHaveAttribute('min', '0');
      expect(satInput).toHaveAttribute('max', '100');
    });
  });

  describe('色相调整', () => {
    it('色相滑块值变化时调用 onChange', () => {
      const onChange = vi.fn();
      renderWithResize({ ...defaultProps, onChange, isExpanded: true });

      const hueInput = screen.getByTestId('slider-input-cg-hue-gradient');
      fireEvent.change(hueInput, { target: { value: '200' } });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          hue: 200,
        }),
      );
    });

    it('色相滑块范围为 0 到 360', () => {
      renderWithResize({ ...defaultProps, isExpanded: true });

      const hueInput = screen.getByTestId('slider-input-cg-hue-gradient');
      expect(hueInput).toHaveAttribute('min', '0');
      expect(hueInput).toHaveAttribute('max', '360');
    });

    it('色相滑块步长为 1', () => {
      renderWithResize({ ...defaultProps, isExpanded: true });

      const hueInput = screen.getByTestId('slider-input-cg-hue-gradient');
      expect(hueInput).toHaveAttribute('step', '1');
    });
  });

  describe('onChange 回调', () => {
    it('初始渲染时不调用 onChange', () => {
      const onChange = vi.fn();
      renderWithResize({ ...defaultProps, onChange });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('色轮变化时调用 onChange 并传入 HueSatLum 对象', () => {
      const onChange = vi.fn();
      renderWithResize({ ...defaultProps, onChange });

      const wheel = screen.getByTestId('color-wheel');
      fireEvent.click(wheel);

      expect(onChange).toHaveBeenCalledTimes(1);
      const callArg = onChange.mock.calls[0][0];
      expect(callArg).toHaveProperty('hue');
      expect(callArg).toHaveProperty('saturation');
      expect(callArg).toHaveProperty('luminance');
    });
  });

  describe('重置功能', () => {
    it('点击 label 重置为 defaultValue', () => {
      const onChange = vi.fn();
      const defaultValue = { hue: 30, saturation: 40, luminance: 50 };
      renderWithResize({
        ...defaultProps,
        defaultValue,
        value: { hue: 200, saturation: 80, luminance: -30 },
        onChange,
      });

      const labelContainer = screen.getByText('Test Color').closest('.relative');
      fireEvent.click(labelContainer!);

      expect(onChange).toHaveBeenCalledWith(defaultValue);
    });

    it('双击 label 重置为 defaultValue', () => {
      const onChange = vi.fn();
      const defaultValue = { hue: 30, saturation: 40, luminance: 50 };
      renderWithResize({
        ...defaultProps,
        defaultValue,
        value: { hue: 200, saturation: 80, luminance: -30 },
        onChange,
      });

      const labelContainer = screen.getByText('Test Color').closest('.relative');
      fireEvent.doubleClick(labelContainer!);

      expect(onChange).toHaveBeenCalledWith(defaultValue);
    });
  });

  describe('拖拽状态', () => {
    it('色轮鼠标按下时 onDragStateChange 被调用为 true', () => {
      const onDragStateChange = vi.fn();
      renderWithResize({ ...defaultProps, onDragStateChange });

      const wheelContainer = document.querySelector('.aspect-square')?.firstElementChild;
      fireEvent.mouseDown(wheelContainer!);

      expect(onDragStateChange).toHaveBeenCalledWith(true);
    });

    it('色轮鼠标抬起时 onDragStateChange 被调用为 false', () => {
      const onDragStateChange = vi.fn();
      renderWithResize({ ...defaultProps, onDragStateChange });

      const wheelContainer = document.querySelector('.aspect-square')?.firstElementChild;
      fireEvent.mouseDown(wheelContainer!);
      fireEvent.mouseUp(window);

      expect(onDragStateChange).toHaveBeenLastCalledWith(false);
    });

    it('滑块拖拽时 onDragStateChange 被调用', () => {
      const onDragStateChange = vi.fn();
      renderWithResize({ ...defaultProps, onDragStateChange, isExpanded: true });

      const hueInput = screen.getByTestId('slider-input-cg-hue-gradient');
      fireEvent.mouseDown(hueInput);

      expect(onDragStateChange).toHaveBeenCalledWith(true);
    });

    it('没有提供 onDragStateChange 时不报错', () => {
      expect(() => {
        renderWithResize({ ...defaultProps, onDragStateChange: undefined });
      }).not.toThrow();
    });
  });

  describe('键盘修饰键（色轮交互）', () => {
    it('按住 Ctrl 键时色轮只改变 hue', () => {
      const onChange = vi.fn();
      const initialValue = { hue: 0, saturation: 50, luminance: 0 };
      renderWithResize({ ...defaultProps, value: initialValue, onChange });

      fireEvent.keyDown(window, { ctrlKey: true });

      const wheel = screen.getByTestId('color-wheel');
      fireEvent.click(wheel);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          hue: 180,
          saturation: 50,
        }),
      );
    });

    it('按住 Shift 键时色轮只改变 saturation', () => {
      const onChange = vi.fn();
      const initialValue = { hue: 170, saturation: 0, luminance: 0 };
      renderWithResize({ ...defaultProps, value: initialValue, onChange });

      fireEvent.keyDown(window, { shiftKey: true });

      const wheel = screen.getByTestId('color-wheel');
      fireEvent.click(wheel);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          hue: 170,
          saturation: 50,
        }),
      );
    });

    it('同时按住 Ctrl 和 Shift 键时正常改变 hue 和 saturation', () => {
      const onChange = vi.fn();
      const initialValue = { hue: 0, saturation: 0, luminance: 0 };
      renderWithResize({ ...defaultProps, value: initialValue, onChange });

      fireEvent.keyDown(window, { ctrlKey: true, shiftKey: true });

      const wheel = screen.getByTestId('color-wheel');
      fireEvent.click(wheel);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          hue: 180,
          saturation: 50,
        }),
      );
    });

    it('释放修饰键后恢复正常行为', () => {
      const onChange = vi.fn();
      const initialValue = { hue: 0, saturation: 0, luminance: 0 };
      renderWithResize({ ...defaultProps, value: initialValue, onChange });

      fireEvent.keyDown(window, { ctrlKey: true });
      fireEvent.keyUp(window, { ctrlKey: false });

      const wheel = screen.getByTestId('color-wheel');
      fireEvent.click(wheel);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          hue: 180,
          saturation: 50,
        }),
      );
    });
  });

  describe('isExpanded 展开状态', () => {
    it('isExpanded=false 时只显示亮度滑块', () => {
      renderWithResize({ ...defaultProps, isExpanded: false });

      expect(screen.getByTestId('slider-cg-lum-gradient')).toBeInTheDocument();
      expect(screen.queryByTestId('slider-cg-hue-gradient')).not.toBeInTheDocument();
      expect(screen.queryByTestId('slider-cg-sat-gradient')).not.toBeInTheDocument();
    });

    it('isExpanded=true 时显示所有三个滑块', () => {
      renderWithResize({ ...defaultProps, isExpanded: true });

      expect(screen.getByTestId('slider-cg-hue-gradient')).toBeInTheDocument();
      expect(screen.getByTestId('slider-cg-sat-gradient')).toBeInTheDocument();
      expect(screen.getByTestId('slider-cg-lum-gradient')).toBeInTheDocument();
    });
  });

  describe('value 和 defaultValue', () => {
    it('value 覆盖 defaultValue', () => {
      const onChange = vi.fn();
      renderWithResize({
        ...defaultProps,
        defaultValue: { hue: 0, saturation: 0, luminance: 0 },
        value: { hue: 150, saturation: 75, luminance: 25 },
        onChange,
        isExpanded: true,
      });

      const hueInput = screen.getByTestId('slider-input-cg-hue-gradient');
      expect(hueInput).toHaveAttribute('value', '150');
    });

    it('defaultValue 作为重置目标', () => {
      const onChange = vi.fn();
      const defaultValue = { hue: 45, saturation: 60, luminance: 20 };
      renderWithResize({
        ...defaultProps,
        defaultValue,
        value: { hue: 200, saturation: 80, luminance: -30 },
        onChange,
      });

      const labelContainer = screen.getByText('Test Color').closest('.relative');
      fireEvent.click(labelContainer!);

      expect(onChange).toHaveBeenCalledWith(defaultValue);
    });
  });

  describe('容器结构', () => {
    it('最外层容器有 relative flex flex-col items-center gap-2 类', () => {
      const { container } = renderWithResize(defaultProps);
      const outerDiv = container.firstChild;
      expect(outerDiv).toHaveClass('relative');
      expect(outerDiv).toHaveClass('flex');
      expect(outerDiv).toHaveClass('flex-col');
      expect(outerDiv).toHaveClass('items-center');
    });

    it('色轮容器有 aspect-square 类', () => {
      renderWithResize(defaultProps);
      const sizerDiv = document.querySelector('.aspect-square');
      expect(sizerDiv).toBeInTheDocument();
    });
  });

  describe('CSS 变量', () => {
    it('设置 hue 和 saturation CSS 变量', () => {
      renderWithResize({ ...defaultProps, value: { hue: 120, saturation: 75, luminance: 50 } });

      const rootStyle = document.documentElement.style;
      const cssText = rootStyle.cssText;
      expect(cssText).toContain('--cg-hue-');
      expect(cssText).toContain('--cg-sat-');
    });
  });

  describe('触摸事件', () => {
    it('触摸开始色轮时设置拖拽状态', () => {
      const onDragStateChange = vi.fn();
      renderWithResize({ ...defaultProps, onDragStateChange });

      const wheelContainer = document.querySelector('.aspect-square')?.firstElementChild;
      fireEvent.touchStart(wheelContainer!);

      expect(onDragStateChange).toHaveBeenCalledWith(true);
    });

    it('触摸结束时清除拖拽状态', () => {
      const onDragStateChange = vi.fn();
      renderWithResize({ ...defaultProps, onDragStateChange });

      const wheelContainer = document.querySelector('.aspect-square')?.firstElementChild;
      fireEvent.touchStart(wheelContainer!);
      fireEvent.touchEnd(window);

      expect(onDragStateChange).toHaveBeenLastCalledWith(false);
    });
  });
});
