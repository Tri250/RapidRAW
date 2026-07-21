import { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-screen w-screen bg-[#1a1a2e] text-white gap-4 p-8">
          <div className="text-6xl">⚠️</div>
          <h1 className="text-2xl font-bold">应用出现了问题</h1>
          <p className="text-gray-400 text-center max-w-md">
            抱歉，发生了意外错误。您可以尝试重新加载，如果问题持续，请联系开发者。
          </p>
          <details className="text-sm text-gray-500 max-w-lg overflow-auto max-h-40">
            <summary className="cursor-pointer hover:text-gray-300">错误详情</summary>
            <pre className="mt-2 whitespace-pre-wrap">{this.state.error?.message}</pre>
            <pre className="mt-1 whitespace-pre-wrap">{this.state.error?.stack}</pre>
          </details>
          <button
            onClick={this.handleReload}
            className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
