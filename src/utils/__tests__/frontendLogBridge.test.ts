import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockInvoke: ReturnType<typeof vi.fn>;

async function importFresh() {
  vi.resetModules();

  mockInvoke = vi.fn(() => Promise.resolve());

  vi.doMock('@tauri-apps/api/core', () => ({
    invoke: mockInvoke,
  }));

  vi.doMock('../components/ui/AppProperties', () => ({
    Invokes: {
      FrontendLog: 'frontend_log',
    },
  }));

  const mod = await import('../frontendLogBridge');
  return mod;
}

describe('installFrontendLogBridge', () => {
  let originalConsoleDebug: typeof console.debug;
  let originalConsoleInfo: typeof console.info;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    vi.useFakeTimers();
    originalConsoleDebug = console.debug;
    originalConsoleInfo = console.info;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    originalConsoleLog = console.log;
  });

  afterEach(() => {
    console.debug = originalConsoleDebug;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('只安装一次（isInstalled 守卫）', async () => {
    const { installFrontendLogBridge } = await importFresh();

    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    installFrontendLogBridge();
    installFrontendLogBridge();

    expect(addEventListenerSpy).toHaveBeenCalledTimes(2);
  });

  it('非浏览器环境不安装', async () => {
    const originalWindow = (globalThis as typeof globalThis & { window?: typeof window }).window;
    delete (globalThis as typeof globalThis & { window?: typeof window }).window;

    const { installFrontendLogBridge } = await importFresh();

    expect(() => installFrontendLogBridge()).not.toThrow();

    (globalThis as typeof globalThis & { window: typeof window }).window = originalWindow;
  });

  it('安装后 console.debug/info/warn/error/log 被替换', async () => {
    const debugBefore = console.debug;
    const infoBefore = console.info;
    const warnBefore = console.warn;
    const errorBefore = console.error;
    const logBefore = console.log;

    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    expect(console.debug).not.toBe(debugBefore);
    expect(console.info).not.toBe(infoBefore);
    expect(console.warn).not.toBe(warnBefore);
    expect(console.error).not.toBe(errorBefore);
    expect(console.log).not.toBe(logBefore);
  });

  it('原始 console 方法仍然被调用', async () => {
    const debugSpy = vi.fn();
    const infoSpy = vi.fn();
    const warnSpy = vi.fn();
    const errorSpy = vi.fn();
    const logSpy = vi.fn();

    console.debug = debugSpy;
    console.info = infoSpy;
    console.warn = warnSpy;
    console.error = errorSpy;
    console.log = logSpy;

    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    console.debug('debug msg');
    console.info('info msg');
    console.warn('warn msg');
    console.error('error msg');
    console.log('log msg');

    expect(debugSpy).toHaveBeenCalledWith('debug msg');
    expect(infoSpy).toHaveBeenCalledWith('info msg');
    expect(warnSpy).toHaveBeenCalledWith('warn msg');
    expect(errorSpy).toHaveBeenCalledWith('error msg');
    expect(logSpy).toHaveBeenCalledWith('log msg');
  });

  it('调用后会发送日志到后端（invoke）', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    console.debug('debug test');
    expect(mockInvoke).toHaveBeenCalledWith('frontend_log', {
      level: 'debug',
      message: 'debug test',
    });

    console.info('info test');
    expect(mockInvoke).toHaveBeenCalledWith('frontend_log', {
      level: 'info',
      message: 'info test',
    });

    console.warn('warn test');
    expect(mockInvoke).toHaveBeenCalledWith('frontend_log', {
      level: 'warn',
      message: 'warn test',
    });

    console.error('error test');
    expect(mockInvoke).toHaveBeenCalledWith('frontend_log', {
      level: 'error',
      message: 'error test',
    });

    console.log('log test');
    expect(mockInvoke).toHaveBeenCalledWith('frontend_log', {
      level: 'info',
      message: 'log test',
    });
  });
});

