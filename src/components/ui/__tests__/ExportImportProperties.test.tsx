import { describe, it, expect } from 'vitest';
import {
  EXPORT_TIMEOUT,
  IMPORT_TIMEOUT,
  FileFormats,
  FILE_FORMATS,
  FILENAME_VARIABLES,
  WatermarkAnchor,
  Status,
} from '../ExportImportProperties';

describe('ExportImportProperties', () => {
  describe('常量', () => {
    it('EXPORT_TIMEOUT 应为 4000', () => {
      expect(EXPORT_TIMEOUT).toBe(4000);
    });

    it('IMPORT_TIMEOUT 应为 5000', () => {
      expect(IMPORT_TIMEOUT).toBe(5000);
    });

    it('EXPORT_TIMEOUT 应为数字类型', () => {
      expect(typeof EXPORT_TIMEOUT).toBe('number');
    });

    it('IMPORT_TIMEOUT 应为数字类型', () => {
      expect(typeof IMPORT_TIMEOUT).toBe('number');
    });
  });

  describe('FileFormats 枚举', () => {
    it('包含所有预期的文件格式', () => {
      expect(FileFormats.Jpeg).toBe('jpeg');
      expect(FileFormats.Png).toBe('png');
      expect(FileFormats.Tiff).toBe('tiff');
      expect(FileFormats.Webp).toBe('webp');
      expect(FileFormats.Jxl).toBe('jxl');
      expect(FileFormats.Avif).toBe('avif');
      expect(FileFormats.Cube).toBe('cube');
    });

    it('枚举值数量应为 7', () => {
      const values = Object.values(FileFormats);
      expect(values.length).toBe(7);
    });

    it('所有枚举值都是字符串类型', () => {
      Object.values(FileFormats).forEach((value) => {
        expect(typeof value).toBe('string');
      });
    });
  });

  describe('FILE_FORMATS 数组', () => {
    it('数组长度应为 7', () => {
      expect(FILE_FORMATS.length).toBe(7);
    });

    it('每个格式都有正确的结构 (id, name, extensions)', () => {
      FILE_FORMATS.forEach((format) => {
        expect(format).toHaveProperty('id');
        expect(format).toHaveProperty('name');
        expect(format).toHaveProperty('extensions');
        expect(typeof format.id).toBe('string');
        expect(typeof format.name).toBe('string');
        expect(Array.isArray(format.extensions)).toBe(true);
        expect(format.extensions.length).toBeGreaterThan(0);
      });
    });

    it('JPEG 格式配置正确', () => {
      const jpeg = FILE_FORMATS.find((f) => f.id === FileFormats.Jpeg);
      expect(jpeg).toBeDefined();
      expect(jpeg?.name).toBe('JPEG');
      expect(jpeg?.extensions).toEqual(['jpg', 'jpeg']);
    });

    it('PNG 格式配置正确', () => {
      const png = FILE_FORMATS.find((f) => f.id === FileFormats.Png);
      expect(png).toBeDefined();
      expect(png?.name).toBe('PNG');
      expect(png?.extensions).toEqual(['png']);
    });

    it('TIFF 格式配置正确', () => {
      const tiff = FILE_FORMATS.find((f) => f.id === FileFormats.Tiff);
      expect(tiff).toBeDefined();
      expect(tiff?.name).toBe('TIFF');
      expect(tiff?.extensions).toEqual(['tiff']);
    });

    it('WebP 格式配置正确', () => {
      const webp = FILE_FORMATS.find((f) => f.id === FileFormats.Webp);
      expect(webp).toBeDefined();
      expect(webp?.name).toBe('WebP');
      expect(webp?.extensions).toEqual(['webp']);
    });

    it('JPEG XL 格式配置正确', () => {
      const jxl = FILE_FORMATS.find((f) => f.id === FileFormats.Jxl);
      expect(jxl).toBeDefined();
      expect(jxl?.name).toBe('JPEG XL');
      expect(jxl?.extensions).toEqual(['jxl']);
    });

    it('AVIF 格式配置正确', () => {
      const avif = FILE_FORMATS.find((f) => f.id === FileFormats.Avif);
      expect(avif).toBeDefined();
      expect(avif?.name).toBe('AVIF');
      expect(avif?.extensions).toEqual(['avif']);
    });

    it('CUBE LUT 格式配置正确', () => {
      const cube = FILE_FORMATS.find((f) => f.id === FileFormats.Cube);
      expect(cube).toBeDefined();
      expect(cube?.name).toBe('CUBE LUT');
      expect(cube?.extensions).toEqual(['cube']);
    });

    it('所有格式的 id 都与 FileFormats 枚举对应', () => {
      FILE_FORMATS.forEach((format) => {
        expect(Object.values(FileFormats)).toContain(format.id);
      });
    });

    it('每个格式的 extensions 数组都不为空', () => {
      FILE_FORMATS.forEach((format) => {
        expect(format.extensions.length).toBeGreaterThan(0);
        format.extensions.forEach((ext) => {
          expect(typeof ext).toBe('string');
          expect(ext.length).toBeGreaterThan(0);
        });
      });
    });

    it('格式名称不为空字符串', () => {
      FILE_FORMATS.forEach((format) => {
        expect(format.name.length).toBeGreaterThan(0);
      });
    });
  });

  describe('FILENAME_VARIABLES 数组', () => {
    it('数组长度应为 7', () => {
      expect(FILENAME_VARIABLES.length).toBe(7);
    });

    it('包含所有预期的变量', () => {
      expect(FILENAME_VARIABLES).toContain('{original_filename}');
      expect(FILENAME_VARIABLES).toContain('{sequence}');
      expect(FILENAME_VARIABLES).toContain('{YYYY}');
      expect(FILENAME_VARIABLES).toContain('{MM}');
      expect(FILENAME_VARIABLES).toContain('{DD}');
      expect(FILENAME_VARIABLES).toContain('{hh}');
      expect(FILENAME_VARIABLES).toContain('{mm}');
    });

    it('所有变量都是字符串类型', () => {
      FILENAME_VARIABLES.forEach((variable) => {
        expect(typeof variable).toBe('string');
      });
    });

    it('所有变量都以 { 开头并以 } 结尾', () => {
      FILENAME_VARIABLES.forEach((variable) => {
        expect(variable.startsWith('{')).toBe(true);
        expect(variable.endsWith('}')).toBe(true);
      });
    });

    it('变量顺序正确', () => {
      expect(FILENAME_VARIABLES[0]).toBe('{original_filename}');
      expect(FILENAME_VARIABLES[1]).toBe('{sequence}');
      expect(FILENAME_VARIABLES[2]).toBe('{YYYY}');
      expect(FILENAME_VARIABLES[3]).toBe('{MM}');
      expect(FILENAME_VARIABLES[4]).toBe('{DD}');
      expect(FILENAME_VARIABLES[5]).toBe('{hh}');
      expect(FILENAME_VARIABLES[6]).toBe('{mm}');
    });

    it('没有重复的变量', () => {
      const uniqueVariables = new Set(FILENAME_VARIABLES);
      expect(uniqueVariables.size).toBe(FILENAME_VARIABLES.length);
    });
  });

  describe('WatermarkAnchor 枚举', () => {
    it('包含所有预期的锚点位置', () => {
      expect(WatermarkAnchor.TopLeft).toBe('topLeft');
      expect(WatermarkAnchor.TopCenter).toBe('topCenter');
      expect(WatermarkAnchor.TopRight).toBe('topRight');
      expect(WatermarkAnchor.CenterLeft).toBe('centerLeft');
      expect(WatermarkAnchor.Center).toBe('center');
      expect(WatermarkAnchor.CenterRight).toBe('centerRight');
      expect(WatermarkAnchor.BottomLeft).toBe('bottomLeft');
      expect(WatermarkAnchor.BottomCenter).toBe('bottomCenter');
      expect(WatermarkAnchor.BottomRight).toBe('bottomRight');
    });

    it('枚举值数量应为 9', () => {
      const values = Object.values(WatermarkAnchor);
      expect(values.length).toBe(9);
    });

    it('所有枚举值都是字符串类型', () => {
      Object.values(WatermarkAnchor).forEach((value) => {
        expect(typeof value).toBe('string');
      });
    });

    it('包含三个顶部位置', () => {
      const topPositions = Object.values(WatermarkAnchor).filter((v) =>
        v.toLowerCase().startsWith('top'),
      );
      expect(topPositions.length).toBe(3);
    });

    it('包含三个水平中间位置（CenterLeft, Center, CenterRight）', () => {
      const centerPositions = [
        WatermarkAnchor.CenterLeft,
        WatermarkAnchor.Center,
        WatermarkAnchor.CenterRight,
      ];
      expect(centerPositions.length).toBe(3);
      centerPositions.forEach((pos) => {
        expect(Object.values(WatermarkAnchor)).toContain(pos);
      });
    });

    it('包含三个底部位置', () => {
      const bottomPositions = Object.values(WatermarkAnchor).filter((v) =>
        v.toLowerCase().startsWith('bottom'),
      );
      expect(bottomPositions.length).toBe(3);
    });
  });

  describe('Status 枚举', () => {
    it('包含所有预期的状态', () => {
      expect(Status.Cancelled).toBe('cancelled');
      expect(Status.Exporting).toBe('exporting');
      expect(Status.Error).toBe('error');
      expect(Status.Idle).toBe('idle');
      expect(Status.Importing).toBe('importing');
      expect(Status.Success).toBe('success');
    });

    it('枚举值数量应为 6', () => {
      const values = Object.values(Status);
      expect(values.length).toBe(6);
    });

    it('所有枚举值都是字符串类型', () => {
      Object.values(Status).forEach((value) => {
        expect(typeof value).toBe('string');
      });
    });

    it('包含导出相关状态', () => {
      expect(Status.Exporting).toBeDefined();
      expect(Status.Idle).toBeDefined();
      expect(Status.Success).toBeDefined();
      expect(Status.Error).toBeDefined();
      expect(Status.Cancelled).toBeDefined();
    });

    it('包含导入相关状态', () => {
      expect(Status.Importing).toBeDefined();
    });
  });

  describe('导出验证', () => {
    it('所有命名导出都存在', () => {
      const exports = {
        EXPORT_TIMEOUT,
        IMPORT_TIMEOUT,
        FileFormats,
        FILE_FORMATS,
        FILENAME_VARIABLES,
        WatermarkAnchor,
        Status,
      };

      Object.entries(exports).forEach(([key, value]) => {
        expect(value, `${key} should be defined`).toBeDefined();
        expect(value, `${key} should not be null`).not.toBeNull();
      });
    });

    it('FileFormats 枚举值与 FILE_FORMATS 数组 id 一一对应', () => {
      const enumValues = new Set(Object.values(FileFormats));
      const arrayIds = new Set(FILE_FORMATS.map((f) => f.id));

      expect(enumValues.size).toBe(arrayIds.size);
      enumValues.forEach((value) => {
        expect(arrayIds.has(value)).toBe(true);
      });
    });
  });
});
