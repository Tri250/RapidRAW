import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProductivityActions } from '../useProductivityActions';
import { Invokes } from '../../components/ui/AppProperties';
import { useUIStore } from '../../store/useUIStore';

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

vi.mock('../../store/useUIStore', () => ({
  useUIStore: vi.fn(),
}));

const createUIState = (overrides: any = {}) => {
  const state = {
    panoramaModalState: {
      error: null,
      finalImageBase64: null,
      isOpen: false,
      isProcessing: false,
      progressMessage: '',
      stitchingSourcePaths: [] as string[],
    },
    hdrModalState: {
      error: null,
      finalImageBase64: null,
      isOpen: false,
      isProcessing: false,
      progressMessage: '',
      stitchingSourcePaths: [] as string[],
    },
    denoiseModalState: {
      isOpen: false,
      isProcessing: false,
      previewBase64: null,
      originalBase64: null,
      error: null,
      targetPaths: [] as string[],
      progressMessage: null,
      isRaw: false,
    },
    setUI: vi.fn((updater: any) => {
      const newState = typeof updater === 'function' ? updater(state) : updater;
      Object.assign(state, newState);
      if (newState.panoramaModalState) {
        state.panoramaModalState = { ...state.panoramaModalState, ...newState.panoramaModalState };
      }
      if (newState.hdrModalState) {
        state.hdrModalState = { ...state.hdrModalState, ...newState.hdrModalState };
      }
      if (newState.denoiseModalState) {
        state.denoiseModalState = { ...state.denoiseModalState, ...newState.denoiseModalState };
      }
    }),
    ...overrides,
  };
  return state;
};

