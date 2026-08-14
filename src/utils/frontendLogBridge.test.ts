import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { Invokes } from '../components/ui/AppProperties';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

describe('frontendLogBridge', () => {
  beforeAll(async () => {
    invokeMock.mockResolvedValue(undefined);
    const { installFrontendLogBridge } = await import('./frontendLogBridge');
    installFrontendLogBridge();
  });

  beforeEach(() => {
    invokeMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards console.log to the backend as info level', () => {
    console.log('hello bridge');
    expect(invokeMock).toHaveBeenCalledWith(Invokes.FrontendLog, {
      level: 'info',
      message: 'hello bridge',
    });
  });

  it('maps console.error to error level', () => {
    console.error('boom');
    expect(invokeMock).toHaveBeenCalledWith(Invokes.FrontendLog, {
      level: 'error',
      message: 'boom',
    });
  });

  it('maps console.warn and console.debug to their levels', () => {
    console.warn('careful');
    expect(invokeMock).toHaveBeenCalledWith(Invokes.FrontendLog, { level: 'warn', message: 'careful' });

    invokeMock.mockClear();
    console.debug('trace');
    expect(invokeMock).toHaveBeenCalledWith(Invokes.FrontendLog, { level: 'debug', message: 'trace' });
  });

  it('joins multiple arguments into a single message', () => {
    console.info('value =', 42, 'and', true);
    expect(invokeMock).toHaveBeenCalledWith(Invokes.FrontendLog, {
      level: 'info',
      message: 'value = 42 and true',
    });
  });

  it('serializes plain objects into JSON', () => {
    console.info({ a: 1, b: { c: 2 } });
    expect(invokeMock).toHaveBeenCalledWith(Invokes.FrontendLog, {
      level: 'info',
      message: '{"a":1,"b":{"c":2}}',
    });
  });

  it('serializes Error instances with name, message and stack', () => {
    const err = new Error('kaboom');
    console.error(err);
    const payload = invokeMock.mock.calls[0][1] as { level: string; message: string };
    expect(payload.level).toBe('error');
    expect(payload.message).toContain('"name":"Error"');
    expect(payload.message).toContain('"message":"kaboom"');
    expect(payload.message).toContain('"stack"');
  });

  it('marks circular references instead of recursing forever', () => {
    const a: Record<string, unknown> = { name: 'node' };
    a.self = a;
    console.info(a);
    expect(invokeMock).toHaveBeenCalledWith(Invokes.FrontendLog, {
      level: 'info',
      message: '{"name":"node","self":"[Circular]"}',
    });
  });

  it('truncates messages longer than the limit', () => {
    const long = 'x'.repeat(13000);
    console.info(long);
    const payload = invokeMock.mock.calls[0][1] as { level: string; message: string };
    expect(payload.message.length).toBeLessThan(13000);
    expect(payload.message).toContain('[truncated]');
  });

  it('drops the vite failed-to-reload noise message', () => {
    console.info('[vite] failed to reload some file', 'see errors above');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('deduplicates identical messages within the window', () => {
    console.info('dedupe-same-message');
    console.info('dedupe-same-message');
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('stops deduplicating after the window expires', () => {
    vi.useFakeTimers();
    console.info('dedupe-expire-message');
    expect(invokeMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    console.info('dedupe-expire-message');
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it('forwards window error events as error level', () => {
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'uncaught oops', filename: 'app.js', lineno: 5, colno: 3 }),
    );
    const payload = invokeMock.mock.calls[0][1] as { level: string; message: string };
    expect(payload.level).toBe('error');
    expect(payload.message).toContain('uncaught oops');
    expect(payload.message).toContain('app.js:5:3');
  });

  it('forwards unhandled promise rejections as error level', () => {
    const reason = 'async fail';
    const promise = Promise.reject(reason).catch(() => undefined); // consumed, no stray unhandledrejection
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise, reason }));
    const payload = invokeMock.mock.calls[0][1] as { level: string; message: string };
    expect(payload.level).toBe('error');
    expect(payload.message).toContain('Unhandled promise rejection');
    expect(payload.message).toContain('async fail');
  });
});
