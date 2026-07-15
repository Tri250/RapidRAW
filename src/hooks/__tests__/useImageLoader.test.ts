import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { useImageLoader } from '../useImageLoader';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock('../../store/useEditorStore', () => ({
  useEditorStore: vi.fn(),
}));

vi.mock('../../store/useLibraryStore', () => ({
  useLibraryStore: vi.fn(),
}));

vi.mock('../../store/useSettingsStore', () => ({
  useSettingsStore: vi.fn(),
}));

vi.mock('../../utils/adjustments', async () => {
  const actual = await vi.importActual('../../utils/adjustments');
  return {
    ...actual,
    normalizeLoadedAdjustments: vi.fn((adjustments: any) => adjustments || actual.INITIAL_ADJUSTMENTS),
  };
});

import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { useEditorStore } from '../../store/useEditorStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Invokes } from '../../components/ui/AppProperties';
import { normalizeLoadedAdjustments, INITIAL_ADJUSTMENTS } from '../../utils/adjustments';

let editorState: any;
let libraryState: any;
let settingsState: any;
let mockSetEditor: ReturnType<typeof vi.fn>;
let mockResetHistory: ReturnType<typeof vi.fn>;
let mockSetLibrary: ReturnType<typeof vi.fn>;
let mockPatchesSentToBackend: { clear: ReturnType<typeof vi.fn> };

const createMockSelectedImage = (overrides: any = {}) => ({
  path: '/test/image.jpg',
  isReady: false,
  width: 0,
  height: 0,
  exif: null,
  isRaw: false,
  originalUrl: null,
  thumbnailUrl: '',
  ...overrides,
});

const mockMetadataResponse = {
  adjustments: {
    is_null: false,
    exposure: 0.5,
    contrast: 0.3,
  },
};

const mockLoadImageResponse = {
  width: 1920,
  height: 1080,
  exif: { Make: 'Test', Model: 'Camera' },
  is_raw: false,
  metadata: { some: 'data' },
};

const setupStoreMocks = () => {
  mockSetEditor = vi.fn((updater: any) => {
    if (typeof updater === 'function') {
      const newState = updater(editorState);
      editorState = { ...editorState, ...newState };
    } else {
      editorState = { ...editorState, ...updater };
    }
  });

  mockResetHistory = vi.fn((initialState: any) => {
    editorState = { ...editorState, history: [initialState], historyIndex: 0 };
  });

  mockSetLibrary = vi.fn((updater: any) => {
    if (typeof updater === 'function') {
      const newState = updater(libraryState);
      libraryState = { ...libraryState, ...newState };
    } else {
      libraryState = { ...libraryState, ...updater };
    }
  });

  mockPatchesSentToBackend = { clear: vi.fn() };

  editorState = {
    selectedImage: null,
    adjustments: { ...INITIAL_ADJUSTMENTS },
    histogram: null,
    waveform: null,
    finalPreviewUrl: null,
    uncroppedAdjustedPreviewUrl: null,
    originalSize: { width: 0, height: 0 },
    previewSize: { width: 0, height: 0 },
    hasRenderedFirstFrame: false,
    setEditor: mockSetEditor,
    resetHistory: mockResetHistory,
    patchesSentToBackend: mockPatchesSentToBackend,
  };

  libraryState = {
    setLibrary: mockSetLibrary,
    isViewLoading: false,
  };

  settingsState = {
    appSettings: null,
    osPlatform: 'linux',
  };

  vi.mocked(useEditorStore).mockImplementation((selector: any) => {
    if (typeof selector === 'function') {
      return selector(editorState);
    }
    return editorState;
  });

  vi.mocked(useLibraryStore).mockImplementation((selector: any) => {
    if (typeof selector === 'function') {
      return selector(libraryState);
    }
    return libraryState;
  });

  vi.mocked(useSettingsStore).mockImplementation((selector: any) => {
    if (typeof selector === 'function') {
      return selector(settingsState);
    }
    return settingsState;
  });
};

