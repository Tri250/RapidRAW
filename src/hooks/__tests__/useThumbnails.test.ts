import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThumbnails } from '../useThumbnails';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import { invoke } from '@tauri-apps/api/core';

describe('useThumbnails', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(invoke).mockClear();
    vi.mocked(invoke).mockResolvedValue(undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  describe('返回值结构', () => {
    it('返回 requestThumbnails, clearThumbnailQueue, markGenerated 三个函数', () => {
      const { result } = renderHook(() => useThumbnails());

      expect(result.current).toBeDefined();
      expect(typeof result.current.requestThumbnails).toBe('function');
      expect(typeof result.current.clearThumbnailQueue).toBe('function');
      expect(typeof result.current.markGenerated).toBe('function');
      expect(Object.keys(result.current)).toHaveLength(3);
    });

    it('每次渲染返回相同的函数引用', () => {
      const { result, rerender } = renderHook(() => useThumbnails());

      const firstResult = { ...result.current };

      rerender();

      expect(result.current.requestThumbnails).toBe(firstResult.requestThumbnails);
      expect(result.current.clearThumbnailQueue).toBe(firstResult.clearThumbnailQueue);
      expect(result.current.markGenerated).toBe(firstResult.markGenerated);
    });
  });

  describe('初始状态', () => {
    it('初始队列为空，调用 requestThumbnails 空数组不触发 invoke', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails([]);
      });

      vi.advanceTimersByTime(300);

      expect(invoke).not.toHaveBeenCalled();
    });

    it('初始状态下所有路径都是新的，都会添加到队列', () => {
      const { result } = renderHook(() => useThumbnails());
      const paths = ['/a.jpg', '/b.jpg', '/c.jpg'];

      act(() => {
        result.current.requestThumbnails(paths);
      });

      vi.advanceTimersByTime(150);

      expect(invoke).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(invoke).mock.calls[0][1] as { paths: string[] };
      expect(callArg.paths.length).toBe(3);
      expect(callArg.paths).toEqual(expect.arrayContaining(paths));
    });
  });

  describe('requestThumbnails', () => {
    it('添加新路径到队列', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg', '/path2.jpg']);
      });

      vi.advanceTimersByTime(150);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith('update_thumbnail_queue', {
        paths: expect.arrayContaining(['/path1.jpg', '/path2.jpg']),
      });
    });

    it('已生成的路径不重复添加', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.markGenerated('/path1.jpg');
      });

      act(() => {
        result.current.requestThumbnails(['/path1.jpg', '/path2.jpg']);
      });

      vi.advanceTimersByTime(150);

      expect(invoke).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(invoke).mock.calls[0][1] as { paths: string[] };
      expect(callArg.paths).toEqual(['/path2.jpg']);
    });

    it('已在队列中的路径不重复添加', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      act(() => {
        result.current.requestThumbnails(['/path1.jpg', '/path2.jpg']);
      });

      vi.advanceTimersByTime(150);

      expect(invoke).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(invoke).mock.calls[0][1] as { paths: string[] };
      expect(callArg.paths).toEqual(expect.arrayContaining(['/path1.jpg', '/path2.jpg']));
      expect(callArg.paths.length).toBe(2);
    });

    it('有新增路径时触发 flushQueueToBackend（debounced）', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      expect(invoke).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(invoke).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('没有新增路径时不触发', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.markGenerated('/path1.jpg');
      });

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      vi.advanceTimersByTime(300);

      expect(invoke).not.toHaveBeenCalled();
    });

    it('空数组不触发', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails([]);
      });

      vi.advanceTimersByTime(300);

      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe('markGenerated', () => {
    it('标记路径为已生成', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.markGenerated('/path1.jpg');
      });

      act(() => {
        result.current.requestThumbnails(['/path1.jpg', '/path2.jpg']);
      });

      vi.advanceTimersByTime(150);

      const callArg = vi.mocked(invoke).mock.calls[0][1] as { paths: string[] };
      expect(callArg.paths).toEqual(['/path2.jpg']);
    });

    it('从待处理队列中移除', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg', '/path2.jpg']);
      });

      act(() => {
        result.current.markGenerated('/path1.jpg');
      });

      vi.advanceTimersByTime(150);

      expect(invoke).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(invoke).mock.calls[0][1] as { paths: string[] };
      expect(callArg.paths).toEqual(['/path2.jpg']);
    });

    it('多次标记同一路径不报错', () => {
      const { result } = renderHook(() => useThumbnails());

      expect(() => {
        act(() => {
          result.current.markGenerated('/path1.jpg');
          result.current.markGenerated('/path1.jpg');
        });
      }).not.toThrow();
    });
  });

  describe('clearThumbnailQueue', () => {
    it('清空已生成集合', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.markGenerated('/path1.jpg');
        result.current.clearThumbnailQueue();
      });

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      vi.advanceTimersByTime(150);

      expect(invoke).toHaveBeenCalled();
      const callArg = vi
        .mocked(invoke)
        .mock.calls.find(
          (call) => call[0] === 'update_thumbnail_queue' && (call[1] as { paths: string[] }).paths.length > 0,
        );
      expect(callArg).toBeDefined();
      expect((callArg![1] as { paths: string[] }).paths).toContain('/path1.jpg');
    });

    it('清空待处理队列', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg', '/path2.jpg']);
      });

      act(() => {
        result.current.clearThumbnailQueue();
      });

      vi.advanceTimersByTime(300);

      const nonEmptyCalls = vi
        .mocked(invoke)
        .mock.calls.filter(
          (call) => call[0] === 'update_thumbnail_queue' && (call[1] as { paths: string[] }).paths.length > 0,
        );
      expect(nonEmptyCalls.length).toBe(0);
    });

    it('取消 debounce', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      act(() => {
        result.current.clearThumbnailQueue();
      });

      vi.advanceTimersByTime(300);

      const nonEmptyCalls = vi
        .mocked(invoke)
        .mock.calls.filter(
          (call) => call[0] === 'update_thumbnail_queue' && (call[1] as { paths: string[] }).paths.length > 0,
        );
      expect(nonEmptyCalls.length).toBe(0);
    });

    it('调用 invoke 清空后端队列', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.clearThumbnailQueue();
      });

      expect(invoke).toHaveBeenCalledWith('update_thumbnail_queue', { paths: [] });
    });
  });

  describe('缓存机制', () => {
    it('markGenerated 后路径被缓存，不再请求', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      vi.advanceTimersByTime(150);
      expect(invoke).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.markGenerated('/path1.jpg');
      });

      vi.mocked(invoke).mockClear();

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      vi.advanceTimersByTime(300);
      expect(invoke).not.toHaveBeenCalled();
    });

    it('clearThumbnailQueue 后缓存被清空，可以重新请求', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.markGenerated('/path1.jpg');
      });

      act(() => {
        result.current.clearThumbnailQueue();
      });

      vi.mocked(invoke).mockClear();

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      vi.advanceTimersByTime(150);
      expect(invoke).toHaveBeenCalledTimes(1);
    });
  });

  describe('并发请求处理', () => {
    it('多次快速调用只触发一次后端调用', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });
      act(() => {
        result.current.requestThumbnails(['/path2.jpg']);
      });
      act(() => {
        result.current.requestThumbnails(['/path3.jpg']);
      });

      vi.advanceTimersByTime(150);

      expect(invoke).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(invoke).mock.calls[0][1] as { paths: string[] };
      expect(callArg.paths.length).toBe(3);
    });

    it('150ms 防抖', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      vi.advanceTimersByTime(149);
      expect(invoke).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('300ms maxWait', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(100);
        act(() => {
          result.current.requestThumbnails([`/path${i + 2}.jpg`]);
        });
      }

      expect(invoke).toHaveBeenCalledTimes(1);
    });

    it("调用 invoke('update_thumbnail_queue', { paths })", () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      vi.advanceTimersByTime(150);

      expect(invoke).toHaveBeenCalledWith('update_thumbnail_queue', {
        paths: expect.any(Array),
      });
    });

    it('调用后清空待处理队列', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      vi.advanceTimersByTime(150);

      vi.mocked(invoke).mockClear();

      vi.advanceTimersByTime(300);

      expect(invoke).not.toHaveBeenCalled();
    });

    it('路径被随机打乱（Fisher-Yates shuffle）', () => {
      const { result } = renderHook(() => useThumbnails());
      const paths = Array.from({ length: 20 }, (_, i) => `/path${i}.jpg`);

      vi.spyOn(Math, 'random').mockImplementation(() => 0.1);

      act(() => {
        result.current.requestThumbnails(paths);
      });

      vi.advanceTimersByTime(150);

      expect(invoke).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(invoke).mock.calls[0][1] as { paths: string[] };
      expect(callArg.paths.length).toBe(paths.length);
      expect(callArg.paths).toEqual(expect.arrayContaining(paths));

      vi.spyOn(Math, 'random').mockRestore();
    });

    it('空队列时不调用 invoke', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails([]);
      });

      vi.advanceTimersByTime(300);

      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('invoke 失败时不抛出错误', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('test error'));

      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      vi.advanceTimersByTime(150);

      await vi.runAllTimersAsync();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to update thumbnail queue:', expect.any(Error));
    });

    it('clearThumbnailQueue invoke 失败时不抛出错误', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('clear error'));

      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.clearThumbnailQueue();
      });

      await vi.runAllTimersAsync();

      expect(invoke).toHaveBeenCalledWith('update_thumbnail_queue', { paths: [] });
    });

    it('多次 invoke 失败不影响后续调用', () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('error 1')).mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });
      vi.advanceTimersByTime(150);

      act(() => {
        result.current.requestThumbnails(['/path2.jpg']);
      });
      vi.advanceTimersByTime(150);

      expect(invoke).toHaveBeenCalledTimes(2);
    });
  });

  describe('清理/卸载逻辑', () => {
    it('组件卸载时取消 debounce', () => {
      const { result, unmount } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      unmount();

      vi.advanceTimersByTime(300);

      const nonEmptyCalls = vi
        .mocked(invoke)
        .mock.calls.filter(
          (call) => call[0] === 'update_thumbnail_queue' && (call[1] as { paths: string[] }).paths.length > 0,
        );
      expect(nonEmptyCalls.length).toBe(0);
    });

    it('卸载后调用函数不报错', () => {
      const { result, unmount } = renderHook(() => useThumbnails());

      unmount();

      expect(() => {
        act(() => {
          result.current.markGenerated('/path1.jpg');
        });
      }).not.toThrow();

      expect(() => {
        act(() => {
          result.current.requestThumbnails(['/path1.jpg']);
        });
      }).not.toThrow();
    });
  });

  describe('边界情况', () => {
    it('重复调用 markGenerated 后路径仍保持已生成状态', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.markGenerated('/path1.jpg');
        result.current.markGenerated('/path1.jpg');
      });

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      vi.advanceTimersByTime(150);

      const nonEmptyCalls = vi
        .mocked(invoke)
        .mock.calls.filter(
          (call) => call[0] === 'update_thumbnail_queue' && (call[1] as { paths: string[] }).paths.length > 0,
        );
      expect(nonEmptyCalls.length).toBe(0);
    });

    it('clearThumbnailQueue 后可以重新添加路径', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
        result.current.clearThumbnailQueue();
      });

      vi.mocked(invoke).mockClear();

      act(() => {
        result.current.requestThumbnails(['/path2.jpg']);
      });

      vi.advanceTimersByTime(150);

      expect(invoke).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(invoke).mock.calls[0][1] as { paths: string[] };
      expect(callArg.paths).toEqual(['/path2.jpg']);
    });

    it('maxWait 后立即触发下一次 debounce', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/path1.jpg']);
      });

      vi.advanceTimersByTime(299);
      act(() => {
        result.current.requestThumbnails(['/path2.jpg']);
      });

      vi.advanceTimersByTime(1);
      expect(invoke).toHaveBeenCalledTimes(1);

      vi.mocked(invoke).mockClear();

      act(() => {
        result.current.requestThumbnails(['/path3.jpg']);
      });

      vi.advanceTimersByTime(149);
      expect(invoke).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('单个路径也能正常处理', () => {
      const { result } = renderHook(() => useThumbnails());

      act(() => {
        result.current.requestThumbnails(['/single.jpg']);
      });

      vi.advanceTimersByTime(150);

      expect(invoke).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(invoke).mock.calls[0][1] as { paths: string[] };
      expect(callArg.paths).toEqual(['/single.jpg']);
    });

    it('大量路径一次性添加', () => {
      const { result } = renderHook(() => useThumbnails());
      const manyPaths = Array.from({ length: 100 }, (_, i) => `/path${i}.jpg`);

      act(() => {
        result.current.requestThumbnails(manyPaths);
      });

      vi.advanceTimersByTime(150);

      expect(invoke).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(invoke).mock.calls[0][1] as { paths: string[] };
      expect(callArg.paths.length).toBe(100);
    });

    it('markGenerated 未在队列中的路径不报错', () => {
      const { result } = renderHook(() => useThumbnails());

      expect(() => {
        act(() => {
          result.current.markGenerated('/nonexistent.jpg');
        });
      }).not.toThrow();
    });

    it('clearThumbnailQueue 在初始状态调用不报错', () => {
      const { result } = renderHook(() => useThumbnails());

      expect(() => {
        act(() => {
          result.current.clearThumbnailQueue();
        });
      }).not.toThrow();
    });
  });
});
