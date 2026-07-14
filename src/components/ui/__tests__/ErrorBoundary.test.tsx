import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { type ErrorInfo, type ReactNode } from 'react';
import ErrorBoundary from '../ErrorBoundary';

vi.mock('../../../utils/hapticFeedback', () => ({
  hapticOnButtonPress: vi.fn(),
}));

const originalLocation = window.location;
const originalConsoleError = console.error;
const originalLocalStorage = window.localStorage;

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let localStorageMock: Storage;
  let reloadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let store: Record<string, string> = {};
    localStorageMock = {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
      key: vi.fn((index: number) => Object.keys(store)[index] || null),
      length: 0,
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        reload: reloadMock,
      },
      writable: true,
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    });
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  const ThrowError = ({ message = 'Test error' }: { message?: string }) => {
    throw new Error(message);
  };

  const NormalChild = () => <div>Normal Child Content</div>;

  describe('正常情况', () => {
    it('没有错误时渲染 children', () => {
      render(
        <ErrorBoundary>
          <NormalChild />
        </ErrorBoundary>
      );
      expect(screen.getByText('Normal Child Content')).toBeInTheDocument();
    });

    it('children 正常显示', () => {
      render(
        <ErrorBoundary>
          <div data-testid="child">Child Component</div>
        </ErrorBoundary>
      );
      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });
  });

  describe('错误捕获', () => {
    it('子组件抛出错误时显示错误 UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('调用 onError 回调', () => {
      const onError = vi.fn();
      render(
        <ErrorBoundary onError={onError}>
          <ThrowError />
        </ErrorBoundary>
      );
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String),
        })
      );
    });

    it('保存崩溃状态到 localStorage', () => {
      render(
        <ErrorBoundary>
          <ThrowError message="LocalStorage test error" />
        </ErrorBoundary>
      );
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'rapidraw-crash-state',
        expect.stringContaining('LocalStorage test error')
      );

      const savedState = JSON.parse(
        localStorageMock.setItem.mock.calls.find(
          (call: [string, string]) => call[0] === 'rapidraw-crash-state'
        )[1]
      );
      expect(savedState).toHaveProperty('timestamp');
      expect(savedState).toHaveProperty('error', 'LocalStorage test error');
      expect(savedState).toHaveProperty('url');
    });

    it('打印 console.error', () => {
      render(
        <ErrorBoundary>
          <ThrowError message="Console error test" />
        </ErrorBoundary>
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ErrorBoundary] Uncaught error:',
        expect.any(Error)
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ErrorBoundary] Component stack:',
        expect.any(String)
      );
    });

    it('localStorage 保存失败时不崩溃', () => {
      const setItemSpy = vi.spyOn(localStorageMock, 'setItem').mockImplementation(() => {
        throw new Error('localStorage full');
      });

      expect(() => {
        render(
          <ErrorBoundary>
            <ThrowError />
          </ErrorBoundary>
        );
      }).not.toThrow();

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      setItemSpy.mockRestore();
    });
  });

  describe('重试功能', () => {
    it('点击重试按钮重置错误状态', () => {
      let throwError = true;
      const ConditionalThrow = () => {
        if (throwError) {
          throw new Error('Retry test error');
        }
        return <div>Recovered Content</div>;
      };

      const { rerender } = render(
        <ErrorBoundary>
          <ConditionalThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      throwError = false;
      fireEvent.click(screen.getByText(/^Retry \(/));

      rerender(
        <ErrorBoundary>
          <ConditionalThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText('Recovered Content')).toBeInTheDocument();
    });

    it('重试次数计数', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Retry \(1\/4\)/)).toBeInTheDocument();

      fireEvent.click(screen.getByText(/^Retry \(/));
      expect(screen.getByText(/Retry \(2\/4\)/)).toBeInTheDocument();

      fireEvent.click(screen.getByText(/^Retry \(/));
      expect(screen.getByText(/Retry \(3\/4\)/)).toBeInTheDocument();

      fireEvent.click(screen.getByText(/^Retry \(/));
      expect(screen.getByText('Reload App')).toBeInTheDocument();
    });

    it('超过最大重试次数（3次）后点击会刷新页面', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText(/^Retry \(/));
      fireEvent.click(screen.getByText(/^Retry \(/));
      fireEvent.click(screen.getByText(/^Retry \(/));

      expect(reloadMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('Reload App'));

      expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('最大重试次数为 3', () => {
      expect((ErrorBoundary as any).MAX_RETRIES).toBe(3);
    });
  });

  describe('重置功能', () => {
    it('点击重置按钮清除 localStorage 并重试', () => {
      let throwError = true;
      const ConditionalThrow = () => {
        if (throwError) {
          throw new Error('Reset test error');
        }
        return <div>Reset Recovered</div>;
      };

      const { rerender } = render(
        <ErrorBoundary>
          <ConditionalThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      throwError = false;
      fireEvent.click(screen.getByText('Reset & Retry'));

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('rapidraw-crash-state');

      rerender(
        <ErrorBoundary>
          <ConditionalThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText('Reset Recovered')).toBeInTheDocument();
    });

    it('localStorage 清除失败也能重试', () => {
      let throwError = true;
      const ConditionalThrow = () => {
        if (throwError) {
          throw new Error('Reset failure test');
        }
        return <div>Reset Failure Recovered</div>;
      };

      const removeItemSpy = vi.spyOn(localStorageMock, 'removeItem').mockImplementation(() => {
        throw new Error('localStorage access denied');
      });

      const { rerender } = render(
        <ErrorBoundary>
          <ConditionalThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      throwError = false;

      expect(() => {
        fireEvent.click(screen.getByText('Reset & Retry'));
      }).not.toThrow();

      rerender(
        <ErrorBoundary>
          <ConditionalThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText('Reset Failure Recovered')).toBeInTheDocument();

      removeItemSpy.mockRestore();
    });
  });

  describe('自定义 fallback', () => {
    it('提供 fallback 时显示自定义 fallback', () => {
      const CustomFallback = () => <div data-testid="custom-fallback">Custom Error Fallback</div>;

      render(
        <ErrorBoundary fallback={<CustomFallback />}>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
      expect(screen.getByText('Custom Error Fallback')).toBeInTheDocument();
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });

    it('不提供 fallback 时显示默认错误 UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('getDerivedStateFromError', () => {
    it('设置 hasError 和 error', () => {
      const testError = new Error('Derived state test error');
      const result = (ErrorBoundary as any).getDerivedStateFromError(testError);

      expect(result).toEqual({
        hasError: true,
        error: testError,
      });
    });
  });

  describe('componentDidCatch', () => {
    it('保存 errorInfo', () => {
      const errorInfo: ErrorInfo = {
        componentStack: 'in TestComponent\nin ErrorBoundary',
      };

      let instance: any;
      class TestWrapper extends ErrorBoundary {
        constructor(props: { children: ReactNode }) {
          super(props);
          instance = this;
        }
      }

      const error = new Error('componentDidCatch test error');

      act(() => {
        render(
          <TestWrapper>
            <ThrowError />
          </TestWrapper>
        );
      });

      expect(instance.state.errorInfo).toBeTruthy();
      expect(instance.state.errorInfo.componentStack).toContain('ThrowError');
    });

    it('保存到 localStorage', () => {
      render(
        <ErrorBoundary>
          <ThrowError message="componentDidCatch localStorage test" />
        </ErrorBoundary>
      );

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'rapidraw-crash-state',
        expect.stringContaining('componentDidCatch localStorage test')
      );
    });

    it('调用 onError', () => {
      const onError = vi.fn();
      render(
        <ErrorBoundary onError={onError}>
          <ThrowError message="onError test" />
        </ErrorBoundary>
      );

      expect(onError).toHaveBeenCalledTimes(1);
      const [errorArg, errorInfoArg] = onError.mock.calls[0];
      expect(errorArg.message).toBe('onError test');
      expect(errorInfoArg).toHaveProperty('componentStack');
    });

    it('打印控制台错误', () => {
      render(
        <ErrorBoundary>
          <ThrowError message="console error in didCatch" />
        </ErrorBoundary>
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ErrorBoundary] Uncaught error:',
        expect.any(Error)
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ErrorBoundary] Component stack:',
        expect.any(String)
      );
    });
  });

  describe('错误信息显示', () => {
    it('显示错误详情', () => {
      render(
        <ErrorBoundary>
          <ThrowError message="Detailed error message" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Error details')).toBeInTheDocument();
      expect(screen.getByText('Detailed error message')).toBeInTheDocument();
    });

    it('显示组件堆栈信息', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component Stack')).toBeInTheDocument();
    });
  });
});