describe('消息格式化', () => {
  let originalConsoleDebug: typeof console.debug;
  let originalConsoleInfo: typeof console.info;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    vi.useFakeTimers();
    originalConsoleDebug = console.debug;
    originalConsoleInfo = console.info;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    originalConsoleLog = console.log;
  });

  afterEach(() => {
    console.debug = originalConsoleDebug;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('字符串参数直接使用', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    console.info('hello world');

    expect(mockInvoke).toHaveBeenCalledWith('frontend_log', {
      level: 'info',
      message: 'hello world',
    });
  });

  it('Error 对象序列化为 JSON', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    const err = new Error('test error');
    console.error(err);

    const callArgs = mockInvoke.mock.calls.find(
      (call) => call[0] === 'frontend_log' && typeof call[1] === 'object' && call[1]?.level === 'error',
    );
    expect(callArgs).toBeDefined();
    const message = callArgs![1].message as string;
    expect(message).toContain('"name":"Error"');
    expect(message).toContain('"message":"test error"');
    expect(message).toContain('"stack"');
  });

  it('对象参数 JSON 序列化', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    const obj = { foo: 'bar', num: 42 };
    console.info(obj);

    const callArgs = mockInvoke.mock.calls.find(
      (call) => call[0] === 'frontend_log' && typeof call[1] === 'object' && call[1]?.level === 'info',
    );
    expect(callArgs).toBeDefined();
    const message = callArgs![1].message as string;
    const parsed = JSON.parse(message);
    expect(parsed).toEqual(obj);
  });

  it('多个参数用空格连接', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    console.info('first', 'second', 3);

    expect(mockInvoke).toHaveBeenCalledWith('frontend_log', {
      level: 'info',
      message: 'first second 3',
    });
  });

  it('超长消息被截断（MAX_LOG_MESSAGE_LENGTH = 12000）', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    const longStr = 'a'.repeat(15000);
    console.info(longStr);

    const callArgs = mockInvoke.mock.calls.find(
      (call) => call[0] === 'frontend_log' && typeof call[1] === 'object' && call[1]?.level === 'info',
    );
    expect(callArgs).toBeDefined();
    const message = callArgs![1].message as string;
    expect(message.length).toBeLessThanOrEqual(12000 + '… [truncated]'.length);
    expect(message.endsWith('… [truncated]')).toBe(true);
  });

  it('Vite 错误对象提取详情', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    const viteError = {
      message: 'Syntax error',
      plugin: 'vite:react',
      id: '/path/to/file.tsx',
      frame: '  1 | const x =',
      stack: 'Error: Syntax error\n    at foo',
      loc: {
        file: '/path/to/file.tsx',
        line: 10,
        column: 5,
      },
    };

    console.error('[vite] hot update error', viteError);

    const callArgs = mockInvoke.mock.calls.find(
      (call) => call[0] === 'frontend_log' && typeof call[1] === 'object' && call[1]?.level === 'error',
    );
    expect(callArgs).toBeDefined();
    const message = callArgs![1].message as string;
    expect(message).toContain('[vite:error] Syntax error');
    expect(message).toContain('[vite:error] plugin: vite:react');
    expect(message).toContain('[vite:error] file: /path/to/file.tsx');
    expect(message).toContain('[vite:error] loc: /path/to/file.tsx:10:5');
    expect(message).toContain('[vite:error] frame:');
    expect(message).toContain('[vite:error] stack:');
  });

  it('循环引用处理（[Circular]）', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    const obj: Record<string, unknown> = { name: 'test' };
    obj.self = obj;

    console.info(obj);

    const callArgs = mockInvoke.mock.calls.find(
      (call) => call[0] === 'frontend_log' && typeof call[1] === 'object' && call[1]?.level === 'info',
    );
    expect(callArgs).toBeDefined();
    const message = callArgs![1].message as string;
    expect(message).toContain('[Circular]');
  });

  it('最大深度限制（[MaxDepth]）', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    let deep: Record<string, unknown> = { level: 0 };
    let current = deep;
    for (let i = 1; i <= 10; i++) {
      current.next = { level: i };
      current = current.next as Record<string, unknown>;
    }

    console.info(deep);

    const callArgs = mockInvoke.mock.calls.find(
      (call) => call[0] === 'frontend_log' && typeof call[1] === 'object' && call[1]?.level === 'info',
    );
    expect(callArgs).toBeDefined();
    const message = callArgs![1].message as string;
    expect(message).toContain('[MaxDepth]');
  });

  it('函数序列化为 [Function name]', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    function myFunc() {
      return 1;
    }
    const anon = function () {
      return 2;
    };

    console.info('named:', myFunc, 'anon:', anon);

    const callArgs = mockInvoke.mock.calls.find(
      (call) => call[0] === 'frontend_log' && typeof call[1] === 'object' && call[1]?.level === 'info',
    );
    expect(callArgs).toBeDefined();
    const message = callArgs![1].message as string;
    expect(message).toContain('[Function myFunc]');
    expect(message).toContain('[Function anon]');
  });

  it('BigInt 序列化为 xn', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    console.info('bigint:', BigInt(123));

    const callArgs = mockInvoke.mock.calls.find(
      (call) => call[0] === 'frontend_log' && typeof call[1] === 'object' && call[1]?.level === 'info',
    );
    expect(callArgs).toBeDefined();
    const message = callArgs![1].message as string;
    expect(message).toContain('123n');
  });

  it('Event 对象序列化', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    const event = new Event('click', { bubbles: true });
    console.info(event);

    const callArgs = mockInvoke.mock.calls.find(
      (call) => call[0] === 'frontend_log' && typeof call[1] === 'object' && call[1]?.level === 'info',
    );
    expect(callArgs).toBeDefined();
    const message = callArgs![1].message as string;
    const parsed = JSON.parse(message);
    expect(parsed.type).toBe('click');
  });
});

