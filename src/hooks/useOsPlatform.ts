import { useMemo } from 'react';
import { platform } from '@tauri-apps/plugin-os';

export function useOsPlatform() {
  return useMemo(() => {
    try {
      const detected = platform();
      // On some Android devices, the plugin may return empty string
      if (!detected || detected === '') {
        // Fallback: check userAgent for Android
        if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) {
          return 'android';
        }
        return '';
      }
      return detected;
    } catch (_error) {
      // Fallback if platform plugin fails entirely
      if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) {
        return 'android';
      }
      return '';
    }
  }, []);
}
