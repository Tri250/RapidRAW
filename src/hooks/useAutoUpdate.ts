import { useEffect, useRef } from 'react';

export function useAutoUpdate() {
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    const checkForUpdates = async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const { ask } = await import('@tauri-apps/plugin-dialog');
        const update = await check();

        if (update?.available) {
          const yes = await ask(
            `发现新版本 v${update.version}，是否立即更新？\n\n更新内容：${update.body || '无'}`,
            { title: '更新可用', kind: 'info', okLabel: '更新', cancelLabel: '稍后' }
          );

          if (yes) {
            await update.downloadAndInstall();
          }
        }
      } catch (e) {
        // Updater not configured or network error - silent fail
        console.warn('Update check failed:', e);
      }
    };

    // Check 5 seconds after app starts
    const timer = setTimeout(checkForUpdates, 5000);
    return () => clearTimeout(timer);
  }, []);
}
