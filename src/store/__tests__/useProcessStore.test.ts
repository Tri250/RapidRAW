import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProcessStore } from '../useProcessStore';
import { Status } from '../../components/ui/ExportImportProperties';

const getInitialState = () => ({
  exportState: { errorMessage: '', progress: { current: 0, total: 0 }, status: Status.Idle },
  importState: { errorMessage: '', path: '', progress: { current: 0, total: 0 }, status: Status.Idle },
  isIndexing: false,
  indexingProgress: { current: 0, total: 0 },
  thumbnails: {},
  thumbnailProgress: { current: 0, total: 0 },
  aiModelDownloadStatus: null,
  copiedFilePaths: [],
  isCopied: false,
  isPasted: false,
  initialFileToOpen: null,
  externalEditSession: null,
});

describe('useProcessStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useProcessStore.setState(getInitialState());
    vi.clearAllTimers();
  });

  describe('初始状态', () => {
    it('exportState 默认值为 Idle 状态，progress 为 0', () => {
      const state = useProcessStore.getState();
      expect(state.exportState.status).toBe(Status.Idle);
      expect(state.exportState.errorMessage).toBe('');
      expect(state.exportState.progress).toEqual({ current: 0, total: 0 });
    });

    it('importState 默认值为 Idle 状态', () => {
      const state = useProcessStore.getState();
      expect(state.importState.status).toBe(Status.Idle);
      expect(state.importState.errorMessage).toBe('');
      expect(state.importState.path).toBe('');
      expect(state.importState.progress).toEqual({ current: 0, total: 0 });
    });

    it('isIndexing 默认为 false', () => {
      const state = useProcessStore.getState();
      expect(state.isIndexing).toBe(false);
    });

    it('indexingProgress 默认为 { current: 0, total: 0 }', () => {
      const state = useProcessStore.getState();
      expect(state.indexingProgress).toEqual({ current: 0, total: 0 });
    });

    it('thumbnails 默认为空对象', () => {
      const state = useProcessStore.getState();
      expect(state.thumbnails).toEqual({});
    });

    it('thumbnailProgress 默认为 { current: 0, total: 0 }', () => {
      const state = useProcessStore.getState();
      expect(state.thumbnailProgress).toEqual({ current: 0, total: 0 });
    });

    it('aiModelDownloadStatus 默认为 null', () => {
      const state = useProcessStore.getState();
      expect(state.aiModelDownloadStatus).toBeNull();
    });

    it('copiedFilePaths 默认为空数组', () => {
      const state = useProcessStore.getState();
      expect(state.copiedFilePaths).toEqual([]);
    });

    it('isCopied 默认为 false', () => {
      const state = useProcessStore.getState();
      expect(state.isCopied).toBe(false);
    });

    it('isPasted 默认为 false', () => {
      const state = useProcessStore.getState();
      expect(state.isPasted).toBe(false);
    });

    it('initialFileToOpen 默认为 null', () => {
      const state = useProcessStore.getState();
      expect(state.initialFileToOpen).toBeNull();
    });

    it('externalEditSession 默认为 null', () => {
      const state = useProcessStore.getState();
      expect(state.externalEditSession).toBeNull();
    });
  });

  describe('setProcess action', () => {
    it('可以用对象设置状态', () => {
      useProcessStore.getState().setProcess({ isIndexing: true });
      expect(useProcessStore.getState().isIndexing).toBe(true);
    });

    it('可以用函数设置状态', () => {
      useProcessStore.getState().setProcess({ copiedFilePaths: ['/path1'] });
      useProcessStore.getState().setProcess((prev) => ({
        copiedFilePaths: [...prev.copiedFilePaths, '/path2'],
      }));
      expect(useProcessStore.getState().copiedFilePaths).toEqual(['/path1', '/path2']);
    });

    it('设置 isCopied: true 后，1秒后自动重置为 false', () => {
      useProcessStore.getState().setProcess({ isCopied: true });
      expect(useProcessStore.getState().isCopied).toBe(true);

      vi.advanceTimersByTime(999);
      expect(useProcessStore.getState().isCopied).toBe(true);

      vi.advanceTimersByTime(1);
      expect(useProcessStore.getState().isCopied).toBe(false);
    });

    it('设置 isPasted: true 后，1秒后自动重置为 false', () => {
      useProcessStore.getState().setProcess({ isPasted: true });
      expect(useProcessStore.getState().isPasted).toBe(true);

      vi.advanceTimersByTime(999);
      expect(useProcessStore.getState().isPasted).toBe(true);

      vi.advanceTimersByTime(1);
      expect(useProcessStore.getState().isPasted).toBe(false);
    });

    it('多次设置 isCopied 会清除之前的 timeout', () => {
      useProcessStore.getState().setProcess({ isCopied: true });
      vi.advanceTimersByTime(500);
      expect(useProcessStore.getState().isCopied).toBe(true);

      useProcessStore.getState().setProcess({ isCopied: true });
      vi.advanceTimersByTime(600);
      expect(useProcessStore.getState().isCopied).toBe(true);

      vi.advanceTimersByTime(400);
      expect(useProcessStore.getState().isCopied).toBe(false);
    });

    it('多次设置 isPasted 会清除之前的 timeout', () => {
      useProcessStore.getState().setProcess({ isPasted: true });
      vi.advanceTimersByTime(500);
      expect(useProcessStore.getState().isPasted).toBe(true);

      useProcessStore.getState().setProcess({ isPasted: true });
      vi.advanceTimersByTime(600);
      expect(useProcessStore.getState().isPasted).toBe(true);

      vi.advanceTimersByTime(400);
      expect(useProcessStore.getState().isPasted).toBe(false);
    });

    it('设置其他属性不影响 isCopied 状态', () => {
      useProcessStore.getState().setProcess({ isCopied: true });
      useProcessStore.getState().setProcess({ isIndexing: true });
      expect(useProcessStore.getState().isCopied).toBe(true);
      expect(useProcessStore.getState().isIndexing).toBe(true);
    });

    it('设置其他属性不影响 isPasted 状态', () => {
      useProcessStore.getState().setProcess({ isPasted: true });
      useProcessStore.getState().setProcess({ isIndexing: true });
      expect(useProcessStore.getState().isPasted).toBe(true);
      expect(useProcessStore.getState().isIndexing).toBe(true);
    });

    it('可以同时设置多个状态', () => {
      useProcessStore.getState().setProcess({
        isIndexing: true,
        aiModelDownloadStatus: 'downloading',
        initialFileToOpen: '/test.jpg',
      });
      const state = useProcessStore.getState();
      expect(state.isIndexing).toBe(true);
      expect(state.aiModelDownloadStatus).toBe('downloading');
      expect(state.initialFileToOpen).toBe('/test.jpg');
    });

    it('设置 externalEditSession 对象', () => {
      const session = {
        source: '/source.jpg',
        output: '/output.jpg',
        format: 'jpeg',
        jpegQuality: 90,
      };
      useProcessStore.getState().setProcess({ externalEditSession: session });
      expect(useProcessStore.getState().externalEditSession).toEqual(session);
    });

    it('设置 thumbnails 对象', () => {
      const thumbs = { 'img1.jpg': 'thumb1.jpg', 'img2.jpg': 'thumb2.jpg' };
      useProcessStore.getState().setProcess({ thumbnails: thumbs });
      expect(useProcessStore.getState().thumbnails).toEqual(thumbs);
    });

    it('设置 indexingProgress', () => {
      useProcessStore.getState().setProcess({ indexingProgress: { current: 5, total: 10 } });
      expect(useProcessStore.getState().indexingProgress).toEqual({ current: 5, total: 10 });
    });

    it('设置 thumbnailProgress', () => {
      useProcessStore.getState().setProcess({ thumbnailProgress: { current: 3, total: 7 } });
      expect(useProcessStore.getState().thumbnailProgress).toEqual({ current: 3, total: 7 });
    });
  });

  describe('setExportState action', () => {
    it('可以用对象部分更新 exportState', () => {
      useProcessStore.getState().setExportState({ status: Status.Exporting });
      const state = useProcessStore.getState();
      expect(state.exportState.status).toBe(Status.Exporting);
      expect(state.exportState.errorMessage).toBe('');
      expect(state.exportState.progress).toEqual({ current: 0, total: 0 });
    });

    it('可以用函数更新 exportState', () => {
      useProcessStore.getState().setExportState({ progress: { current: 1, total: 10 } });
      useProcessStore.getState().setExportState((prev) => ({
        progress: { ...prev.progress, current: prev.progress.current + 1 },
      }));
      expect(useProcessStore.getState().exportState.progress.current).toBe(2);
      expect(useProcessStore.getState().exportState.progress.total).toBe(10);
    });

    it('设置为 Success 状态后，5秒后自动重置为 Idle', () => {
      useProcessStore.getState().setExportState({
        status: Status.Success,
        progress: { current: 10, total: 10 },
      });
      expect(useProcessStore.getState().exportState.status).toBe(Status.Success);

      vi.advanceTimersByTime(4999);
      expect(useProcessStore.getState().exportState.status).toBe(Status.Success);

      vi.advanceTimersByTime(1);
      const state = useProcessStore.getState();
      expect(state.exportState.status).toBe(Status.Idle);
      expect(state.exportState.errorMessage).toBe('');
      expect(state.exportState.progress).toEqual({ current: 0, total: 0 });
    });

    it('设置为 Error 状态后，5秒后自动重置为 Idle', () => {
      useProcessStore.getState().setExportState({
        status: Status.Error,
        errorMessage: 'test error',
      });
      expect(useProcessStore.getState().exportState.status).toBe(Status.Error);
      expect(useProcessStore.getState().exportState.errorMessage).toBe('test error');

      vi.advanceTimersByTime(5000);
      const state = useProcessStore.getState();
      expect(state.exportState.status).toBe(Status.Idle);
      expect(state.exportState.errorMessage).toBe('');
      expect(state.exportState.progress).toEqual({ current: 0, total: 0 });
    });

    it('设置为 Cancelled 状态后，5秒后自动重置为 Idle', () => {
      useProcessStore.getState().setExportState({ status: Status.Cancelled });
      expect(useProcessStore.getState().exportState.status).toBe(Status.Cancelled);

      vi.advanceTimersByTime(5000);
      expect(useProcessStore.getState().exportState.status).toBe(Status.Idle);
    });

    it('设置为 Exporting 状态后不会自动重置', () => {
      useProcessStore.getState().setExportState({ status: Status.Exporting });
      vi.advanceTimersByTime(10000);
      expect(useProcessStore.getState().exportState.status).toBe(Status.Exporting);
    });

    it('设置为 Idle 状态后不会启动定时器', () => {
      useProcessStore.getState().setExportState({ status: Status.Idle });
      vi.advanceTimersByTime(10000);
      expect(useProcessStore.getState().exportState.status).toBe(Status.Idle);
    });

    it('多次设置会清除之前的 timeout', () => {
      useProcessStore.getState().setExportState({ status: Status.Success });
      vi.advanceTimersByTime(3000);
      expect(useProcessStore.getState().exportState.status).toBe(Status.Success);

      useProcessStore.getState().setExportState({ status: Status.Success });
      vi.advanceTimersByTime(3000);
      expect(useProcessStore.getState().exportState.status).toBe(Status.Success);

      vi.advanceTimersByTime(2000);
      expect(useProcessStore.getState().exportState.status).toBe(Status.Idle);
    });

    it('从 Success 切换到 Exporting 会取消自动重置', () => {
      useProcessStore.getState().setExportState({ status: Status.Success });
      vi.advanceTimersByTime(2000);

      useProcessStore.getState().setExportState({ status: Status.Exporting });
      vi.advanceTimersByTime(10000);
      expect(useProcessStore.getState().exportState.status).toBe(Status.Exporting);
    });

    it('更新 progress 不影响 status', () => {
      useProcessStore.getState().setExportState({ status: Status.Exporting });
      useProcessStore.getState().setExportState({ progress: { current: 5, total: 10 } });
      const state = useProcessStore.getState();
      expect(state.exportState.status).toBe(Status.Exporting);
      expect(state.exportState.progress).toEqual({ current: 5, total: 10 });
    });
  });

  describe('setImportState action', () => {
    it('可以用对象部分更新 importState', () => {
      useProcessStore.getState().setImportState({ status: Status.Importing });
      const state = useProcessStore.getState();
      expect(state.importState.status).toBe(Status.Importing);
      expect(state.importState.errorMessage).toBe('');
    });

    it('可以用函数更新 importState', () => {
      useProcessStore.getState().setImportState({ progress: { current: 1, total: 10 } });
      useProcessStore.getState().setImportState((prev) => ({
        progress: { ...prev.progress!, current: prev.progress!.current + 1 },
      }));
      expect(useProcessStore.getState().importState.progress!.current).toBe(2);
      expect(useProcessStore.getState().importState.progress!.total).toBe(10);
    });

    it('设置为 Success 状态后，5秒后自动重置为 Idle', () => {
      useProcessStore.getState().setImportState({
        status: Status.Success,
        progress: { current: 10, total: 10 },
      });
      expect(useProcessStore.getState().importState.status).toBe(Status.Success);

      vi.advanceTimersByTime(4999);
      expect(useProcessStore.getState().importState.status).toBe(Status.Success);

      vi.advanceTimersByTime(1);
      const state = useProcessStore.getState();
      expect(state.importState.status).toBe(Status.Idle);
      expect(state.importState.errorMessage).toBe('');
      expect(state.importState.progress).toEqual({ current: 0, total: 0 });
    });

    it('设置为 Error 状态后，5秒后自动重置为 Idle', () => {
      useProcessStore.getState().setImportState({
        status: Status.Error,
        errorMessage: 'import error',
      });
      expect(useProcessStore.getState().importState.status).toBe(Status.Error);
      expect(useProcessStore.getState().importState.errorMessage).toBe('import error');

      vi.advanceTimersByTime(5000);
      const state = useProcessStore.getState();
      expect(state.importState.status).toBe(Status.Idle);
      expect(state.importState.errorMessage).toBe('');
      expect(state.importState.progress).toEqual({ current: 0, total: 0 });
    });

    it('设置为 Cancelled 状态后，5秒后自动重置为 Idle', () => {
      useProcessStore.getState().setImportState({ status: Status.Cancelled });
      expect(useProcessStore.getState().importState.status).toBe(Status.Cancelled);

      vi.advanceTimersByTime(5000);
      expect(useProcessStore.getState().importState.status).toBe(Status.Idle);
    });

    it('设置为 Importing 状态后不会自动重置', () => {
      useProcessStore.getState().setImportState({ status: Status.Importing });
      vi.advanceTimersByTime(10000);
      expect(useProcessStore.getState().importState.status).toBe(Status.Importing);
    });

    it('设置为 Idle 状态后不会启动定时器', () => {
      useProcessStore.getState().setImportState({ status: Status.Idle });
      vi.advanceTimersByTime(10000);
      expect(useProcessStore.getState().importState.status).toBe(Status.Idle);
    });

    it('多次设置会清除之前的 timeout', () => {
      useProcessStore.getState().setImportState({ status: Status.Success });
      vi.advanceTimersByTime(3000);
      expect(useProcessStore.getState().importState.status).toBe(Status.Success);

      useProcessStore.getState().setImportState({ status: Status.Success });
      vi.advanceTimersByTime(3000);
      expect(useProcessStore.getState().importState.status).toBe(Status.Success);

      vi.advanceTimersByTime(2000);
      expect(useProcessStore.getState().importState.status).toBe(Status.Idle);
    });

    it('从 Success 切换到 Importing 会取消自动重置', () => {
      useProcessStore.getState().setImportState({ status: Status.Success });
      vi.advanceTimersByTime(2000);

      useProcessStore.getState().setImportState({ status: Status.Importing });
      vi.advanceTimersByTime(10000);
      expect(useProcessStore.getState().importState.status).toBe(Status.Importing);
    });

    it('可以设置 path 属性', () => {
      useProcessStore.getState().setImportState({ path: '/import/path' });
      expect(useProcessStore.getState().importState.path).toBe('/import/path');
    });

    it('更新 path 不影响 status', () => {
      useProcessStore.getState().setImportState({ status: Status.Importing, path: '/test' });
      useProcessStore.getState().setImportState({ path: '/new-path' });
      const state = useProcessStore.getState();
      expect(state.importState.status).toBe(Status.Importing);
      expect(state.importState.path).toBe('/new-path');
    });
  });
});
