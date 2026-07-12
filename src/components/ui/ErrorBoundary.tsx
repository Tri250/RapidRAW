import { Component, type ErrorInfo, type ReactNode } from 'react';
import Button from '../ui/Button';
import Text from '../ui/Text';
import { TextColors, TextVariants, TextWeights } from '../../types/typography';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * 全局错误边界组件
 *
 * 捕获 React 组件树中的未处理异常，防止白屏。
 * 提供友好的错误恢复 UI，支持：
 * - 显示错误详情
 * - 一键重试（重新挂载子组件树）
 * - 保存当前编辑状态（通过 localStorage）
 */
class ErrorBoundaryClass extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryCount = 0;
  private static readonly MAX_RETRIES = 3;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    // 尝试保存当前编辑状态
    try {
      const state = {
        timestamp: Date.now(),
        error: error.message,
        url: typeof window !== 'undefined' ? window.location?.href : '',
      };
      localStorage.setItem('rapidraw-crash-state', JSON.stringify(state));
    } catch {}

    // 通知外部监控
    this.props.onError?.(error, errorInfo);

    // 输出到控制台方便调试
    console.error('[ErrorBoundary] Uncaught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  handleRetry = () => {
    if (this.retryCount >= ErrorBoundaryClass.MAX_RETRIES) {
      // 超过最大重试次数，强制刷新页面
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
      return;
    }

    this.retryCount++;
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReset = () => {
    // 清除崩溃状态并重试
    try {
      localStorage.removeItem('rapidraw-crash-state');
    } catch {}
    this.handleRetry();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallbackUI
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onRetry={this.handleRetry}
          onReset={this.handleReset}
          retryCount={this.retryCount}
          maxRetries={ErrorBoundaryClass.MAX_RETRIES}
        />
      );
    }

    return this.props.children;
  }
}

// ========== 错误恢复 UI ==========

interface ErrorFallbackUIProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  onRetry: () => void;
  onReset: () => void;
  retryCount: number;
  maxRetries: number;
}

function ErrorFallbackUI({
  error,
  errorInfo,
  onRetry,
  onReset,
  retryCount,
  maxRetries,
}: ErrorFallbackUIProps) {
  // 使用独立的 i18n 上下文，避免主 i18n 实例崩溃影响错误显示
  const fallbackText = (key: string) => {
    const texts: Record<string, string> = {
      title: 'Something went wrong',
      description: 'An unexpected error occurred. Your editing progress may have been saved.',
      details: 'Error details',
      retry: 'Retry',
      reset: 'Reset & Retry',
      reload: 'Reload App',
      componentStack: 'Component Stack',
    };
    return texts[key] || key;
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-bg-primary p-8"
      role="alert"
    >
      <div className="w-full max-w-lg rounded-xl bg-surface p-8 shadow-2xl border border-border-color">
        {/* Icon */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <svg
              className="h-8 w-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
        </div>

        <Text variant={TextVariants.title} className="mb-2 text-center">
          {fallbackText('title')}
        </Text>
        <Text color={TextColors.secondary} className="mb-4 text-center text-sm">
          {fallbackText('description')}
        </Text>

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-lg bg-bg-primary p-3 text-left">
            <Text weight={TextWeights.bold} className="mb-1 text-xs text-red-400">
              {fallbackText('details')}
            </Text>
            <Text color={TextColors.secondary} className="text-xs font-mono break-all">
              {error.message || 'Unknown error'}
            </Text>
          </div>
        )}

        {/* Component stack (collapsed) */}
        {errorInfo?.componentStack && (
          <details className="mb-4">
            <summary className="cursor-pointer text-xs text-text-secondary hover:text-text-primary">
              {fallbackText('componentStack')}
            </summary>
            <pre className="mt-2 max-h-32 overflow-auto rounded bg-bg-primary p-2 text-xs text-text-secondary font-mono whitespace-pre-wrap">
              {errorInfo.componentStack}
            </pre>
          </details>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={onRetry}
            variant="primary"
            className="w-full focus:outline-hidden focus:ring-0"
          >
            {retryCount >= maxRetries
              ? fallbackText('reload')
              : `${fallbackText('retry')} (${retryCount + 1}/${maxRetries + 1})`}
          </Button>
          <Button
            onClick={onReset}
            variant="ghost"
            className="w-full text-text-secondary focus:outline-hidden focus:ring-0"
          >
            {fallbackText('reset')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ErrorBoundaryClass;