describe('去重逻辑', () => {
  let originalConsoleDebug: typeof console.debug;
  let originalConsoleInfo: typeof console.info;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    vi.useFakeTimers();
    originalConsoleDebug = console.debug;
    originalConsoleInfo = console.info;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    originalConsoleLog = console.log;
  });

  afterEach(() => {
    console.debug = originalConsoleDebug;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('相同消息在 1.5 秒内只发送一次', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    console.info('dedup test');
    console.info('dedup test');
    console.info('dedup test');

    const infoCalls = mockInvoke.mock.calls.filter(
      (call) =>
        call[0] === 'frontend_log' &&
        typeof call[1] === 'object' &&
        call[1]?.level === 'info' &&
        call[1]?.message === 'dedup test',
    );
    expect(infoCalls.length).toBe(1);
  });

  it('不同消息都发送', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    console.info('message one');
    console.info('message two');
    console.info('message three');

    const infoCalls = mockInvoke.mock.calls.filter(
      (call) => call[0] === 'frontend_log' && typeof call[1] === 'object' && call[1]?.level === 'info',
    );
    expect(infoCalls.length).toBe(3);
  });

  it('1.5 秒后相同消息可以再次发送', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    console.info('dedup timeout');
    const firstCount = mockInvoke.mock.calls.filter(
      (call) =>
        call[0] === 'frontend_log' &&
        typeof call[1] === 'object' &&
        call[1]?.level === 'info' &&
        call[1]?.message === 'dedup timeout',
    ).length;
    expect(firstCount).toBe(1);

    vi.advanceTimersByTime(1600);

    console.info('dedup timeout');
    const secondCount = mockInvoke.mock.calls.filter(
      (call) =>
        call[0] === 'frontend_log' &&
        typeof call[1] === 'object' &&
        call[1]?.level === 'info' &&
        call[1]?.message === 'dedup timeout',
    ).length;
    expect(secondCount).toBe(2);
  });
});

describe('忽略特定消息', () => {
  let originalConsoleDebug: typeof console.debug;
  let originalConsoleInfo: typeof console.info;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    vi.useFakeTimers();
    originalConsoleDebug = console.debug;
    originalConsoleInfo = console.info;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    originalConsoleLog = console.log;
  });

  afterEach(() => {
    console.debug = originalConsoleDebug;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('包含 "[vite] failed to reload" 和 "see errors above" 的消息被忽略', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    console.error('[vite] failed to reload page, see errors above');

    const calls = mockInvoke.mock.calls.filter((call) => call[0] === 'frontend_log');
    expect(calls.length).toBe(0);
  });

  it('只包含其中一个关键词的消息不被忽略', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    console.error('[vite] failed to reload page');
    console.error('please see errors above');

    const calls = mockInvoke.mock.calls.filter((call) => call[0] === 'frontend_log');
    expect(calls.length).toBe(2);
  });
});

describe('窗口错误事件', () => {
  let originalConsoleDebug: typeof console.debug;
  let originalConsoleInfo: typeof console.info;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    vi.useFakeTimers();
    originalConsoleDebug = console.debug;
    originalConsoleInfo = console.info;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    originalConsoleLog = console.log;
  });

  afterEach(() => {
    console.debug = originalConsoleDebug;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('window error 事件触发时发送错误日志', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    const errorEvent = new ErrorEvent('error', {
      message: 'test error event',
      filename: 'test.js',
      lineno: 10,
      colno: 5,
      error: new Error('underlying error'),
    });
    window.dispatchEvent(errorEvent);

    const errorCalls = mockInvoke.mock.calls.filter(
      (call) => call[0] === 'frontend_log' && typeof call[1] === 'object' && call[1]?.level === 'error',
    );
    expect(errorCalls.length).toBeGreaterThan(0);
    const lastCall = errorCalls[errorCalls.length - 1];
    expect(lastCall[1].message).toContain('test error event');
  });

  it('unhandledrejection 事件触发时发送错误日志', async () => {
    const { installFrontendLogBridge } = await importFresh();
    installFrontendLogBridge();

    const rejectedPromise = Promise.reject(new Error('rejected'));
    rejectedPromise.catch(() => {});

    const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
      promise: rejectedPromise,
      reason: 'rejection reason',
    });
    window.dispatchEvent(rejectionEvent);

    const errorCalls = mockInvoke.mock.calls.filter(
      (call) => call[0] === 'frontend_log' && typeof call[1] === 'object' && call[1]?.level === 'error',
    );
    expect(errorCalls.length).toBeGreaterThan(0);
    const lastCall = errorCalls[errorCalls.length - 1];
    expect(lastCall[1].message).toContain('Unhandled promise rejection');
    expect(lastCall[1].message).toContain('rejection reason');
  });
});