describe('useImageLoader', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setupStoreMocks();
    vi.mocked(invoke).mockResolvedValue(undefined);
    vi.mocked(normalizeLoadedAdjustments).mockImplementation((adjustments: any) => adjustments || INITIAL_ADJUSTMENTS);

    vi.mocked(useEditorStore).getState = vi.fn(() => editorState);
    vi.mocked(useSettingsStore).getState = vi.fn(() => settingsState);
    vi.mocked(useLibraryStore).getState = vi.fn(() => libraryState);

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('Hook 结构与初始状态', () => {
    it('hook 不返回任何值（副作用型 hook）', () => {
      const cachedEditStateRef = React.createRef<any>();
      const { result } = renderHook(() => useImageLoader(cachedEditStateRef));

      expect(result.current).toBeUndefined();
    });

    it('没有 selectedImage 时不触发任何加载', () => {
      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      expect(invoke).not.toHaveBeenCalled();
    });

    it('selectedImage 为 null 时 cachedEditStateRef.current 为 null', () => {
      const cachedEditStateRef = { current: 'some-value' } as any;
      renderHook(() => useImageLoader(cachedEditStateRef));

      expect(cachedEditStateRef.current).toBeNull();
    });

    it('selectedImage 存在但 isReady 为 true 时不重新加载', () => {
      editorState.selectedImage = createMockSelectedImage({ isReady: true });
      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      expect(invoke).not.toHaveBeenCalledWith(Invokes.LoadMetadata, expect.anything());
      expect(invoke).not.toHaveBeenCalledWith(Invokes.LoadImage, expect.anything());
    });

    it('selectedImage 没有 path 时不触发加载', () => {
      editorState.selectedImage = createMockSelectedImage({ path: '' });
      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe('图片元数据加载', () => {
    it('当 selectedImage 未准备好且有 path 时，先加载元数据', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(Invokes.LoadMetadata, { path: '/test/image.jpg' });
      });
    });

    it('加载元数据前清除 patchesSentToBackend', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockPatchesSentToBackend.clear).toHaveBeenCalled();
      });
    });

    it('加载元数据前调用 clear_session_caches', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('clear_session_caches');
      });
    });

    it('clear_session_caches 失败时打印警告但继续加载', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockRejectedValueOnce(new Error('cache clear failed'))
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith('Cache clear failed:', expect.any(Error));
      });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(Invokes.LoadMetadata, { path: '/test/image.jpg' });
      });
    });

    it('元数据包含 adjustments 时使用 normalizeLoadedAdjustments 处理', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(normalizeLoadedAdjustments).toHaveBeenCalledWith(mockMetadataResponse.adjustments);
      });
    });

    it('元数据 adjustments 为 is_null 时使用 INITIAL_ADJUSTMENTS', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ adjustments: { is_null: true } })
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        const adjustCalls = mockSetEditor.mock.calls.filter(
          (call: any) => call[0] && typeof call[0] === 'object' && 'adjustments' in call[0],
        );
        expect(adjustCalls.length).toBeGreaterThan(0);
        const lastAdjustCall = adjustCalls[adjustCalls.length - 1];
        expect(lastAdjustCall[0].adjustments).toBeDefined();
      });
    });

    it('加载元数据成功后调用 resetHistory', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockResetHistory).toHaveBeenCalled();
      });
    });
  });

  describe('完整图片数据加载', () => {
    it('元数据加载成功后加载完整图片数据', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(Invokes.LoadImage, { path: '/test/image.jpg' });
      });
    });

    it('加载成功后设置 originalSize', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockSetEditor).toHaveBeenCalledWith({
          originalSize: { width: 1920, height: 1080 },
        });
      });
    });

    it('没有设置 editorPreviewResolution 时 previewSize 等于 originalSize', async () => {
      editorState.selectedImage = createMockSelectedImage();
      settingsState.appSettings = null;
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockSetEditor).toHaveBeenCalledWith({
          previewSize: { width: 1920, height: 1080 },
        });
      });
    });

    it('editorPreviewResolution > 0 且宽图时，按宽度限制计算 previewSize', async () => {
      editorState.selectedImage = createMockSelectedImage();
      settingsState.appSettings = { editorPreviewResolution: 1280 };
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockSetEditor).toHaveBeenCalledWith({
          previewSize: { width: 1280, height: 720 },
        });
      });
    });

    it('editorPreviewResolution > 0 且高图时，按高度限制计算 previewSize', async () => {
      editorState.selectedImage = createMockSelectedImage();
      settingsState.appSettings = { editorPreviewResolution: 1280 };
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce({ width: 1080, height: 1920, exif: null, is_raw: false, metadata: null });

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockSetEditor).toHaveBeenCalledWith({
          previewSize: { width: 720, height: 1280 },
        });
      });
    });

    it('android 平台且无 appSettings 时默认分辨率为 1280', async () => {
      editorState.selectedImage = createMockSelectedImage();
      settingsState.appSettings = null;
      settingsState.osPlatform = 'android';
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockSetEditor).toHaveBeenCalledWith({
          previewSize: { width: 1280, height: 720 },
        });
      });
    });

    it('加载成功后更新 selectedImage 状态（isReady=true）', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        const isReadyCalls = mockSetEditor.mock.calls.filter((call: any) => {
          if (typeof call[0] !== 'function') return false;
          const result = call[0](editorState);
          return result.selectedImage?.isReady === true;
        });
        expect(isReadyCalls.length).toBeGreaterThan(0);
        const result = isReadyCalls[0][0](editorState);
        expect(result.selectedImage.isReady).toBe(true);
        expect(result.selectedImage.width).toBe(1920);
        expect(result.selectedImage.height).toBe(1080);
        expect(result.selectedImage.exif).toEqual(mockLoadImageResponse.exif);
        expect(result.selectedImage.isRaw).toBe(mockLoadImageResponse.is_raw);
        expect(result.selectedImage.metadata).toEqual(mockLoadImageResponse.metadata);
        expect(result.selectedImage.originalUrl).toBeNull();
      });
    });

    it('selectedImage 路径变化时不更新错误的图片', async () => {
      const oldPath = '/test/old.jpg';
      const differentPath = '/test/different.jpg';
      editorState.selectedImage = createMockSelectedImage({ path: oldPath });
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(Invokes.LoadMetadata, { path: oldPath });
      });

      const isReadyUpdaters = mockSetEditor.mock.calls.filter((call: any) => {
        if (typeof call[0] !== 'function') return false;
        const testState = {
          selectedImage: createMockSelectedImage({ path: differentPath }),
          adjustments: { ...INITIAL_ADJUSTMENTS },
        };
        const result = call[0](testState);
        return result.selectedImage?.isReady === true;
      });

      expect(isReadyUpdaters.length).toBe(0);
    });

    it('没有 aspectRatio 和 crop 时设置 aspectRatio', async () => {
      editorState.selectedImage = createMockSelectedImage();
      editorState.adjustments = { ...INITIAL_ADJUSTMENTS, aspectRatio: null, crop: null };
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        const aspectRatioCalls = mockSetEditor.mock.calls.filter((call: any) => {
          if (typeof call[0] !== 'function') return false;
          const testState = { ...editorState, adjustments: { ...INITIAL_ADJUSTMENTS, aspectRatio: null, crop: null } };
          const result = call[0](testState);
          return result.adjustments?.aspectRatio != null;
        });
        expect(aspectRatioCalls.length).toBeGreaterThan(0);
        const testState = { ...editorState, adjustments: { ...INITIAL_ADJUSTMENTS, aspectRatio: null, crop: null } };
        const result = aspectRatioCalls[0][0](testState);
        expect(result.adjustments.aspectRatio).toBeCloseTo(1920 / 1080);
      });
    });

    it('已有 aspectRatio 时不覆盖', async () => {
      editorState.selectedImage = createMockSelectedImage();
      const existingRatio = 1.5;
      editorState.adjustments = { ...INITIAL_ADJUSTMENTS, aspectRatio: existingRatio, crop: null };
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(Invokes.LoadImage, expect.anything());
      });

      const aspectRatioCalls = mockSetEditor.mock.calls.filter((call: any) => {
        if (typeof call[0] !== 'function') return false;
        const testState = {
          ...editorState,
          adjustments: { ...INITIAL_ADJUSTMENTS, aspectRatio: existingRatio, crop: null },
        };
        const result = call[0](testState);
        return result.adjustments?.aspectRatio !== undefined;
      });

      aspectRatioCalls.forEach((call: any) => {
        const testState = {
          ...editorState,
          adjustments: { ...INITIAL_ADJUSTMENTS, aspectRatio: existingRatio, crop: null },
        };
        const result = call[0](testState);
        expect(result.adjustments.aspectRatio).toBe(existingRatio);
      });
    });

    it('已有 crop 时不设置 aspectRatio', async () => {
      editorState.selectedImage = createMockSelectedImage();
      editorState.adjustments = {
        ...INITIAL_ADJUSTMENTS,
        aspectRatio: null,
        crop: { x: 0, y: 0, width: 100, height: 100, unit: 'px' as const },
      };
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(Invokes.LoadImage, expect.anything());
      });

      const aspectRatioCalls = mockSetEditor.mock.calls.filter((call: any) => {
        if (typeof call[0] !== 'function') return false;
        const testState = {
          ...editorState,
          adjustments: {
            ...INITIAL_ADJUSTMENTS,
            aspectRatio: null,
            crop: { x: 0, y: 0, width: 100, height: 100, unit: 'px' as const },
          },
        };
        const result = call[0](testState);
        return result.adjustments?.aspectRatio != null;
      });

      expect(aspectRatioCalls.length).toBe(0);
    });

    it('加载完成后设置 isViewLoading 为 false', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockSetLibrary).toHaveBeenCalledWith({ isViewLoading: false });
      });
    });
  });

  describe('图片尺寸验证', () => {
    it('loadImage 返回 null 时抛出错误', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(null);

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load image:', expect.any(Error));
      });

      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Image loading returned no data'));
    });

    it('width 为 undefined 时抛出错误', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce({ height: 1080, exif: null, is_raw: false, metadata: null });

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load image:', expect.any(Error));
      });

      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Invalid image dimensions'));
    });

    it('height 为 undefined 时抛出错误', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce({ width: 1920, exif: null, is_raw: false, metadata: null });

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load image:', expect.any(Error));
      });
    });

    it('width 不是数字时抛出错误', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce({ width: '1920', height: 1080, exif: null, is_raw: false, metadata: null });

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load image:', expect.any(Error));
      });
    });

    it('height 不是数字时抛出错误', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce({ width: 1920, height: '1080', exif: null, is_raw: false, metadata: null });

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load image:', expect.any(Error));
      });
    });

    it('width <= 0 时抛出错误', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce({ width: 0, height: 1080, exif: null, is_raw: false, metadata: null });

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load image:', expect.any(Error));
      });
    });

    it('height <= 0 时抛出错误', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce({ width: 1920, height: -1, exif: null, is_raw: false, metadata: null });

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load image:', expect.any(Error));
      });
    });
  });

  describe('错误处理', () => {
    it('元数据加载失败时显示错误 toast', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('metadata load failed'));

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load metadata early:', expect.any(Error));
      });

      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Failed to load image metadata'));
    });

    it('元数据加载失败时重置 selectedImage 为 null', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('metadata load failed'));

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockSetEditor).toHaveBeenCalledWith({ selectedImage: null });
      });
    });

    it('元数据加载失败时设置 isViewLoading 为 false', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('metadata load failed'));

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockSetLibrary).toHaveBeenCalledWith({ isViewLoading: false });
      });
    });

    it('图片加载失败时显示错误 toast', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockRejectedValueOnce(new Error('image load failed'));

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load image:', expect.any(Error));
      });

      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Failed to load image'));
    });

    it('图片加载失败时重置 selectedImage 为 null', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockRejectedValueOnce(new Error('image load failed'));

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockSetEditor).toHaveBeenCalledWith({ selectedImage: null });
      });
    });

    it('图片加载失败时设置 isViewLoading 为 false', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockRejectedValueOnce(new Error('image load failed'));

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockSetLibrary).toHaveBeenCalledWith({ isViewLoading: false });
      });
    });
  });

  describe('取消加载 / 清理逻辑', () => {
    it('组件卸载时取消正在进行的元数据加载', async () => {
      editorState.selectedImage = createMockSelectedImage();
      let resolveMetadata: (value: any) => void;
      const metadataPromise = new Promise((resolve) => {
        resolveMetadata = resolve;
      });
      vi.mocked(invoke).mockResolvedValueOnce(undefined).mockReturnValueOnce(metadataPromise);

      const cachedEditStateRef = React.createRef<any>();
      const { unmount } = renderHook(() => useImageLoader(cachedEditStateRef));

      unmount();

      const callCountBefore = mockSetEditor.mock.calls.length;

      await act(async () => {
        resolveMetadata!(mockMetadataResponse);
        await new Promise((r) => setTimeout(r, 50));
      });

      const newCalls = mockSetEditor.mock.calls.slice(callCountBefore);
      const adjustCalls = newCalls.filter(
        (call: any) => call[0] && typeof call[0] === 'object' && 'adjustments' in call[0],
      );
      expect(adjustCalls.length).toBe(0);
    });

    it('组件卸载时取消正在进行的图片加载', async () => {
      editorState.selectedImage = createMockSelectedImage();
      let resolveImage: (value: any) => void;
      const imagePromise = new Promise((resolve) => {
        resolveImage = resolve;
      });
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockReturnValueOnce(imagePromise);

      const cachedEditStateRef = React.createRef<any>();
      const { unmount } = renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(Invokes.LoadMetadata, expect.anything());
      });

      unmount();

      const callCountBefore = mockSetEditor.mock.calls.length;

      await act(async () => {
        resolveImage!(mockLoadImageResponse);
        await new Promise((r) => setTimeout(r, 50));
      });

      const newCalls = mockSetEditor.mock.calls.slice(callCountBefore);
      const originalSizeCalls = newCalls.filter(
        (call: any) => call[0] && typeof call[0] === 'object' && 'originalSize' in call[0],
      );
      expect(originalSizeCalls.length).toBe(0);
    });

    it('卸载后错误处理不执行', async () => {
      editorState.selectedImage = createMockSelectedImage();
      let rejectMetadata: (reason?: any) => void;
      const metadataPromise = new Promise((_resolve, reject) => {
        rejectMetadata = reject;
      });
      vi.mocked(invoke).mockResolvedValueOnce(undefined).mockReturnValueOnce(metadataPromise);

      const cachedEditStateRef = React.createRef<any>();
      const { unmount } = renderHook(() => useImageLoader(cachedEditStateRef));

      unmount();

      vi.mocked(toast.error).mockClear();

      await act(async () => {
        rejectMetadata!(new Error('test error'));
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('编辑状态缓存', () => {
    it('selectedImage 未就绪时 cachedEditStateRef.current 为 null', () => {
      editorState.selectedImage = createMockSelectedImage({ isReady: false });
      const cachedEditStateRef = { current: 'old-value' } as any;
      renderHook(() => useImageLoader(cachedEditStateRef));

      expect(cachedEditStateRef.current).toBeNull();
    });

    it('selectedImage 就绪且有 finalPreviewUrl 时缓存编辑状态', () => {
      editorState.selectedImage = createMockSelectedImage({
        isReady: true,
        width: 1920,
        height: 1080,
      });
      editorState.finalPreviewUrl = 'blob:test';
      editorState.adjustments = { ...INITIAL_ADJUSTMENTS, exposure: 0.5 };
      editorState.histogram = { luma: [1, 2, 3] };
      editorState.waveform = { data: 'test' };
      editorState.uncroppedAdjustedPreviewUrl = 'blob:uncropped';
      editorState.originalSize = { width: 1920, height: 1080 };
      editorState.previewSize = { width: 1280, height: 720 };
      editorState.hasRenderedFirstFrame = false;

      const cachedEditStateRef = { current: null } as any;
      renderHook(() => useImageLoader(cachedEditStateRef));

      expect(cachedEditStateRef.current).toEqual({
        adjustments: { ...INITIAL_ADJUSTMENTS, exposure: 0.5 },
        histogram: { luma: [1, 2, 3] },
        waveform: { data: 'test' },
        finalPreviewUrl: 'blob:test',
        uncroppedPreviewUrl: 'blob:uncropped',
        selectedImage: editorState.selectedImage,
        originalSize: { width: 1920, height: 1080 },
        previewSize: { width: 1280, height: 720 },
      });
    });

    it('wgpu 激活且图片就绪时缓存编辑状态', () => {
      editorState.selectedImage = createMockSelectedImage({
        isReady: true,
        width: 1920,
        height: 1080,
      });
      editorState.finalPreviewUrl = null;
      editorState.hasRenderedFirstFrame = true;
      settingsState.appSettings = { useWgpuRenderer: true };
      editorState.adjustments = { ...INITIAL_ADJUSTMENTS };
      editorState.histogram = null;
      editorState.waveform = null;
      editorState.uncroppedAdjustedPreviewUrl = null;
      editorState.originalSize = { width: 0, height: 0 };
      editorState.previewSize = { width: 0, height: 0 };

      const cachedEditStateRef = { current: null } as any;
      renderHook(() => useImageLoader(cachedEditStateRef));

      expect(cachedEditStateRef.current).not.toBeNull();
      expect(cachedEditStateRef.current.selectedImage).toBe(editorState.selectedImage);
    });

    it('useWgpuRenderer 为 false 且无 finalPreviewUrl 时不缓存', () => {
      editorState.selectedImage = createMockSelectedImage({
        isReady: true,
        width: 1920,
        height: 1080,
      });
      editorState.finalPreviewUrl = null;
      editorState.hasRenderedFirstFrame = true;
      settingsState.appSettings = { useWgpuRenderer: false };

      const cachedEditStateRef = { current: 'old-value' } as any;
      renderHook(() => useImageLoader(cachedEditStateRef));

      expect(cachedEditStateRef.current).toBeNull();
    });

    it('hasRenderedFirstFrame 为 false 时 wgpu 不算激活', () => {
      editorState.selectedImage = createMockSelectedImage({
        isReady: true,
        width: 1920,
        height: 1080,
      });
      editorState.finalPreviewUrl = null;
      editorState.hasRenderedFirstFrame = false;
      settingsState.appSettings = { useWgpuRenderer: true };

      const cachedEditStateRef = { current: 'old-value' } as any;
      renderHook(() => useImageLoader(cachedEditStateRef));

      expect(cachedEditStateRef.current).toBeNull();
    });

    it('selectedImage 变为 null 时清空缓存', () => {
      editorState.selectedImage = createMockSelectedImage({
        isReady: true,
        width: 1920,
        height: 1080,
      });
      editorState.finalPreviewUrl = 'blob:test';

      const cachedEditStateRef = { current: null } as any;
      const { rerender } = renderHook(() => useImageLoader(cachedEditStateRef));

      expect(cachedEditStateRef.current).not.toBeNull();

      editorState.selectedImage = null;
      rerender();

      expect(cachedEditStateRef.current).toBeNull();
    });
  });

  describe('依赖项与 effect 触发', () => {
    it('selectedImage.path 变化时重新加载', async () => {
      editorState.selectedImage = createMockSelectedImage({ path: '/test/first.jpg' });
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      const { rerender } = renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(Invokes.LoadMetadata, { path: '/test/first.jpg' });
      });

      vi.mocked(invoke).mockClear();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      editorState.selectedImage = createMockSelectedImage({ path: '/test/second.jpg' });

      rerender();

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(Invokes.LoadMetadata, { path: '/test/second.jpg' });
      });
    });

    it('selectedImage.isReady 变为 true 后不再触发加载', async () => {
      editorState.selectedImage = createMockSelectedImage({ isReady: false });
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce(mockLoadImageResponse);

      const cachedEditStateRef = React.createRef<any>();
      const { rerender } = renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(Invokes.LoadImage, expect.anything());
      });

      vi.mocked(invoke).mockClear();
      editorState.selectedImage = createMockSelectedImage({ isReady: true });

      rerender();

      expect(invoke).not.toHaveBeenCalledWith(Invokes.LoadMetadata, expect.anything());
      expect(invoke).not.toHaveBeenCalledWith(Invokes.LoadImage, expect.anything());
    });
  });

  describe('边界情况', () => {
    it('正方形图片 previewSize 计算正确', async () => {
      editorState.selectedImage = createMockSelectedImage();
      settingsState.appSettings = { editorPreviewResolution: 1000 };
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce({ width: 2000, height: 2000, exif: null, is_raw: false, metadata: null });

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockSetEditor).toHaveBeenCalledWith({
          previewSize: { width: 1000, height: 1000 },
        });
      });
    });

    it('图片尺寸小于 previewResolution 时保持原尺寸', async () => {
      editorState.selectedImage = createMockSelectedImage();
      settingsState.appSettings = { editorPreviewResolution: 1920 };
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce({ width: 800, height: 600, exif: null, is_raw: false, metadata: null });

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockSetEditor).toHaveBeenCalledWith({
          previewSize: { width: 800, height: 600 },
        });
      });
    });

    it('极小尺寸图片也能正常加载', async () => {
      editorState.selectedImage = createMockSelectedImage();
      settingsState.appSettings = { editorPreviewResolution: 1280 };
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce({ width: 10, height: 10, exif: null, is_raw: false, metadata: null });

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockSetEditor).toHaveBeenCalledWith({
          originalSize: { width: 10, height: 10 },
        });
      });
    });

    it('超大尺寸图片也能正常加载', async () => {
      editorState.selectedImage = createMockSelectedImage();
      settingsState.appSettings = { editorPreviewResolution: 2048 };
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce({ width: 10000, height: 8000, exif: null, is_raw: false, metadata: null });

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        expect(mockSetEditor).toHaveBeenCalledWith({
          originalSize: { width: 10000, height: 8000 },
        });
      });
    });

    it('RAW 图片标记正确', async () => {
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce({ ...mockLoadImageResponse, is_raw: true });

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        const rawCalls = mockSetEditor.mock.calls.filter((call: any) => {
          if (typeof call[0] !== 'function') return false;
          const result = call[0](editorState);
          return result.selectedImage?.isRaw === true;
        });
        expect(rawCalls.length).toBeGreaterThan(0);
      });
    });

    it('exif 数据正确传递', async () => {
      const testExif = { Make: 'Canon', Model: 'EOS R5', ISO: '100' };
      editorState.selectedImage = createMockSelectedImage();
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockMetadataResponse)
        .mockResolvedValueOnce({ ...mockLoadImageResponse, exif: testExif });

      const cachedEditStateRef = React.createRef<any>();
      renderHook(() => useImageLoader(cachedEditStateRef));

      await waitFor(() => {
        const exifCalls = mockSetEditor.mock.calls.filter((call: any) => {
          if (typeof call[0] !== 'function') return false;
          const result = call[0](editorState);
          return result.selectedImage?.exif === testExif;
        });
        expect(exifCalls.length).toBeGreaterThan(0);
      });
    });
  });
});
