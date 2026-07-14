import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOsPlatform } from '../useOsPlatform';

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: vi.fn(),
}));

import { platform } from '@tauri-apps/plugin-os';

describe('useOsPlatform', () => {
  describe('正常情况', () => {
    it('返回 platform() 的结果', () => {
      vi.mocked(platform).mockReturnValue('macos');
      const { result } = renderHook(() => useOsPlatform());
      expect(result.current).toBe('macos');
      expect(platform).toHaveBeenCalledTimes(1);
    });

    it('返回 linux 平台', () => {
      vi.mocked(platform).mockReturnValue('linux');
      const { result } = renderHook(() => useOsPlatform());
      expect(result.current).toBe('linux');
    });

    it('返回 windows 平台', () => {
      vi.mocked(platform).mockReturnValue('windows');
      const { result } = renderHook(() => useOsPlatform());
      expect(result.current).toBe('windows');
    });
  });

  describe('异常情况', () => {
    it('platform() 抛错时返回空字符串', () => {
      vi.mocked(platform).mockImplementation(() => {
        throw new Error('Platform error');
      });
      const { result } = renderHook(() => useOsPlatform());
      expect(result.current).toBe('');
    });

    it('platform() 抛出任意错误时都返回空字符串', () => {
      vi.mocked(platform).mockImplementation(() => {
        throw 'string error';
      });
      const { result } = renderHook(() => useOsPlatform());
      expect(result.current).toBe('');
    });
  });
});
