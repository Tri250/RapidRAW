import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri APIs
(globalThis as any).__TAURI_INTERNALS__ = {};

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock('@tauri-apps/api/os', () => ({
  platform: vi.fn(() => Promise.resolve('android')),
  type: vi.fn(() => Promise.resolve('Linux')),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    onCloseRequested: vi.fn(() => Promise.resolve(() => {})),
  })),
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as any).ResizeObserver = ResizeObserverMock;

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as any).IntersectionObserver = IntersectionObserverMock;
