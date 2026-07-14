import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExportSettings } from '../useExportSettings';
import {
  WatermarkAnchor,
  type ExportPreset,
  FileFormats,
} from '../../components/ui/ExportImportProperties';

describe('useExportSettings', () => {
  describe('返回值结构', () => {
    it('返回所有预期的状态字段和 setter 函数', () => {
      const { result } = renderHook(() => useExportSettings());

      const keys = Object.keys(result.current);
      const expectedKeys = [
        'fileFormat',
        'setFileFormat',
        'jpegQuality',
        'setJpegQuality',
        'enableResize',
        'setEnableResize',
        'resizeMode',
        'setResizeMode',
        'resizeValue',
        'setResizeValue',
        'dontEnlarge',
        'setDontEnlarge',
        'keepMetadata',
        'setKeepMetadata',
        'preserveTimestamps',
        'setPreserveTimestamps',
        'stripGps',
        'setStripGps',
        'exportMasks',
        'setExportMasks',
        'preserveFolders',
        'setPreserveFolders',
        'filenameTemplate',
        'setFilenameTemplate',
        'enableWatermark',
        'setEnableWatermark',
        'watermarkPath',
        'setWatermarkPath',
        'watermarkAnchor',
        'setWatermarkAnchor',
        'watermarkScale',
        'setWatermarkScale',
        'watermarkSpacing',
        'setWatermarkSpacing',
        'watermarkOpacity',
        'setWatermarkOpacity',
        'handleApplyPreset',
        'currentSettingsObject',
      ];

      expect(keys).toEqual(expect.arrayContaining(expectedKeys));
      expect(keys.length).toBe(expectedKeys.length);
    });

    it('所有 setter 都是函数', () => {
      const { result } = renderHook(() => useExportSettings());

      expect(typeof result.current.setFileFormat).toBe('function');
      expect(typeof result.current.setJpegQuality).toBe('function');
      expect(typeof result.current.setEnableResize).toBe('function');
      expect(typeof result.current.setResizeMode).toBe('function');
      expect(typeof result.current.setResizeValue).toBe('function');
      expect(typeof result.current.setDontEnlarge).toBe('function');
      expect(typeof result.current.setKeepMetadata).toBe('function');
      expect(typeof result.current.setPreserveTimestamps).toBe('function');
      expect(typeof result.current.setStripGps).toBe('function');
      expect(typeof result.current.setExportMasks).toBe('function');
      expect(typeof result.current.setPreserveFolders).toBe('function');
      expect(typeof result.current.setFilenameTemplate).toBe('function');
      expect(typeof result.current.setEnableWatermark).toBe('function');
      expect(typeof result.current.setWatermarkPath).toBe('function');
      expect(typeof result.current.setWatermarkAnchor).toBe('function');
      expect(typeof result.current.setWatermarkScale).toBe('function');
      expect(typeof result.current.setWatermarkSpacing).toBe('function');
      expect(typeof result.current.setWatermarkOpacity).toBe('function');
      expect(typeof result.current.handleApplyPreset).toBe('function');
    });

    it('currentSettingsObject 是一个对象', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(typeof result.current.currentSettingsObject).toBe('object');
      expect(result.current.currentSettingsObject).not.toBeNull();
    });
  });

  describe('初始状态', () => {
    it('fileFormat 默认为 jpeg', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.fileFormat).toBe('jpeg');
    });

    it('jpegQuality 默认为 90', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.jpegQuality).toBe(90);
    });

    it('enableResize 默认为 false', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.enableResize).toBe(false);
    });

    it('resizeMode 默认为 longEdge', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.resizeMode).toBe('longEdge');
    });

    it('resizeValue 默认为 2048', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.resizeValue).toBe(2048);
    });

    it('dontEnlarge 默认为 true', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.dontEnlarge).toBe(true);
    });

    it('keepMetadata 默认为 true', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.keepMetadata).toBe(true);
    });

    it('preserveTimestamps 默认为 false', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.preserveTimestamps).toBe(false);
    });

    it('stripGps 默认为 true', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.stripGps).toBe(true);
    });

    it('exportMasks 默认为 false', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.exportMasks).toBe(false);
    });

    it('preserveFolders 默认为 false', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.preserveFolders).toBe(false);
    });

    it('filenameTemplate 默认为 {original_filename}_edited', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.filenameTemplate).toBe('{original_filename}_edited');
    });

    it('enableWatermark 默认为 false', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.enableWatermark).toBe(false);
    });

    it('watermarkPath 默认为 null', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.watermarkPath).toBeNull();
    });

    it('watermarkAnchor 默认为 BottomRight', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.watermarkAnchor).toBe(WatermarkAnchor.BottomRight);
    });

    it('watermarkScale 默认为 10', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.watermarkScale).toBe(10);
    });

    it('watermarkSpacing 默认为 5', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.watermarkSpacing).toBe(5);
    });

    it('watermarkOpacity 默认为 75', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.watermarkOpacity).toBe(75);
    });

    it('初始 currentSettingsObject 包含所有默认值', () => {
      const { result } = renderHook(() => useExportSettings());
      expect(result.current.currentSettingsObject).toEqual({
        fileFormat: 'jpeg',
        jpegQuality: 90,
        enableResize: false,
        resizeMode: 'longEdge',
        resizeValue: 2048,
        dontEnlarge: true,
        keepMetadata: true,
        preserveTimestamps: false,
        stripGps: true,
        exportMasks: false,
        preserveFolders: false,
        filenameTemplate: '{original_filename}_edited',
        enableWatermark: false,
        watermarkPath: null,
        watermarkAnchor: WatermarkAnchor.BottomRight,
        watermarkScale: 10,
        watermarkSpacing: 5,
        watermarkOpacity: 75,
      });
    });
  });

  describe('文件格式设置', () => {
    it('setFileFormat 更新为 png', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setFileFormat(FileFormats.Png);
      });
      expect(result.current.fileFormat).toBe('png');
      expect(result.current.currentSettingsObject.fileFormat).toBe('png');
    });

    it('setFileFormat 更新为 tiff', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setFileFormat(FileFormats.Tiff);
      });
      expect(result.current.fileFormat).toBe('tiff');
    });

    it('setFileFormat 更新为 webp', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setFileFormat(FileFormats.Webp);
      });
      expect(result.current.fileFormat).toBe('webp');
    });

    it('setFileFormat 更新为 jxl', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setFileFormat(FileFormats.Jxl);
      });
      expect(result.current.fileFormat).toBe('jxl');
    });

    it('setFileFormat 更新为 avif', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setFileFormat(FileFormats.Avif);
      });
      expect(result.current.fileFormat).toBe('avif');
    });

    it('可以多次切换文件格式', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setFileFormat('png');
      });
      expect(result.current.fileFormat).toBe('png');
      act(() => {
        result.current.setFileFormat('tiff');
      });
      expect(result.current.fileFormat).toBe('tiff');
      act(() => {
        result.current.setFileFormat('jpeg');
      });
      expect(result.current.fileFormat).toBe('jpeg');
    });
  });

  describe('导出质量设置', () => {
    it('setJpegQuality 更新质量值', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setJpegQuality(80);
      });
      expect(result.current.jpegQuality).toBe(80);
      expect(result.current.currentSettingsObject.jpegQuality).toBe(80);
    });

    it('setJpegQuality 设置为最低值 0', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setJpegQuality(0);
      });
      expect(result.current.jpegQuality).toBe(0);
    });

    it('setJpegQuality 设置为最高值 100', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setJpegQuality(100);
      });
      expect(result.current.jpegQuality).toBe(100);
    });

    it('setJpegQuality 设置为小数', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setJpegQuality(85.5);
      });
      expect(result.current.jpegQuality).toBe(85.5);
    });
  });

  describe('导出尺寸设置', () => {
    it('setEnableResize 启用调整大小', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setEnableResize(true);
      });
      expect(result.current.enableResize).toBe(true);
      expect(result.current.currentSettingsObject.enableResize).toBe(true);
    });

    it('setEnableResize 禁用调整大小', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setEnableResize(true);
      });
      act(() => {
        result.current.setEnableResize(false);
      });
      expect(result.current.enableResize).toBe(false);
    });

    it('setResizeMode 设置为 shortEdge', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setResizeMode('shortEdge');
      });
      expect(result.current.resizeMode).toBe('shortEdge');
    });

    it('setResizeValue 更新尺寸值', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setResizeValue(1024);
      });
      expect(result.current.resizeValue).toBe(1024);
    });

    it('setResizeValue 设置为极小值', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setResizeValue(1);
      });
      expect(result.current.resizeValue).toBe(1);
    });

    it('setResizeValue 设置为极大值', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setResizeValue(10000);
      });
      expect(result.current.resizeValue).toBe(10000);
    });

    it('setDontEnlarge 关闭不放大', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setDontEnlarge(false);
      });
      expect(result.current.dontEnlarge).toBe(false);
    });

    it('可以组合调整多个尺寸相关设置', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setEnableResize(true);
        result.current.setResizeMode('shortEdge');
        result.current.setResizeValue(1080);
        result.current.setDontEnlarge(false);
      });
      expect(result.current.enableResize).toBe(true);
      expect(result.current.resizeMode).toBe('shortEdge');
      expect(result.current.resizeValue).toBe(1080);
      expect(result.current.dontEnlarge).toBe(false);
    });
  });

  describe('元数据设置', () => {
    it('setKeepMetadata 关闭保留元数据', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setKeepMetadata(false);
      });
      expect(result.current.keepMetadata).toBe(false);
      expect(result.current.currentSettingsObject.keepMetadata).toBe(false);
    });

    it('setPreserveTimestamps 启用保留时间戳', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setPreserveTimestamps(true);
      });
      expect(result.current.preserveTimestamps).toBe(true);
    });

    it('setStripGps 关闭剥离 GPS 信息', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setStripGps(false);
      });
      expect(result.current.stripGps).toBe(false);
    });

    it('元数据设置可以组合使用', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setKeepMetadata(false);
        result.current.setPreserveTimestamps(true);
        result.current.setStripGps(false);
      });
      expect(result.current.keepMetadata).toBe(false);
      expect(result.current.preserveTimestamps).toBe(true);
      expect(result.current.stripGps).toBe(false);
    });
  });

  describe('导出路径和文件名模板', () => {
    it('setFilenameTemplate 更新文件名模板', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setFilenameTemplate('{sequence}_{original_filename}');
      });
      expect(result.current.filenameTemplate).toBe('{sequence}_{original_filename}');
      expect(result.current.currentSettingsObject.filenameTemplate).toBe(
        '{sequence}_{original_filename}',
      );
    });

    it('setFilenameTemplate 使用日期变量', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setFilenameTemplate('{YYYY}_{MM}_{DD}_{original_filename}');
      });
      expect(result.current.filenameTemplate).toBe('{YYYY}_{MM}_{DD}_{original_filename}');
    });

    it('setFilenameTemplate 空字符串', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setFilenameTemplate('');
      });
      expect(result.current.filenameTemplate).toBe('');
    });

    it('setPreserveFolders 启用保留文件夹结构', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setPreserveFolders(true);
      });
      expect(result.current.preserveFolders).toBe(true);
    });

    it('setExportMasks 启用导出蒙版', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setExportMasks(true);
      });
      expect(result.current.exportMasks).toBe(true);
    });
  });

  describe('水印设置', () => {
    it('setEnableWatermark 启用水印', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setEnableWatermark(true);
      });
      expect(result.current.enableWatermark).toBe(true);
      expect(result.current.currentSettingsObject.enableWatermark).toBe(true);
    });

    it('setWatermarkPath 设置水印路径', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkPath('/path/to/watermark.png');
      });
      expect(result.current.watermarkPath).toBe('/path/to/watermark.png');
    });

    it('setWatermarkPath 设置为 null', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkPath('/path/to/watermark.png');
      });
      act(() => {
        result.current.setWatermarkPath(null);
      });
      expect(result.current.watermarkPath).toBeNull();
    });

    it('setWatermarkAnchor 设置为 TopLeft', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkAnchor(WatermarkAnchor.TopLeft);
      });
      expect(result.current.watermarkAnchor).toBe(WatermarkAnchor.TopLeft);
    });

    it('setWatermarkAnchor 设置为 Center', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkAnchor(WatermarkAnchor.Center);
      });
      expect(result.current.watermarkAnchor).toBe(WatermarkAnchor.Center);
    });

    it('setWatermarkAnchor 设置为 BottomLeft', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkAnchor(WatermarkAnchor.BottomLeft);
      });
      expect(result.current.watermarkAnchor).toBe(WatermarkAnchor.BottomLeft);
    });

    it('所有水印锚点位置都可以设置', () => {
      const { result } = renderHook(() => useExportSettings());
      const anchors = Object.values(WatermarkAnchor);
      for (const anchor of anchors) {
        act(() => {
          result.current.setWatermarkAnchor(anchor);
        });
        expect(result.current.watermarkAnchor).toBe(anchor);
      }
    });

    it('setWatermarkScale 更新水印缩放', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkScale(20);
      });
      expect(result.current.watermarkScale).toBe(20);
    });

    it('setWatermarkSpacing 更新水印间距', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkSpacing(10);
      });
      expect(result.current.watermarkSpacing).toBe(10);
    });

    it('setWatermarkOpacity 更新水印不透明度', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkOpacity(50);
      });
      expect(result.current.watermarkOpacity).toBe(50);
    });

    it('setWatermarkOpacity 设置为 0（完全透明）', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkOpacity(0);
      });
      expect(result.current.watermarkOpacity).toBe(0);
    });

    it('setWatermarkOpacity 设置为 100（完全不透明）', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkOpacity(100);
      });
      expect(result.current.watermarkOpacity).toBe(100);
    });

    it('可以组合设置所有水印属性', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setEnableWatermark(true);
        result.current.setWatermarkPath('/wm.png');
        result.current.setWatermarkAnchor(WatermarkAnchor.TopRight);
        result.current.setWatermarkScale(15);
        result.current.setWatermarkSpacing(8);
        result.current.setWatermarkOpacity(60);
      });
      expect(result.current.enableWatermark).toBe(true);
      expect(result.current.watermarkPath).toBe('/wm.png');
      expect(result.current.watermarkAnchor).toBe(WatermarkAnchor.TopRight);
      expect(result.current.watermarkScale).toBe(15);
      expect(result.current.watermarkSpacing).toBe(8);
      expect(result.current.watermarkOpacity).toBe(60);
    });
  });

  describe('handleApplyPreset - 预设功能', () => {
    const mockPreset: ExportPreset = {
      id: 'test-preset',
      name: 'Test Preset',
      fileFormat: 'png',
      jpegQuality: 85,
      enableResize: true,
      resizeMode: 'shortEdge',
      resizeValue: 1024,
      dontEnlarge: false,
      keepMetadata: false,
      preserveTimestamps: true,
      stripGps: false,
      exportMasks: true,
      preserveFolders: true,
      filenameTemplate: '{sequence}',
      enableWatermark: true,
      watermarkPath: '/path/to/watermark.png',
      watermarkAnchor: WatermarkAnchor.TopLeft,
      watermarkScale: 15,
      watermarkSpacing: 8,
      watermarkOpacity: 60,
    };

    it('应用预设时所有字段正确更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.handleApplyPreset(mockPreset);
      });
      expect(result.current.fileFormat).toBe('png');
      expect(result.current.jpegQuality).toBe(85);
      expect(result.current.enableResize).toBe(true);
      expect(result.current.resizeMode).toBe('shortEdge');
      expect(result.current.resizeValue).toBe(1024);
      expect(result.current.dontEnlarge).toBe(false);
      expect(result.current.keepMetadata).toBe(false);
      expect(result.current.preserveTimestamps).toBe(true);
      expect(result.current.stripGps).toBe(false);
      expect(result.current.exportMasks).toBe(true);
      expect(result.current.preserveFolders).toBe(true);
      expect(result.current.filenameTemplate).toBe('{sequence}');
      expect(result.current.enableWatermark).toBe(true);
      expect(result.current.watermarkPath).toBe('/path/to/watermark.png');
      expect(result.current.watermarkAnchor).toBe(WatermarkAnchor.TopLeft);
      expect(result.current.watermarkScale).toBe(15);
      expect(result.current.watermarkSpacing).toBe(8);
      expect(result.current.watermarkOpacity).toBe(60);
    });

    it('应用预设后 currentSettingsObject 反映所有变化', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.handleApplyPreset(mockPreset);
      });
      expect(result.current.currentSettingsObject).toEqual({
        fileFormat: 'png',
        jpegQuality: 85,
        enableResize: true,
        resizeMode: 'shortEdge',
        resizeValue: 1024,
        dontEnlarge: false,
        keepMetadata: false,
        preserveTimestamps: true,
        stripGps: false,
        exportMasks: true,
        preserveFolders: true,
        filenameTemplate: '{sequence}',
        enableWatermark: true,
        watermarkPath: '/path/to/watermark.png',
        watermarkAnchor: WatermarkAnchor.TopLeft,
        watermarkScale: 15,
        watermarkSpacing: 8,
        watermarkOpacity: 60,
      });
    });

    it('preserveTimestamps 默认为 false 当预设中未提供时', () => {
      const presetWithoutPreserveTimestamps = {
        ...mockPreset,
      };
      delete (presetWithoutPreserveTimestamps as any).preserveTimestamps;
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setPreserveTimestamps(true);
      });
      act(() => {
        result.current.handleApplyPreset(presetWithoutPreserveTimestamps);
      });
      expect(result.current.preserveTimestamps).toBe(false);
    });

    it('exportMasks 默认为 false 当预设中未提供时', () => {
      const presetWithoutExportMasks = {
        ...mockPreset,
      };
      delete (presetWithoutExportMasks as any).exportMasks;
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setExportMasks(true);
      });
      act(() => {
        result.current.handleApplyPreset(presetWithoutExportMasks);
      });
      expect(result.current.exportMasks).toBe(false);
    });

    it('preserveFolders 默认为 false 当预设中未提供时', () => {
      const presetWithoutPreserveFolders = {
        ...mockPreset,
      };
      delete (presetWithoutPreserveFolders as any).preserveFolders;
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setPreserveFolders(true);
      });
      act(() => {
        result.current.handleApplyPreset(presetWithoutPreserveFolders);
      });
      expect(result.current.preserveFolders).toBe(false);
    });

    it('应用不同的预设值会覆盖之前的设置', () => {
      const anotherPreset: ExportPreset = {
        id: 'another-preset',
        name: 'Another Preset',
        fileFormat: 'webp',
        jpegQuality: 95,
        enableResize: false,
        resizeMode: 'longEdge',
        resizeValue: 4096,
        dontEnlarge: true,
        keepMetadata: true,
        preserveTimestamps: false,
        stripGps: true,
        exportMasks: false,
        preserveFolders: false,
        filenameTemplate: '{original_filename}',
        enableWatermark: false,
        watermarkPath: null,
        watermarkAnchor: WatermarkAnchor.BottomRight,
        watermarkScale: 10,
        watermarkSpacing: 5,
        watermarkOpacity: 75,
      };
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.handleApplyPreset(mockPreset);
      });
      act(() => {
        result.current.handleApplyPreset(anotherPreset);
      });
      expect(result.current.fileFormat).toBe('webp');
      expect(result.current.jpegQuality).toBe(95);
      expect(result.current.enableResize).toBe(false);
      expect(result.current.resizeValue).toBe(4096);
      expect(result.current.keepMetadata).toBe(true);
      expect(result.current.enableWatermark).toBe(false);
      expect(result.current.watermarkPath).toBeNull();
    });

    it('应用 TIFF 格式预设', () => {
      const tiffPreset: ExportPreset = {
        id: 'tiff-preset',
        name: 'TIFF Preset',
        fileFormat: 'tiff',
        jpegQuality: 100,
        enableResize: false,
        resizeMode: 'longEdge',
        resizeValue: 2048,
        dontEnlarge: true,
        keepMetadata: true,
        preserveTimestamps: true,
        stripGps: false,
        exportMasks: true,
        preserveFolders: true,
        filenameTemplate: '{original_filename}_export',
        enableWatermark: false,
        watermarkPath: null,
        watermarkAnchor: WatermarkAnchor.BottomRight,
        watermarkScale: 10,
        watermarkSpacing: 5,
        watermarkOpacity: 75,
      };
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.handleApplyPreset(tiffPreset);
      });
      expect(result.current.fileFormat).toBe('tiff');
      expect(result.current.keepMetadata).toBe(true);
      expect(result.current.preserveTimestamps).toBe(true);
      expect(result.current.stripGps).toBe(false);
    });
  });

  describe('currentSettingsObject - 记忆化', () => {
    it('状态不变时返回相同的对象引用', () => {
      const { result, rerender } = renderHook(() => useExportSettings());
      const firstSnapshot = result.current.currentSettingsObject;
      rerender();
      const secondSnapshot = result.current.currentSettingsObject;
      expect(firstSnapshot).toBe(secondSnapshot);
    });

    it('状态变化时返回新的对象引用', () => {
      const { result } = renderHook(() => useExportSettings());
      const firstSnapshot = result.current.currentSettingsObject;
      act(() => {
        result.current.setFileFormat('png');
      });
      const secondSnapshot = result.current.currentSettingsObject;
      expect(firstSnapshot).not.toBe(secondSnapshot);
    });

    it('fileFormat 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setFileFormat('png');
      });
      expect(result.current.currentSettingsObject.fileFormat).toBe('png');
    });

    it('jpegQuality 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setJpegQuality(80);
      });
      expect(result.current.currentSettingsObject.jpegQuality).toBe(80);
    });

    it('enableResize 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setEnableResize(true);
      });
      expect(result.current.currentSettingsObject.enableResize).toBe(true);
    });

    it('resizeMode 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setResizeMode('shortEdge');
      });
      expect(result.current.currentSettingsObject.resizeMode).toBe('shortEdge');
    });

    it('resizeValue 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setResizeValue(1024);
      });
      expect(result.current.currentSettingsObject.resizeValue).toBe(1024);
    });

    it('dontEnlarge 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setDontEnlarge(false);
      });
      expect(result.current.currentSettingsObject.dontEnlarge).toBe(false);
    });

    it('keepMetadata 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setKeepMetadata(false);
      });
      expect(result.current.currentSettingsObject.keepMetadata).toBe(false);
    });

    it('preserveTimestamps 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setPreserveTimestamps(true);
      });
      expect(result.current.currentSettingsObject.preserveTimestamps).toBe(true);
    });

    it('stripGps 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setStripGps(false);
      });
      expect(result.current.currentSettingsObject.stripGps).toBe(false);
    });

    it('exportMasks 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setExportMasks(true);
      });
      expect(result.current.currentSettingsObject.exportMasks).toBe(true);
    });

    it('preserveFolders 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setPreserveFolders(true);
      });
      expect(result.current.currentSettingsObject.preserveFolders).toBe(true);
    });

    it('filenameTemplate 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setFilenameTemplate('test_template');
      });
      expect(result.current.currentSettingsObject.filenameTemplate).toBe('test_template');
    });

    it('enableWatermark 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setEnableWatermark(true);
      });
      expect(result.current.currentSettingsObject.enableWatermark).toBe(true);
    });

    it('watermarkPath 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkPath('/new/path.png');
      });
      expect(result.current.currentSettingsObject.watermarkPath).toBe('/new/path.png');
    });

    it('watermarkAnchor 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkAnchor(WatermarkAnchor.Center);
      });
      expect(result.current.currentSettingsObject.watermarkAnchor).toBe(WatermarkAnchor.Center);
    });

    it('watermarkScale 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkScale(25);
      });
      expect(result.current.currentSettingsObject.watermarkScale).toBe(25);
    });

    it('watermarkSpacing 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkSpacing(15);
      });
      expect(result.current.currentSettingsObject.watermarkSpacing).toBe(15);
    });

    it('watermarkOpacity 变化时同步更新', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setWatermarkOpacity(30);
      });
      expect(result.current.currentSettingsObject.watermarkOpacity).toBe(30);
    });
  });

  describe('多次状态更新', () => {
    it('在一个 act 中多次更新状态', () => {
      const { result } = renderHook(() => useExportSettings());
      act(() => {
        result.current.setFileFormat('png');
        result.current.setJpegQuality(75);
        result.current.setEnableResize(true);
        result.current.setResizeValue(1920);
        result.current.setKeepMetadata(false);
      });
      expect(result.current.fileFormat).toBe('png');
      expect(result.current.jpegQuality).toBe(75);
      expect(result.current.enableResize).toBe(true);
      expect(result.current.resizeValue).toBe(1920);
      expect(result.current.keepMetadata).toBe(false);
    });

    it('多次更新后再应用预设', () => {
      const preset: ExportPreset = {
        id: 'reset-preset',
        name: 'Reset Preset',
        fileFormat: 'jpeg',
        jpegQuality: 90,
        enableResize: false,
        resizeMode: 'longEdge',
        resizeValue: 2048,
        dontEnlarge: true,
        keepMetadata: true,
        preserveTimestamps: false,
        stripGps: true,
        exportMasks: false,
        preserveFolders: false,
        filenameTemplate: '{original_filename}_edited',
        enableWatermark: false,
        watermarkPath: null,
        watermarkAnchor: WatermarkAnchor.BottomRight,
        watermarkScale: 10,
        watermarkSpacing: 5,
        watermarkOpacity: 75,
      };
      const { result } = renderHook(() => useExportSettings());

      act(() => {
        result.current.setFileFormat('webp');
        result.current.setJpegQuality(50);
        result.current.setEnableResize(true);
      });
      expect(result.current.fileFormat).toBe('webp');

      act(() => {
        result.current.handleApplyPreset(preset);
      });
      expect(result.current.fileFormat).toBe('jpeg');
      expect(result.current.jpegQuality).toBe(90);
      expect(result.current.enableResize).toBe(false);
    });
  });

  describe('独立渲染隔离', () => {
    it('不同的 hook 实例状态独立', () => {
      const { result: result1 } = renderHook(() => useExportSettings());
      const { result: result2 } = renderHook(() => useExportSettings());

      act(() => {
        result1.current.setFileFormat('png');
      });

      expect(result1.current.fileFormat).toBe('png');
      expect(result2.current.fileFormat).toBe('jpeg');
    });

    it('一个 hook 应用预设不影响另一个', () => {
      const preset: ExportPreset = {
        id: 'test-preset',
        name: 'Test Preset',
        fileFormat: 'tiff',
        jpegQuality: 95,
        enableResize: true,
        resizeMode: 'shortEdge',
        resizeValue: 1080,
        dontEnlarge: false,
        keepMetadata: false,
        preserveTimestamps: true,
        stripGps: false,
        filenameTemplate: 'custom_template',
        enableWatermark: true,
        watermarkPath: '/wm.png',
        watermarkAnchor: WatermarkAnchor.Center,
        watermarkScale: 20,
        watermarkSpacing: 10,
        watermarkOpacity: 50,
      };

      const { result: result1 } = renderHook(() => useExportSettings());
      const { result: result2 } = renderHook(() => useExportSettings());

      act(() => {
        result1.current.handleApplyPreset(preset);
      });

      expect(result1.current.fileFormat).toBe('tiff');
      expect(result2.current.fileFormat).toBe('jpeg');
      expect(result2.current.jpegQuality).toBe(90);
      expect(result2.current.enableResize).toBe(false);
    });
  });
});
