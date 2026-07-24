import { useMemo } from 'react';
import { platform } from '@tauri-apps/plugin-os';

export function useOsPlatform() {
  return useMemo(() => {
    try {
      return platform();
    } catch (_error) {
      // Fallback: infer platform from navigator.userAgent when Tauri API is unavailable
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      if (ua.includes('Android')) return 'android';
      if (ua.includes('Linux')) return 'linux';
      if (ua.includes('Mac')) return 'macos';
      if (ua.includes('Win')) return 'windows';
      return '';
    }
  }, []);
}
