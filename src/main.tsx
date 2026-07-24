import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installFrontendLogBridge } from './utils/frontendLogBridge';
import './styles.css';

installFrontendLogBridge();

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[AppErrorBoundary] Uncaught error:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleRestart = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            width: '100vw',
            background: '#1a1a2e',
            color: '#e0e0e0',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem', fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#a0a0b0', maxWidth: '400px', marginBottom: '1.5rem' }}>
            An unexpected error occurred in the application. Your edits are preserved in sidecar files and will not be lost.
          </p>
          {this.state.error && (
            <pre
              style={{
                fontSize: '0.75rem',
                color: '#ff6b6b',
                background: '#16213e',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                maxWidth: '500px',
                overflow: 'auto',
                marginBottom: '1.5rem',
                textAlign: 'left',
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '6px',
                border: 'none',
                background: '#0f3460',
                color: '#e0e0e0',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Try Recover
            </button>
            <button
              onClick={this.handleRestart}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '6px',
                border: '1px solid #0f3460',
                background: 'transparent',
                color: '#a0a0b0',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Restart App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
