import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAndroidBackHandler } from './useAndroidBackHandler';
import { useSettingsStore } from '../store/useSettingsStore';
import { useUIStore } from '../store/useUIStore';
import i18n from '../i18n';

vi.mock('../store/useSettingsStore', () => ({
  useSettingsStore: Object.assign(
    vi.fn((selector?: (s: any) => any) => {
      const state = { osPlatform: 'android' };
      return selector ? selector(state) : state;
    }),
    {
      getState: vi.fn(() => ({ osPlatform: 'android' })),
    },
  ),
}));

vi.mock('../store/useUIStore', () => ({
  useUIStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => ({
      confirmModalState: { isOpen: false },
      isCreateFolderModalOpen: false,
      isRenameFolderModalOpen: false,
      isRenameFileModalOpen: false,
      isImportModalOpen: false,
      isCopyPasteSettingsModalOpen: false,
      isCreateAlbumModalOpen: false,
      isCreateAlbumGroupModalOpen: false,
      isRenameAlbumModalOpen: false,
      panoramaModalState: { isOpen: false },
      hdrModalState: { isOpen: false },
      negativeModalState: { isOpen: false },
      denoiseModalState: { isOpen: false },
      cullingModalState: { isOpen: false },
      collageModalState: { isOpen: false },
      setUI: vi.fn(),
    })),
  }),
}));

describe('useAndroidBackHandler', () => {
  beforeAll(async () => {
    // useAndroidBackHandler renders through react-i18next; initialize the
    // instance so useTranslation does not emit NO_I18NEXT_INSTANCE warnings.
    await i18n.init();
  });

  beforeEach(() => {
    delete (window as any).__handleAndroidBack;
    (useSettingsStore as any).mockImplementation((selector?: (s: any) => any) => {
      const state = { osPlatform: 'android' };
      return selector ? selector(state) : state;
    });
    (useSettingsStore.getState as any).mockReturnValue({ osPlatform: 'android' });
    (useUIStore.getState as any).mockReturnValue({
      confirmModalState: { isOpen: false },
      isCreateFolderModalOpen: false,
      isRenameFolderModalOpen: false,
      isRenameFileModalOpen: false,
      isImportModalOpen: false,
      isCopyPasteSettingsModalOpen: false,
      isCreateAlbumModalOpen: false,
      isCreateAlbumGroupModalOpen: false,
      isRenameAlbumModalOpen: false,
      panoramaModalState: { isOpen: false },
      hdrModalState: { isOpen: false },
      negativeModalState: { isOpen: false },
      denoiseModalState: { isOpen: false },
      cullingModalState: { isOpen: false },
      collageModalState: { isOpen: false },
      setUI: vi.fn(),
    });
  });

  afterEach(() => {
    delete (window as any).__handleAndroidBack;
  });

  it('registers __handleAndroidBack on Android', async () => {
    renderHook(() => useAndroidBackHandler());
    await waitFor(() => {
      expect(typeof (window as any).__handleAndroidBack).toBe('function');
    });
  });

  it('does not register on non-Android', async () => {
    (useSettingsStore as any).mockImplementation((selector?: (s: any) => any) => {
      const state = { osPlatform: 'windows' };
      return selector ? selector(state) : state;
    });
    renderHook(() => useAndroidBackHandler());
    await new Promise((r) => setTimeout(r, 10));
    expect((window as any).__handleAndroidBack).toBeUndefined();
  });

  it('closes confirm modal when open', async () => {
    const setUI = vi.fn();
    const { result } = renderHook(() => useAndroidBackHandler());
    await waitFor(() => {
      expect(typeof (window as any).__handleAndroidBack).toBe('function');
    });
    (useUIStore.getState as any).mockReturnValue({
      confirmModalState: { isOpen: true },
      isCreateFolderModalOpen: false,
      isRenameFolderModalOpen: false,
      isRenameFileModalOpen: false,
      isImportModalOpen: false,
      isCopyPasteSettingsModalOpen: false,
      isCreateAlbumModalOpen: false,
      isCreateAlbumGroupModalOpen: false,
      isRenameAlbumModalOpen: false,
      panoramaModalState: { isOpen: false },
      hdrModalState: { isOpen: false },
      negativeModalState: { isOpen: false },
      denoiseModalState: { isOpen: false },
      cullingModalState: { isOpen: false },
      collageModalState: { isOpen: false },
      setUI,
    });
    (window as any).__handleAndroidBack();
    expect(setUI).toHaveBeenCalled();
  });

  it('dispatches Escape on no modal open', async () => {
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');
    const { result } = renderHook(() => useAndroidBackHandler());
    await waitFor(() => {
      expect(typeof (window as any).__handleAndroidBack).toBe('function');
    });
    (window as any).__handleAndroidBack();
    expect(dispatchEvent).toHaveBeenCalledWith(expect.any(KeyboardEvent));
  });
});