describe('useProductivityActions', () => {
  let uiState: ReturnType<typeof createUIState>;
  const mockRefreshImageList = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    uiState = createUIState();

    vi.mocked(useUIStore).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(uiState);
      return uiState;
    });
    (useUIStore as any).getState = () => uiState;
    (useUIStore as any).setState = (newState: any) => {
      Object.assign(uiState, newState);
    };

    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    mockRefreshImageList.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('hook 返回值结构', () => {
    it('返回所有预期的函数', () => {
      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      const keys = Object.keys(result.current);
      const expectedKeys = [
        'handleStartPanorama',
        'handleSavePanorama',
        'handleStartHdr',
        'handleSaveHdr',
        'handleApplyDenoise',
        'handleBatchDenoise',
        'handleSaveDenoisedImage',
        'handleSaveCollage',
      ];

      expect(keys).toEqual(expect.arrayContaining(expectedKeys));
      expect(keys.length).toBe(expectedKeys.length);
    });

    it('所有返回值都是函数类型', () => {
      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      expect(typeof result.current.handleStartPanorama).toBe('function');
      expect(typeof result.current.handleSavePanorama).toBe('function');
      expect(typeof result.current.handleStartHdr).toBe('function');
      expect(typeof result.current.handleSaveHdr).toBe('function');
      expect(typeof result.current.handleApplyDenoise).toBe('function');
      expect(typeof result.current.handleBatchDenoise).toBe('function');
      expect(typeof result.current.handleSaveDenoisedImage).toBe('function');
      expect(typeof result.current.handleSaveCollage).toBe('function');
    });
  });

  describe('handleStartPanorama - 开始全景图拼接', () => {
    it('设置处理状态并调用 StitchPanorama', () => {
      const testPaths = ['/img1.jpg', '/img2.jpg'];

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      act(() => {
        result.current.handleStartPanorama(testPaths);
      });

      expect(uiState.panoramaModalState.isProcessing).toBe(true);
      expect(uiState.panoramaModalState.error).toBeNull();
      expect(uiState.panoramaModalState.finalImageBase64).toBeNull();
      expect(uiState.panoramaModalState.progressMessage).toBe('Starting panorama process...');
      expect(mockInvoke).toHaveBeenCalledWith(Invokes.StitchPanorama, { paths: testPaths });
    });

    it('调用失败时设置错误状态', async () => {
      const testError = new Error('Panorama stitching failed');
      mockInvoke.mockRejectedValueOnce(testError);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      act(() => {
        result.current.handleStartPanorama(['/img1.jpg']);
      });

      await waitFor(() => {
        expect(uiState.panoramaModalState.isProcessing).toBe(false);
        expect(uiState.panoramaModalState.error).toBe(String(testError));
      });
    });

    it('处理空路径数组', () => {
      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      act(() => {
        result.current.handleStartPanorama([]);
      });

      expect(uiState.panoramaModalState.isProcessing).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith(Invokes.StitchPanorama, { paths: [] });
    });

    it('处理单张图片路径', () => {
      const singlePath = ['/single.jpg'];
      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      act(() => {
        result.current.handleStartPanorama(singlePath);
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.StitchPanorama, { paths: singlePath });
    });

    it('开始处理前清除之前的错误', () => {
      uiState.panoramaModalState.error = 'Previous error';
      uiState.panoramaModalState.finalImageBase64 = 'previous-base64';

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      act(() => {
        result.current.handleStartPanorama(['/img1.jpg']);
      });

      expect(uiState.panoramaModalState.error).toBeNull();
      expect(uiState.panoramaModalState.finalImageBase64).toBeNull();
    });
  });

  describe('handleSavePanorama - 保存全景图', () => {
    it('成功保存全景图并刷新图片列表', async () => {
      const savedPath = '/output/panorama.jpg';
      mockInvoke.mockResolvedValueOnce(savedPath);
      uiState.panoramaModalState.stitchingSourcePaths = ['/img1.jpg', '/img2.jpg'];

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      let resultPath: string;
      await act(async () => {
        resultPath = await result.current.handleSavePanorama();
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.SavePanorama, {
        firstPathStr: '/img1.jpg',
      });
      expect(mockRefreshImageList).toHaveBeenCalled();
      expect(resultPath!).toBe(savedPath);
    });

    it('没有源路径时抛出错误并设置错误状态', async () => {
      uiState.panoramaModalState.stitchingSourcePaths = [];

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await expect(result.current.handleSavePanorama()).rejects.toThrow(
          'Source paths for panorama not found.',
        );
      });

      expect(uiState.panoramaModalState.error).toBe('Source paths for panorama not found.');
      expect(mockInvoke).not.toHaveBeenCalledWith(Invokes.SavePanorama);
    });

    it('保存失败时设置错误状态并重新抛出', async () => {
      const testError = new Error('Save panorama failed');
      mockInvoke.mockRejectedValueOnce(testError);
      uiState.panoramaModalState.stitchingSourcePaths = ['/img1.jpg'];

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await expect(result.current.handleSavePanorama()).rejects.toThrow(testError);
      });

      expect(uiState.panoramaModalState.error).toBe(String(testError));
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to save panorama:', testError);
      consoleErrorSpy.mockRestore();
    });

    it('使用源路径数组的第一个路径', async () => {
      const paths = ['/first.jpg', '/second.jpg', '/third.jpg'];
      mockInvoke.mockResolvedValueOnce('/output.jpg');
      uiState.panoramaModalState.stitchingSourcePaths = paths;

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await result.current.handleSavePanorama();
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.SavePanorama, {
        firstPathStr: '/first.jpg',
      });
    });
  });

  describe('handleStartHdr - 开始 HDR 合并', () => {
    it('设置处理状态并调用 MergeHdr', () => {
      const testPaths = ['/img1.jpg', '/img2.jpg', '/img3.jpg'];

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      act(() => {
        result.current.handleStartHdr(testPaths);
      });

      expect(uiState.hdrModalState.isProcessing).toBe(true);
      expect(uiState.hdrModalState.error).toBeNull();
      expect(uiState.hdrModalState.finalImageBase64).toBeNull();
      expect(uiState.hdrModalState.progressMessage).toBe('Starting HDR process...');
      expect(mockInvoke).toHaveBeenCalledWith(Invokes.MergeHdr, { paths: testPaths });
    });

    it('调用失败时设置错误状态', async () => {
      const testError = new Error('HDR merge failed');
      mockInvoke.mockRejectedValueOnce(testError);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      act(() => {
        result.current.handleStartHdr(['/img1.jpg']);
      });

      await waitFor(() => {
        expect(uiState.hdrModalState.isProcessing).toBe(false);
        expect(uiState.hdrModalState.error).toBe(String(testError));
      });
    });

    it('处理空路径数组', () => {
      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      act(() => {
        result.current.handleStartHdr([]);
      });

      expect(uiState.hdrModalState.isProcessing).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith(Invokes.MergeHdr, { paths: [] });
    });

    it('开始处理前清除之前的错误', () => {
      uiState.hdrModalState.error = 'Previous error';
      uiState.hdrModalState.finalImageBase64 = 'previous-base64';

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      act(() => {
        result.current.handleStartHdr(['/img1.jpg']);
      });

      expect(uiState.hdrModalState.error).toBeNull();
      expect(uiState.hdrModalState.finalImageBase64).toBeNull();
    });
  });

  describe('handleSaveHdr - 保存 HDR 图像', () => {
    it('成功保存 HDR 图像并刷新图片列表', async () => {
      const savedPath = '/output/hdr.jpg';
      mockInvoke.mockResolvedValueOnce(savedPath);
      uiState.hdrModalState.stitchingSourcePaths = ['/img1.jpg', '/img2.jpg'];

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      let resultPath: string;
      await act(async () => {
        resultPath = await result.current.handleSaveHdr();
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.SaveHdr, {
        firstPathStr: '/img1.jpg',
      });
      expect(mockRefreshImageList).toHaveBeenCalled();
      expect(resultPath!).toBe(savedPath);
    });

    it('没有源路径时抛出错误并设置错误状态', async () => {
      uiState.hdrModalState.stitchingSourcePaths = [];

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await expect(result.current.handleSaveHdr()).rejects.toThrow(
          'Source paths for HDR not found.',
        );
      });

      expect(uiState.hdrModalState.error).toBe('Source paths for HDR not found.');
      expect(mockInvoke).not.toHaveBeenCalledWith(Invokes.SaveHdr);
    });

    it('保存失败时设置错误状态并重新抛出', async () => {
      const testError = new Error('Save HDR failed');
      mockInvoke.mockRejectedValueOnce(testError);
      uiState.hdrModalState.stitchingSourcePaths = ['/img1.jpg'];

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await expect(result.current.handleSaveHdr()).rejects.toThrow(testError);
      });

      expect(uiState.hdrModalState.error).toBe(String(testError));
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to save HDR image:', testError);
      consoleErrorSpy.mockRestore();
    });

    it('使用源路径数组的第一个路径', async () => {
      const paths = ['/first.jpg', '/second.jpg'];
      mockInvoke.mockResolvedValueOnce('/output.jpg');
      uiState.hdrModalState.stitchingSourcePaths = paths;

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await result.current.handleSaveHdr();
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.SaveHdr, {
        firstPathStr: '/first.jpg',
      });
    });
  });

  describe('handleApplyDenoise - 应用降噪', () => {
    it('成功应用降噪并设置处理状态', async () => {
      uiState.denoiseModalState.targetPaths = ['/img1.jpg'];
      mockInvoke.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await result.current.handleApplyDenoise(50, 'ai');
      });

      expect(uiState.denoiseModalState.isProcessing).toBe(true);
      expect(uiState.denoiseModalState.error).toBeNull();
      expect(uiState.denoiseModalState.progressMessage).toBe('Starting engine...');
      expect(mockInvoke).toHaveBeenCalledWith(Invokes.ApplyDenoising, {
        path: '/img1.jpg',
        intensity: 50,
        method: 'ai',
      });
    });

    it('使用 bm3d 方法应用降噪', async () => {
      uiState.denoiseModalState.targetPaths = ['/img1.jpg'];
      mockInvoke.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await result.current.handleApplyDenoise(30, 'bm3d');
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.ApplyDenoising, {
        path: '/img1.jpg',
        intensity: 30,
        method: 'bm3d',
      });
    });

    it('没有目标路径时直接返回', async () => {
      uiState.denoiseModalState.targetPaths = [];

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await result.current.handleApplyDenoise(50, 'ai');
      });

      expect(mockInvoke).not.toHaveBeenCalledWith(Invokes.ApplyDenoising);
      expect(uiState.denoiseModalState.isProcessing).toBe(false);
    });

    it('应用降噪失败时设置错误状态', async () => {
      const testError = new Error('Denoise failed');
      mockInvoke.mockRejectedValueOnce(testError);
      uiState.denoiseModalState.targetPaths = ['/img1.jpg'];

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await result.current.handleApplyDenoise(50, 'ai');
      });

      await waitFor(() => {
        expect(uiState.denoiseModalState.isProcessing).toBe(false);
        expect(uiState.denoiseModalState.error).toBe(String(testError));
      });
    });

    it('使用目标路径数组的第一个路径', async () => {
      uiState.denoiseModalState.targetPaths = ['/first.jpg', '/second.jpg'];
      mockInvoke.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await result.current.handleApplyDenoise(50, 'ai');
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        Invokes.ApplyDenoising,
        expect.objectContaining({ path: '/first.jpg' }),
      );
    });

    it('强度为 0 时仍然调用降噪', async () => {
      uiState.denoiseModalState.targetPaths = ['/img1.jpg'];
      mockInvoke.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await result.current.handleApplyDenoise(0, 'ai');
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        Invokes.ApplyDenoising,
        expect.objectContaining({ intensity: 0 }),
      );
    });

    it('开始处理前清除之前的错误', async () => {
      uiState.denoiseModalState.error = 'Previous error';
      uiState.denoiseModalState.targetPaths = ['/img1.jpg'];
      mockInvoke.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await result.current.handleApplyDenoise(50, 'ai');
      });

      expect(uiState.denoiseModalState.error).toBeNull();
    });
  });

  describe('handleBatchDenoise - 批量降噪', () => {
    it('成功批量降噪并刷新图片列表', async () => {
      const savedPaths = ['/output/img1_denoised.jpg', '/output/img2_denoised.jpg'];
      mockInvoke.mockResolvedValueOnce(savedPaths);

      const testPaths = ['/img1.jpg', '/img2.jpg'];
      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      let resultPaths: string[];
      await act(async () => {
        resultPaths = await result.current.handleBatchDenoise(50, 'ai', testPaths);
      });

      expect(mockInvoke).toHaveBeenCalledWith('batch_denoise_images', {
        paths: testPaths,
        intensity: 50,
        method: 'ai',
      });
      expect(mockRefreshImageList).toHaveBeenCalled();
      expect(resultPaths!).toEqual(savedPaths);
    });

    it('使用 bm3d 方法批量降噪', async () => {
      const savedPaths = ['/output/img1.jpg'];
      mockInvoke.mockResolvedValueOnce(savedPaths);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await result.current.handleBatchDenoise(30, 'bm3d', ['/img1.jpg']);
      });

      expect(mockInvoke).toHaveBeenCalledWith('batch_denoise_images', {
        paths: ['/img1.jpg'],
        intensity: 30,
        method: 'bm3d',
      });
    });

    it('批量降噪失败时设置错误状态并重新抛出', async () => {
      const testError = new Error('Batch denoise failed');
      mockInvoke.mockRejectedValueOnce(testError);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await expect(result.current.handleBatchDenoise(50, 'ai', ['/img1.jpg'])).rejects.toThrow(
          testError,
        );
      });

      expect(uiState.denoiseModalState.error).toBe(String(testError));
      expect(mockRefreshImageList).not.toHaveBeenCalled();
    });

    it('处理空路径数组', async () => {
      mockInvoke.mockResolvedValueOnce([]);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      let resultPaths: string[];
      await act(async () => {
        resultPaths = await result.current.handleBatchDenoise(50, 'ai', []);
      });

      expect(mockInvoke).toHaveBeenCalledWith('batch_denoise_images', {
        paths: [],
        intensity: 50,
        method: 'ai',
      });
      expect(resultPaths!).toEqual([]);
    });

    it('处理单张图片路径', async () => {
      const savedPaths = ['/output/single.jpg'];
      mockInvoke.mockResolvedValueOnce(savedPaths);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      let resultPaths: string[];
      await act(async () => {
        resultPaths = await result.current.handleBatchDenoise(50, 'ai', ['/single.jpg']);
      });

      expect(resultPaths!).toEqual(savedPaths);
    });

    it('强度为 0 时仍然调用批量降噪', async () => {
      mockInvoke.mockResolvedValueOnce(['/output.jpg']);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await result.current.handleBatchDenoise(0, 'ai', ['/img1.jpg']);
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        'batch_denoise_images',
        expect.objectContaining({ intensity: 0 }),
      );
    });
  });

  describe('handleSaveDenoisedImage - 保存降噪后的图像', () => {
    it('成功保存降噪图像并刷新图片列表', async () => {
      const savedPath = '/output/denoised.jpg';
      mockInvoke.mockResolvedValueOnce(savedPath);
      uiState.denoiseModalState.targetPaths = ['/img1.jpg'];

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      let resultPath: string;
      await act(async () => {
        resultPath = await result.current.handleSaveDenoisedImage();
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.SaveDenoisedImage, {
        originalPathStr: '/img1.jpg',
      });
      expect(mockRefreshImageList).toHaveBeenCalled();
      expect(resultPath!).toBe(savedPath);
    });

    it('没有目标路径时抛出错误', async () => {
      uiState.denoiseModalState.targetPaths = [];

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await expect(result.current.handleSaveDenoisedImage()).rejects.toThrow('No target path');
      });

      expect(mockInvoke).not.toHaveBeenCalledWith(Invokes.SaveDenoisedImage);
    });

    it('保存失败时抛出错误', async () => {
      const testError = new Error('Save denoised image failed');
      mockInvoke.mockRejectedValueOnce(testError);
      uiState.denoiseModalState.targetPaths = ['/img1.jpg'];

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await expect(result.current.handleSaveDenoisedImage()).rejects.toThrow(testError);
      });

      expect(mockRefreshImageList).not.toHaveBeenCalled();
    });

    it('使用目标路径数组的第一个路径', async () => {
      const savedPath = '/output.jpg';
      mockInvoke.mockResolvedValueOnce(savedPath);
      uiState.denoiseModalState.targetPaths = ['/first.jpg', '/second.jpg'];

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await result.current.handleSaveDenoisedImage();
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.SaveDenoisedImage, {
        originalPathStr: '/first.jpg',
      });
    });
  });

  describe('handleSaveCollage - 保存拼贴画', () => {
    it('成功保存拼贴画并刷新图片列表', async () => {
      const savedPath = '/output/collage.jpg';
      mockInvoke.mockResolvedValueOnce(savedPath);

      const base64Data = 'data:image/jpeg;base64,abc123';
      const firstPath = '/img1.jpg';

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      let resultPath: string;
      await act(async () => {
        resultPath = await result.current.handleSaveCollage(base64Data, firstPath);
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.SaveCollage, {
        base64Data,
        firstPathStr: firstPath,
      });
      expect(mockRefreshImageList).toHaveBeenCalled();
      expect(resultPath!).toBe(savedPath);
    });

    it('保存失败时记录错误并重新抛出', async () => {
      const testError = new Error('Save collage failed');
      mockInvoke.mockRejectedValueOnce(testError);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await expect(result.current.handleSaveCollage('base64data', '/img1.jpg')).rejects.toThrow(
          testError,
        );
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to save collage:', testError);
      expect(mockRefreshImageList).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('处理空的 base64 数据', async () => {
      const savedPath = '/output/collage.jpg';
      mockInvoke.mockResolvedValueOnce(savedPath);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      let resultPath: string;
      await act(async () => {
        resultPath = await result.current.handleSaveCollage('', '/img1.jpg');
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        Invokes.SaveCollage,
        expect.objectContaining({ base64Data: '' }),
      );
      expect(resultPath!).toBe(savedPath);
    });

    it('处理不同的路径格式', async () => {
      const savedPath = '/output/collage.png';
      mockInvoke.mockResolvedValueOnce(savedPath);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await result.current.handleSaveCollage('base64data', '/path/to/image.png');
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.SaveCollage, {
        base64Data: 'base64data',
        firstPathStr: '/path/to/image.png',
      });
    });
  });

  describe('边界情况', () => {
    it('多次调用 handleStartPanorama 时正确更新状态', () => {
      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      act(() => {
        result.current.handleStartPanorama(['/img1.jpg']);
      });

      expect(uiState.panoramaModalState.isProcessing).toBe(true);

      act(() => {
        result.current.handleStartPanorama(['/img2.jpg', '/img3.jpg']);
      });

      expect(uiState.panoramaModalState.isProcessing).toBe(true);
      expect(uiState.panoramaModalState.error).toBeNull();
    });

    it('refreshImageList 失败时 handleSavePanorama 仍然返回保存路径', async () => {
      const savedPath = '/output/panorama.jpg';
      mockInvoke.mockResolvedValueOnce(savedPath);
      mockRefreshImageList.mockRejectedValueOnce(new Error('Refresh failed'));
      uiState.panoramaModalState.stitchingSourcePaths = ['/img1.jpg'];

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await expect(result.current.handleSavePanorama()).rejects.toThrow('Refresh failed');
      });
    });

    it('refreshImageList 失败时 handleSaveHdr 仍然返回保存路径', async () => {
      const savedPath = '/output/hdr.jpg';
      mockInvoke.mockResolvedValueOnce(savedPath);
      mockRefreshImageList.mockRejectedValueOnce(new Error('Refresh failed'));
      uiState.hdrModalState.stitchingSourcePaths = ['/img1.jpg'];

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      await act(async () => {
        await expect(result.current.handleSaveHdr()).rejects.toThrow('Refresh failed');
      });
    });

    it('handleBatchDenoise 处理大量路径', async () => {
      const manyPaths = Array.from({ length: 100 }, (_, i) => `/img${i}.jpg`);
      const savedPaths = manyPaths.map((p) => p.replace('.jpg', '_denoised.jpg'));
      mockInvoke.mockResolvedValueOnce(savedPaths);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      let resultPaths: string[];
      await act(async () => {
        resultPaths = await result.current.handleBatchDenoise(50, 'ai', manyPaths);
      });

      expect(resultPaths!).toHaveLength(100);
      expect(mockInvoke).toHaveBeenCalledWith(
        'batch_denoise_images',
        expect.objectContaining({ paths: manyPaths }),
      );
    });

    it('handleSaveCollage 处理长 base64 字符串', async () => {
      const longBase64 = 'a'.repeat(10000);
      const savedPath = '/output/collage.jpg';
      mockInvoke.mockResolvedValueOnce(savedPath);

      const { result } = renderHook(() => useProductivityActions(mockRefreshImageList));

      let resultPath: string;
      await act(async () => {
        resultPath = await result.current.handleSaveCollage(longBase64, '/img1.jpg');
      });

      expect(resultPath!).toBe(savedPath);
      expect(mockInvoke).toHaveBeenCalledWith(
        Invokes.SaveCollage,
        expect.objectContaining({ base64Data: longBase64 }),
      );
    });
  });
});
