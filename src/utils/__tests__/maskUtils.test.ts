import { describe, it, expect, vi } from 'vitest';
import { createSubMask } from '../maskUtils';
import { Mask, SubMaskMode } from '../../components/panel/right/Masks';
import type { ImageDimensions } from '../../hooks/useImageRenderSize';
import { v4 as uuidv4 } from 'uuid';

vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-mask-id') }));

const mockUuid = vi.mocked(uuidv4);

vi.mock('i18next', () => ({
  default: {
    t: (key: string) => key,
  },
}));

const defaultDimensions: ImageDimensions = { width: 1000, height: 1000 };

describe('maskUtils', () => {
  describe('createSubMask', () => {
    describe('基础结构验证', () => {
      it('返回对象包含所有必需的 SubMask 属性', () => {
        const result = createSubMask(Mask.Radial, defaultDimensions);

        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('visible');
        expect(result).toHaveProperty('invert');
        expect(result).toHaveProperty('opacity');
        expect(result).toHaveProperty('mode');
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('type');
        expect(result).toHaveProperty('parameters');
      });

      it('id 由 uuid v4 生成', () => {
        const result = createSubMask(Mask.Radial, defaultDimensions);
        expect(result.id).toBe('test-mask-id');
      });

      it('每次调用生成不同的 id', () => {
        mockUuid.mockClear();
        mockUuid.mockReturnValueOnce('id-1');
        const result1 = createSubMask(Mask.Radial, defaultDimensions);

        mockUuid.mockReturnValueOnce('id-2');
        const result2 = createSubMask(Mask.Radial, defaultDimensions);

        expect(result1.id).toBe('id-1');
        expect(result2.id).toBe('id-2');
        expect(mockUuid).toHaveBeenCalledTimes(2);
      });

      it('默认 visible 为 true', () => {
        const result = createSubMask(Mask.Radial, defaultDimensions);
        expect(result.visible).toBe(true);
      });

      it('默认 invert 为 false', () => {
        const result = createSubMask(Mask.Radial, defaultDimensions);
        expect(result.invert).toBe(false);
      });

      it('默认 opacity 为 100', () => {
        const result = createSubMask(Mask.Radial, defaultDimensions);
        expect(result.opacity).toBe(100);
      });

      it('name 属性为字符串', () => {
        const result = createSubMask(Mask.Radial, defaultDimensions);
        expect(typeof result.name).toBe('string');
        expect(result.name).toBeTruthy();
      });
    });

    describe('mode 参数', () => {
      it('默认 mode 为 Additive', () => {
        const result = createSubMask(Mask.Radial, defaultDimensions);
        expect(result.mode).toBe(SubMaskMode.Additive);
      });

      it('支持 Subtractive 模式', () => {
        const result = createSubMask(Mask.Radial, defaultDimensions, SubMaskMode.Subtractive);
        expect(result.mode).toBe(SubMaskMode.Subtractive);
      });

      it('支持 Intersect 模式', () => {
        const result = createSubMask(Mask.Radial, defaultDimensions, SubMaskMode.Intersect);
        expect(result.mode).toBe(SubMaskMode.Intersect);
      });
    });

    describe('Mask.Radial 类型', () => {
      it('参数结构正确', () => {
        const result = createSubMask(Mask.Radial, defaultDimensions);
        expect(result.type).toBe(Mask.Radial);
        expect(result.parameters).toBeDefined();
        expect(typeof result.parameters).toBe('object');
      });

      it('默认尺寸下参数值正确', () => {
        const result = createSubMask(Mask.Radial, defaultDimensions);
        expect(result.parameters.centerX).toBe(500);
        expect(result.parameters.centerY).toBe(500);
        expect(result.parameters.radiusX).toBe(250);
        expect(result.parameters.radiusY).toBe(250);
        expect(result.parameters.rotation).toBe(0);
        expect(result.parameters.feather).toBe(0.5);
      });

      it('宽屏尺寸下参数按比例计算', () => {
        const dims: ImageDimensions = { width: 1920, height: 1080 };
        const result = createSubMask(Mask.Radial, dims);
        expect(result.parameters.centerX).toBe(960);
        expect(result.parameters.centerY).toBe(540);
        expect(result.parameters.radiusX).toBe(480);
        expect(result.parameters.radiusY).toBe(480);
      });

      it('竖屏尺寸下参数按比例计算', () => {
        const dims: ImageDimensions = { width: 1080, height: 1920 };
        const result = createSubMask(Mask.Radial, dims);
        expect(result.parameters.centerX).toBe(540);
        expect(result.parameters.centerY).toBe(960);
        expect(result.parameters.radiusX).toBe(270);
        expect(result.parameters.radiusY).toBe(270);
      });

      it('极小尺寸下参数正确', () => {
        const dims: ImageDimensions = { width: 10, height: 10 };
        const result = createSubMask(Mask.Radial, dims);
        expect(result.parameters.centerX).toBe(5);
        expect(result.parameters.centerY).toBe(5);
        expect(result.parameters.radiusX).toBe(2.5);
        expect(result.parameters.radiusY).toBe(2.5);
      });

      it('radiusY 等于 radiusX（等于 width / 4）', () => {
        const dims: ImageDimensions = { width: 800, height: 600 };
        const result = createSubMask(Mask.Radial, dims);
        expect(result.parameters.radiusY).toBe(result.parameters.radiusX);
        expect(result.parameters.radiusX).toBe(200);
      });
    });

    describe('Mask.Linear 类型', () => {
      it('参数结构正确', () => {
        const result = createSubMask(Mask.Linear, defaultDimensions);
        expect(result.type).toBe(Mask.Linear);
        expect(result.parameters).toBeDefined();
      });

      it('默认尺寸下参数值正确', () => {
        const result = createSubMask(Mask.Linear, defaultDimensions);
        expect(result.parameters.startX).toBe(250);
        expect(result.parameters.startY).toBe(500);
        expect(result.parameters.endX).toBe(750);
        expect(result.parameters.endY).toBe(500);
        expect(result.parameters.range).toBe(50);
      });

      it('宽屏尺寸下参数按比例计算', () => {
        const dims: ImageDimensions = { width: 1920, height: 1080 };
        const result = createSubMask(Mask.Linear, dims);
        expect(result.parameters.startX).toBe(480);
        expect(result.parameters.startY).toBe(540);
        expect(result.parameters.endX).toBe(1440);
        expect(result.parameters.endY).toBe(540);
      });

      it('竖屏尺寸下参数按比例计算', () => {
        const dims: ImageDimensions = { width: 1080, height: 1920 };
        const result = createSubMask(Mask.Linear, dims);
        expect(result.parameters.startX).toBe(270);
        expect(result.parameters.startY).toBe(960);
        expect(result.parameters.endX).toBe(810);
        expect(result.parameters.endY).toBe(960);
      });

      it('range 始终为 50', () => {
        const dims: ImageDimensions = { width: 200, height: 300 };
        const result = createSubMask(Mask.Linear, dims);
        expect(result.parameters.range).toBe(50);
      });

      it('渐变线水平居中', () => {
        const dims: ImageDimensions = { width: 500, height: 800 };
        const result = createSubMask(Mask.Linear, dims);
        expect(result.parameters.startY).toBe(400);
        expect(result.parameters.endY).toBe(400);
      });
    });

    describe('Mask.Brush 类型', () => {
      it('参数结构正确', () => {
        const result = createSubMask(Mask.Brush, defaultDimensions);
        expect(result.type).toBe(Mask.Brush);
        expect(result.parameters).toBeDefined();
      });

      it('lines 初始化为空数组', () => {
        const result = createSubMask(Mask.Brush, defaultDimensions);
        expect(result.parameters.lines).toEqual([]);
        expect(Array.isArray(result.parameters.lines)).toBe(true);
      });

      it('不同尺寸下参数一致', () => {
        const result1 = createSubMask(Mask.Brush, { width: 100, height: 200 });
        const result2 = createSubMask(Mask.Brush, { width: 800, height: 600 });
        expect(result1.parameters).toEqual(result2.parameters);
      });
    });

    describe('Mask.Flow 类型', () => {
      it('参数结构正确', () => {
        const result = createSubMask(Mask.Flow, defaultDimensions);
        expect(result.type).toBe(Mask.Flow);
        expect(result.parameters).toBeDefined();
      });

      it('lines 初始化为空数组', () => {
        const result = createSubMask(Mask.Flow, defaultDimensions);
        expect(result.parameters.lines).toEqual([]);
      });

      it('flow 默认值为 10', () => {
        const result = createSubMask(Mask.Flow, defaultDimensions);
        expect(result.parameters.flow).toBe(10);
      });

      it('不同尺寸下参数一致', () => {
        const result1 = createSubMask(Mask.Flow, { width: 100, height: 200 });
        const result2 = createSubMask(Mask.Flow, { width: 800, height: 600 });
        expect(result1.parameters).toEqual(result2.parameters);
      });
    });

    describe('Mask.AiSubject 类型', () => {
      it('参数结构正确', () => {
        const result = createSubMask(Mask.AiSubject, defaultDimensions);
        expect(result.type).toBe(Mask.AiSubject);
        expect(result.parameters).toBeDefined();
      });

      it('maskDataBase64 初始化为 null', () => {
        const result = createSubMask(Mask.AiSubject, defaultDimensions);
        expect(result.parameters.maskDataBase64).toBeNull();
      });

      it('grow 默认值为 0', () => {
        const result = createSubMask(Mask.AiSubject, defaultDimensions);
        expect(result.parameters.grow).toBe(0);
      });

      it('feather 默认值为 0', () => {
        const result = createSubMask(Mask.AiSubject, defaultDimensions);
        expect(result.parameters.feather).toBe(0);
      });
    });

    describe('Mask.AiForeground 类型', () => {
      it('参数结构正确', () => {
        const result = createSubMask(Mask.AiForeground, defaultDimensions);
        expect(result.type).toBe(Mask.AiForeground);
        expect(result.parameters).toBeDefined();
      });

      it('maskDataBase64 初始化为 null', () => {
        const result = createSubMask(Mask.AiForeground, defaultDimensions);
        expect(result.parameters.maskDataBase64).toBeNull();
      });

      it('grow 默认值为 0', () => {
        const result = createSubMask(Mask.AiForeground, defaultDimensions);
        expect(result.parameters.grow).toBe(0);
      });

      it('feather 默认值为 0', () => {
        const result = createSubMask(Mask.AiForeground, defaultDimensions);
        expect(result.parameters.feather).toBe(0);
      });
    });

    describe('Mask.QuickEraser 类型', () => {
      it('参数结构正确', () => {
        const result = createSubMask(Mask.QuickEraser, defaultDimensions);
        expect(result.type).toBe(Mask.QuickEraser);
        expect(result.parameters).toBeDefined();
      });

      it('maskDataBase64 初始化为 null', () => {
        const result = createSubMask(Mask.QuickEraser, defaultDimensions);
        expect(result.parameters.maskDataBase64).toBeNull();
      });

      it('grow 默认值为 50', () => {
        const result = createSubMask(Mask.QuickEraser, defaultDimensions);
        expect(result.parameters.grow).toBe(50);
      });

      it('feather 默认值为 50', () => {
        const result = createSubMask(Mask.QuickEraser, defaultDimensions);
        expect(result.parameters.feather).toBe(50);
      });
    });

    describe('默认分支类型', () => {
      const defaultBranchTypes = [
        Mask.All,
        Mask.Color,
        Mask.AiDepth,
        Mask.AiSky,
        Mask.Luminance,
        Mask.Clone,
        Mask.Heal,
      ];

      it.each(defaultBranchTypes)('Mask.%s 类型返回空 parameters 对象', (type) => {
        const result = createSubMask(type, defaultDimensions);
        expect(result.type).toBe(type);
        expect(result.parameters).toEqual({});
      });

      it('未知类型返回空 parameters 对象', () => {
        const unknownType = 'completely-unknown-type' as Mask;
        const result = createSubMask(unknownType, defaultDimensions);
        expect(result.type).toBe(unknownType);
        expect(result.parameters).toEqual({});
      });

      it('空字符串类型返回空 parameters 对象', () => {
        const emptyType = '' as Mask;
        const result = createSubMask(emptyType, defaultDimensions);
        expect(result.type).toBe(emptyType);
        expect(result.parameters).toEqual({});
      });
    });

    describe('imageDimensions 参数边界情况', () => {
      it('undefined 时使用默认尺寸 1000x1000', () => {
        const result = createSubMask(Mask.Radial, undefined as any);
        expect(result.parameters.centerX).toBe(500);
        expect(result.parameters.centerY).toBe(500);
        expect(result.parameters.radiusX).toBe(250);
      });

      it('null 时使用默认尺寸 1000x1000', () => {
        const result = createSubMask(Mask.Radial, null as any);
        expect(result.parameters.centerX).toBe(500);
        expect(result.parameters.centerY).toBe(500);
        expect(result.parameters.radiusX).toBe(250);
      });

      it('width 为 0 时的边界情况', () => {
        const dims: ImageDimensions = { width: 0, height: 1000 };
        const result = createSubMask(Mask.Radial, dims);
        expect(result.parameters.centerX).toBe(0);
        expect(result.parameters.radiusX).toBe(0);
      });

      it('height 为 0 时的边界情况', () => {
        const dims: ImageDimensions = { width: 1000, height: 0 };
        const result = createSubMask(Mask.Radial, dims);
        expect(result.parameters.centerY).toBe(0);
      });

      it('宽高均为 0 时的边界情况', () => {
        const dims: ImageDimensions = { width: 0, height: 0 };
        const result = createSubMask(Mask.Radial, dims);
        expect(result.parameters.centerX).toBe(0);
        expect(result.parameters.centerY).toBe(0);
        expect(result.parameters.radiusX).toBe(0);
        expect(result.parameters.radiusY).toBe(0);
      });

      it('负数尺寸的边界情况', () => {
        const dims: ImageDimensions = { width: -100, height: -200 };
        const result = createSubMask(Mask.Radial, dims);
        expect(result.parameters.centerX).toBe(-50);
        expect(result.parameters.centerY).toBe(-100);
        expect(result.parameters.radiusX).toBe(-25);
      });

      it('极大尺寸下参数正确', () => {
        const dims: ImageDimensions = { width: 100000, height: 50000 };
        const result = createSubMask(Mask.Radial, dims);
        expect(result.parameters.centerX).toBe(50000);
        expect(result.parameters.centerY).toBe(25000);
        expect(result.parameters.radiusX).toBe(25000);
      });

      it('小数尺寸下参数正确', () => {
        const dims: ImageDimensions = { width: 100.5, height: 200.5 };
        const result = createSubMask(Mask.Radial, dims);
        expect(result.parameters.centerX).toBe(50.25);
        expect(result.parameters.centerY).toBe(100.25);
        expect(result.parameters.radiusX).toBe(25.125);
      });
    });

    describe('mode 与 type 组合测试', () => {
      const allModes = [SubMaskMode.Additive, SubMaskMode.Subtractive, SubMaskMode.Intersect];
      const allTypes = Object.values(Mask);

      it.each(allModes)('mode %s 与所有类型组合正常工作', (mode) => {
        for (const type of allTypes) {
          const result = createSubMask(type, defaultDimensions, mode);
          expect(result.mode).toBe(mode);
          expect(result.type).toBe(type);
          expect(result.parameters).toBeDefined();
        }
      });

      it('Subtractive + Brush 组合正确', () => {
        const result = createSubMask(Mask.Brush, defaultDimensions, SubMaskMode.Subtractive);
        expect(result.mode).toBe(SubMaskMode.Subtractive);
        expect(result.type).toBe(Mask.Brush);
        expect(result.parameters.lines).toEqual([]);
      });

      it('Intersect + Flow 组合正确', () => {
        const result = createSubMask(Mask.Flow, defaultDimensions, SubMaskMode.Intersect);
        expect(result.mode).toBe(SubMaskMode.Intersect);
        expect(result.type).toBe(Mask.Flow);
        expect(result.parameters.flow).toBe(10);
      });

      it('Subtractive + QuickEraser 组合正确', () => {
        const result = createSubMask(Mask.QuickEraser, defaultDimensions, SubMaskMode.Subtractive);
        expect(result.mode).toBe(SubMaskMode.Subtractive);
        expect(result.type).toBe(Mask.QuickEraser);
        expect(result.parameters.grow).toBe(50);
        expect(result.parameters.feather).toBe(50);
      });
    });

    describe('name 属性', () => {
      it('所有 Mask 类型都有 name 属性', () => {
        for (const type of Object.values(Mask)) {
          const result = createSubMask(type, defaultDimensions);
          expect(result.name).toBeDefined();
          expect(typeof result.name).toBe('string');
          expect(result.name.length).toBeGreaterThan(0);
        }
      });

      it('Radial 类型 name 来自 i18n', () => {
        const result = createSubMask(Mask.Radial, defaultDimensions);
        expect(result.name).toBe('masks.types.radial');
      });

      it('Brush 类型 name 来自 i18n', () => {
        const result = createSubMask(Mask.Brush, defaultDimensions);
        expect(result.name).toBe('masks.types.brush');
      });

      it('未知类型 name 为首字母大写的 type 字符串', () => {
        const unknownType = 'customType' as Mask;
        const result = createSubMask(unknownType, defaultDimensions);
        expect(result.name).toBe('CustomType');
      });
    });

    describe('返回值不可变性', () => {
      it('每次调用返回新的对象实例', () => {
        const result1 = createSubMask(Mask.Radial, defaultDimensions);
        const result2 = createSubMask(Mask.Radial, defaultDimensions);
        expect(result1).not.toBe(result2);
      });

      it('每次调用返回新的 parameters 对象', () => {
        const result1 = createSubMask(Mask.Radial, defaultDimensions);
        const result2 = createSubMask(Mask.Radial, defaultDimensions);
        expect(result1.parameters).not.toBe(result2.parameters);
      });

      it('修改返回值不影响后续调用', () => {
        const result1 = createSubMask(Mask.Brush, defaultDimensions);
        result1.parameters.lines.push([{ x: 0, y: 0 }]);

        const result2 = createSubMask(Mask.Brush, defaultDimensions);
        expect(result2.parameters.lines).toEqual([]);
      });
    });

    describe('类型完整性', () => {
      it('支持的 Mask 枚举值数量与 switch 分支一致', () => {
        const handledTypes = [
          Mask.Radial,
          Mask.Linear,
          Mask.Brush,
          Mask.Flow,
          Mask.AiSubject,
          Mask.AiForeground,
          Mask.QuickEraser,
        ];

        const allTypes = Object.values(Mask);
        const defaultTypes = allTypes.filter(t => !handledTypes.includes(t));

        for (const type of handledTypes) {
          const result = createSubMask(type, defaultDimensions);
          expect(Object.keys(result.parameters).length).toBeGreaterThan(0);
        }

        for (const type of defaultTypes) {
          const result = createSubMask(type, defaultDimensions);
          expect(result.parameters).toEqual({});
        }
      });

      it('SubMaskMode 包含所有三种模式', () => {
        expect(Object.values(SubMaskMode)).toHaveLength(3);
        expect(SubMaskMode.Additive).toBeDefined();
        expect(SubMaskMode.Subtractive).toBeDefined();
        expect(SubMaskMode.Intersect).toBeDefined();
      });
    });
  });
});
