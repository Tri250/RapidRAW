import { describe, it, expect } from 'vitest';
import {
  INITIAL_PORTRAIT_ADJUSTMENTS,
  INITIAL_MASK_ADJUSTMENTS,
  INITIAL_MASK_CONTAINER,
  INITIAL_ADJUSTMENTS,
  normalizeLoadedAdjustments,
  type PersonAttribute,
  type AiPatch,
  type PortraitAdjustments,
  type MaskAdjustments,
  type MaskContainer,
  type Adjustments,
} from '../../utils/adjustments';
import { Mask, SubMaskMode, type SubMask } from '../panel/right/Masks';

// ============================================================================
// 1. Portrait 人像美化模块
// ============================================================================

describe('Portrait 人像美化模块', () => {
  describe('INITIAL_PORTRAIT_ADJUSTMENTS 所有字段', () => {
    it('皮肤平滑: skinSmoothingStrength=0, skinSmoothingDetailPreserve=0', () => {
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.skinSmoothingStrength).toBe(0);
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.skinSmoothingDetailPreserve).toBe(0);
    });

    it('脸型调整: faceSlimAmount=0, jawAmount=0, foreheadAmount=0', () => {
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.faceSlimAmount).toBe(0);
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.jawAmount).toBe(0);
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.foreheadAmount).toBe(0);
    });

    it('眼部调整: eyeEnlargeAmount=0, eyeBrightenAmount=0', () => {
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.eyeEnlargeAmount).toBe(0);
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.eyeBrightenAmount).toBe(0);
    });

    it('牙齿美白: teethWhitenBrightness=0, teethWhitenDesaturate=0', () => {
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.teethWhitenBrightness).toBe(0);
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.teethWhitenDesaturate).toBe(0);
    });

    it('唇色: lipstickColor="#cc2244", lipstickOpacity=0', () => {
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.lipstickColor).toBe('#cc2244');
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.lipstickOpacity).toBe(0);
    });

    it('腮红: blushColor="#dd6688", blushOpacity=0', () => {
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.blushColor).toBe('#dd6688');
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.blushOpacity).toBe(0);
    });

    it('眉毛: eyebrowColor="#443322", eyebrowOpacity=0', () => {
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.eyebrowColor).toBe('#443322');
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.eyebrowOpacity).toBe(0);
    });

    it('头发: hairHueShift=0, hairBrightness=0', () => {
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.hairHueShift).toBe(0);
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.hairBrightness).toBe(0);
    });

    it('身体: bodySlimAmount=0, bodyHeightAmount=0, legLengthAmount=0', () => {
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.bodySlimAmount).toBe(0);
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.bodyHeightAmount).toBe(0);
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.legLengthAmount).toBe(0);
    });

    it('blemishSpots 为空数组', () => {
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.blemishSpots).toEqual([]);
    });

    it('personAttribute 默认为 "all"', () => {
      expect(INITIAL_PORTRAIT_ADJUSTMENTS.personAttribute).toBe('all');
    });
  });

  describe('PersonAttribute 类型', () => {
    it('包含所有7个有效值', () => {
      const validValues: PersonAttribute[] = [
        'single',
        'male',
        'female',
        'child',
        'elderMale',
        'elderFemale',
        'all',
      ];
      expect(validValues).toHaveLength(7);
      // 确保默认值也在有效值中
      expect(validValues).toContain(INITIAL_PORTRAIT_ADJUSTMENTS.personAttribute);
    });
  });

  describe('INITIAL_ADJUSTMENTS.portrait 独立引用', () => {
    it('修改 INITIAL_ADJUSTMENTS.portrait 不影响 INITIAL_PORTRAIT_ADJUSTMENTS', () => {
      const originalSkin = INITIAL_PORTRAIT_ADJUSTMENTS.skinSmoothingStrength;
      // INITIAL_ADJUSTMENTS.portrait 是通过 spread 创建的，应该是独立对象
      const portraitRef = INITIAL_ADJUSTMENTS.portrait;
      // 两者初始值相等
      expect(portraitRef.skinSmoothingStrength).toBe(originalSkin);
      // 但不是同一个引用
      expect(INITIAL_ADJUSTMENTS.portrait).not.toBe(INITIAL_PORTRAIT_ADJUSTMENTS);
    });
  });

  describe('normalizeLoadedAdjustments portrait 合并', () => {
    it('正确合并 portrait 子对象', () => {
      const loaded: Partial<Adjustments> = {
        portrait: {
          ...INITIAL_PORTRAIT_ADJUSTMENTS,
          skinSmoothingStrength: 42,
          lipstickOpacity: 80,
          personAttribute: 'female',
        },
      };
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      expect(result.portrait.skinSmoothingStrength).toBe(42);
      expect(result.portrait.lipstickOpacity).toBe(80);
      expect(result.portrait.personAttribute).toBe('female');
      // 未修改的字段应保留默认值
      expect(result.portrait.faceSlimAmount).toBe(0);
      expect(result.portrait.lipstickColor).toBe('#cc2244');
    });

    it('对缺失 portrait 字段的补全', () => {
      const loaded: Partial<Adjustments> = {
        portrait: {
          skinSmoothingStrength: 10,
        },
      };
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      // 提供的值被保留
      expect(result.portrait.skinSmoothingStrength).toBe(10);
      // 缺失字段被补全为默认值
      expect(result.portrait.skinSmoothingDetailPreserve).toBe(0);
      expect(result.portrait.faceSlimAmount).toBe(0);
      expect(result.portrait.lipstickColor).toBe('#cc2244');
      expect(result.portrait.blushColor).toBe('#dd6688');
      expect(result.portrait.eyebrowColor).toBe('#443322');
      expect(result.portrait.blemishSpots).toEqual([]);
      expect(result.portrait.personAttribute).toBe('all');
    });

    it('完全缺失 portrait 时补全为默认值', () => {
      const loaded: Partial<Adjustments> = {};
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      expect(result.portrait).toEqual(INITIAL_PORTRAIT_ADJUSTMENTS);
    });

    it('blemishSpots 为空数组时保留空数组', () => {
      const loaded: Partial<Adjustments> = {
        portrait: {
          ...INITIAL_PORTRAIT_ADJUSTMENTS,
        },
      };
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      expect(result.portrait.blemishSpots).toEqual([]);
    });

    it('blemishSpots 有内容时正确保留', () => {
      const spots = [{ x: 0.5, y: 0.3, radius: 10 }];
      const loaded: Partial<Adjustments> = {
        portrait: {
          ...INITIAL_PORTRAIT_ADJUSTMENTS,
          blemishSpots: spots,
        },
      };
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      expect(result.portrait.blemishSpots).toEqual(spots);
    });
  });
});

// ============================================================================
// 2. Masks 蒙版模块
// ============================================================================

describe('Masks 蒙版模块', () => {
  describe('INITIAL_MASK_ADJUSTMENTS 所有字段', () => {
    it('基础曝光调整: blacks/brightness/clarity/contrast/dehaze/exposure=0', () => {
      expect(INITIAL_MASK_ADJUSTMENTS.blacks).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.brightness).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.clarity).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.contrast).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.dehaze).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.exposure).toBe(0);
    });

    it('高光/阴影/白场: highlights/shadows/whites=0', () => {
      expect(INITIAL_MASK_ADJUSTMENTS.highlights).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.shadows).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.whites).toBe(0);
    });

    it('色彩调整: temperature/tint/saturation/vibrance/hue=0', () => {
      expect(INITIAL_MASK_ADJUSTMENTS.temperature).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.tint).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.saturation).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.vibrance).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.hue).toBe(0);
    });

    it('降噪: colorNoiseReduction/lumaNoiseReduction=0', () => {
      expect(INITIAL_MASK_ADJUSTMENTS.colorNoiseReduction).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.lumaNoiseReduction).toBe(0);
    });

    it('锐化: sharpness=0, sharpnessThreshold=15', () => {
      expect(INITIAL_MASK_ADJUSTMENTS.sharpness).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.sharpnessThreshold).toBe(15);
    });

    it('结构: structure=0', () => {
      expect(INITIAL_MASK_ADJUSTMENTS.structure).toBe(0);
    });

    it('创意效果: flareAmount/glowAmount/halationAmount=0', () => {
      expect(INITIAL_MASK_ADJUSTMENTS.flareAmount).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.glowAmount).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.halationAmount).toBe(0);
    });

    it('curves 结构完整性 - 4通道', () => {
      const channels = ['luma', 'red', 'green', 'blue'] as const;
      for (const ch of channels) {
        expect(INITIAL_MASK_ADJUSTMENTS.curves[ch]).toBeDefined();
        expect(INITIAL_MASK_ADJUSTMENTS.curves[ch]).toHaveLength(2);
        expect(INITIAL_MASK_ADJUSTMENTS.curves[ch][0]).toEqual({ x: 0, y: 0 });
        expect(INITIAL_MASK_ADJUSTMENTS.curves[ch][1]).toEqual({ x: 255, y: 255 });
      }
    });

    it('hsl 8色结构完整性', () => {
      const colors = ['reds', 'oranges', 'yellows', 'greens', 'aquas', 'blues', 'purples', 'magentas'] as const;
      for (const color of colors) {
        expect(INITIAL_MASK_ADJUSTMENTS.hsl[color]).toBeDefined();
        expect(INITIAL_MASK_ADJUSTMENTS.hsl[color]).toEqual({ hue: 0, saturation: 0, luminance: 0 });
      }
      expect(Object.keys(INITIAL_MASK_ADJUSTMENTS.hsl)).toHaveLength(8);
    });

    it('colorGrading 4区结构完整性', () => {
      const zones = ['shadows', 'midtones', 'highlights', 'global'] as const;
      for (const zone of zones) {
        expect(INITIAL_MASK_ADJUSTMENTS.colorGrading[zone]).toBeDefined();
        expect(INITIAL_MASK_ADJUSTMENTS.colorGrading[zone]).toEqual({ hue: 0, saturation: 0, luminance: 0 });
      }
      expect(INITIAL_MASK_ADJUSTMENTS.colorGrading.balance).toBe(0);
      expect(INITIAL_MASK_ADJUSTMENTS.colorGrading.blending).toBe(50);
    });

    it('curveMode 默认为 "point"', () => {
      expect(INITIAL_MASK_ADJUSTMENTS.curveMode).toBe('point');
    });
  });

  describe('INITIAL_MASK_CONTAINER', () => {
    it('adjustments 指向 INITIAL_MASK_ADJUSTMENTS', () => {
      expect(INITIAL_MASK_CONTAINER.adjustments).toBe(INITIAL_MASK_ADJUSTMENTS);
    });

    it('invert 默认为 false', () => {
      expect(INITIAL_MASK_CONTAINER.invert).toBe(false);
    });

    it('name 默认为 "New Mask"', () => {
      expect(INITIAL_MASK_CONTAINER.name).toBe('New Mask');
    });

    it('opacity 默认为 100', () => {
      expect(INITIAL_MASK_CONTAINER.opacity).toBe(100);
    });

    it('subMasks 默认为空数组', () => {
      expect(INITIAL_MASK_CONTAINER.subMasks).toEqual([]);
    });

    it('visible 默认为 true', () => {
      expect(INITIAL_MASK_CONTAINER.visible).toBe(true);
    });
  });

  describe('normalizeLoadedAdjustments masks 数组处理', () => {
    it('对空 masks 数组返回空数组', () => {
      const loaded: Partial<Adjustments> = { masks: [] };
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      expect(result.masks).toEqual([]);
    });

    it('对缺失 masks 返回空数组', () => {
      const loaded: Partial<Adjustments> = {};
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      expect(result.masks).toEqual([]);
    });

    it('正确处理包含完整信息的 mask', () => {
      const loaded: Partial<Adjustments> = {
        masks: [
          {
            adjustments: { ...INITIAL_MASK_ADJUSTMENTS, exposure: 1.5 },
            invert: true,
            name: 'Sky Mask',
            opacity: 80,
            subMasks: [],
            visible: false,
          } as MaskContainer,
        ],
      };
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      expect(result.masks).toHaveLength(1);
      expect(result.masks[0].name).toBe('Sky Mask');
      expect(result.masks[0].invert).toBe(true);
      expect(result.masks[0].opacity).toBe(80);
      expect(result.masks[0].visible).toBe(false);
      expect(result.masks[0].adjustments.exposure).toBe(1.5);
    });

    it('对缺失的 mask adjustments 字段使用 INITIAL_MASK_ADJUSTMENTS 补全', () => {
      const loaded: Partial<Adjustments> = {
        masks: [
          {
            adjustments: { exposure: 2.0 },
            invert: false,
            name: 'Test',
            opacity: 100,
            subMasks: [],
            visible: true,
          } as any,
        ],
      };
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      expect(result.masks[0].adjustments.exposure).toBe(2.0);
      // 其他缺失字段应从 INITIAL_MASK_ADJUSTMENTS 补全
      expect(result.masks[0].adjustments.sharpnessThreshold).toBe(15);
      expect(result.masks[0].adjustments.blacks).toBe(0);
    });

    it('subMasks 默认值补全: visible=true, mode=Additive, invert=false, opacity=100', () => {
      const loaded: Partial<Adjustments> = {
        masks: [
          {
            adjustments: { ...INITIAL_MASK_ADJUSTMENTS },
            invert: false,
            name: 'Mask with sub',
            opacity: 100,
            subMasks: [
              {
                id: 'sub-1',
                type: Mask.Brush,
                // 不提供 visible, mode, invert, opacity
              } as Partial<SubMask> as any,
            ],
            visible: true,
          } as MaskContainer,
        ],
      };
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      const sub = result.masks[0].subMasks[0];
      expect(sub.visible).toBe(true);
      expect(sub.mode).toBe(SubMaskMode.Additive);
      expect(sub.invert).toBe(false);
      expect(sub.opacity).toBe(100);
    });

    it('subMasks 中显式提供的值不被覆盖', () => {
      const loaded: Partial<Adjustments> = {
        masks: [
          {
            adjustments: { ...INITIAL_MASK_ADJUSTMENTS },
            invert: false,
            name: 'Mask',
            opacity: 100,
            subMasks: [
              {
                id: 'sub-1',
                type: Mask.Linear,
                visible: false,
                mode: SubMaskMode.Subtractive,
                invert: true,
                opacity: 50,
              } as SubMask,
            ],
            visible: true,
          } as MaskContainer,
        ],
      };
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      const sub = result.masks[0].subMasks[0];
      expect(sub.visible).toBe(false);
      expect(sub.mode).toBe(SubMaskMode.Subtractive);
      expect(sub.invert).toBe(true);
      expect(sub.opacity).toBe(50);
    });

    it('多个 subMasks 都被正确补全', () => {
      const loaded: Partial<Adjustments> = {
        masks: [
          {
            adjustments: { ...INITIAL_MASK_ADJUSTMENTS },
            invert: false,
            name: 'Mask',
            opacity: 100,
            subMasks: [
              { id: 's1', type: Mask.Brush } as Partial<SubMask> as any,
              { id: 's2', type: Mask.Radial, invert: true } as Partial<SubMask> as any,
            ],
            visible: true,
          } as MaskContainer,
        ],
      };
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      expect(result.masks[0].subMasks).toHaveLength(2);
      // s1: 全部使用默认值
      expect(result.masks[0].subMasks[0].visible).toBe(true);
      expect(result.masks[0].subMasks[0].mode).toBe(SubMaskMode.Additive);
      expect(result.masks[0].subMasks[0].invert).toBe(false);
      expect(result.masks[0].subMasks[0].opacity).toBe(100);
      // s2: invert=true 已提供，其他用默认值
      expect(result.masks[0].subMasks[1].visible).toBe(true);
      expect(result.masks[0].subMasks[1].mode).toBe(SubMaskMode.Additive);
      expect(result.masks[0].subMasks[1].invert).toBe(true);
      expect(result.masks[0].subMasks[1].opacity).toBe(100);
    });
  });
});

// ============================================================================
// 3. AI 模块
// ============================================================================

describe('AI 模块', () => {
  describe('INITIAL_ADJUSTMENTS.aiPatches', () => {
    it('默认为空数组', () => {
      expect(INITIAL_ADJUSTMENTS.aiPatches).toEqual([]);
    });
  });

  describe('AiPatch 接口字段', () => {
    it('包含所有必需字段: id, isLoading, invert, name, patchData, prompt, subMasks, visible', () => {
      const patch: AiPatch = {
        id: 'test-id',
        isLoading: false,
        invert: false,
        name: 'Test Patch',
        patchData: null,
        prompt: 'remove background',
        subMasks: [],
        visible: true,
      };
      // 验证字段存在且有正确类型
      expect(typeof patch.id).toBe('string');
      expect(typeof patch.isLoading).toBe('boolean');
      expect(typeof patch.invert).toBe('boolean');
      expect(typeof patch.name).toBe('string');
      expect(patch.patchData).toBeNull();
      expect(typeof patch.prompt).toBe('string');
      expect(Array.isArray(patch.subMasks)).toBe(true);
      expect(typeof patch.visible).toBe('boolean');
    });
  });

  describe('MaskType 分类枚举', () => {
    it('Mask 枚举包含所有 AI 相关蒙版类型', () => {
      expect(Mask.AiSubject).toBe('ai-subject');
      expect(Mask.AiForeground).toBe('ai-foreground');
      expect(Mask.AiSky).toBe('ai-sky');
    });

    it('Mask 枚举包含所有手动工具类型', () => {
      expect(Mask.QuickEraser).toBe('quick-eraser');
      expect(Mask.Brush).toBe('brush');
      expect(Mask.Linear).toBe('linear');
      expect(Mask.Radial).toBe('radial');
      expect(Mask.Clone).toBe('clone');
      expect(Mask.Heal).toBe('heal');
    });

    it('Mask 枚举包含范围选择类型', () => {
      expect(Mask.Color).toBe('color');
      expect(Mask.Luminance).toBe('luminance');
    });

    it('Mask 枚举包含全图类型', () => {
      expect(Mask.All).toBe('all');
    });

    it('Mask 枚举还包含深度和流动类型', () => {
      expect(Mask.AiDepth).toBe('ai-depth');
      expect(Mask.Flow).toBe('flow');
    });

    it('Mask 枚举覆盖全部12个值', () => {
      const allMaskValues = Object.values(Mask);
      expect(allMaskValues).toHaveLength(14);
      const expectedValues = [
        'ai-depth', 'ai-foreground', 'ai-sky', 'ai-subject',
        'all', 'brush', 'flow', 'color', 'linear', 'luminance',
        'quick-eraser', 'radial', 'clone', 'heal',
      ];
      for (const val of expectedValues) {
        expect(allMaskValues).toContain(val);
      }
    });
  });

  describe('normalizeLoadedAdjustments 对 aiPatches 的处理', () => {
    it('aiPatches 的 subMasks 被正确补全', () => {
      const loaded: Partial<Adjustments> = {
        aiPatches: [
          {
            id: 'patch-1',
            isLoading: false,
            invert: false,
            name: 'AI Patch',
            patchData: null,
            prompt: 'enhance sky',
            subMasks: [
              { id: 's1', type: Mask.Brush } as Partial<SubMask> as any,
            ],
          } as any,
        ],
      };
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      expect(result.aiPatches).toHaveLength(1);
      // visible 默认补全为 true
      expect(result.aiPatches[0].visible).toBe(true);
      // subMasks 被补全
      expect(result.aiPatches[0].subMasks[0].visible).toBe(true);
      expect(result.aiPatches[0].subMasks[0].mode).toBe(SubMaskMode.Additive);
      expect(result.aiPatches[0].subMasks[0].invert).toBe(false);
      expect(result.aiPatches[0].subMasks[0].opacity).toBe(100);
    });

    it('缺失 aiPatches 时返回空数组', () => {
      const loaded: Partial<Adjustments> = {};
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      expect(result.aiPatches).toEqual([]);
    });

    it('aiPatches 中显式提供的 visible 不被覆盖', () => {
      const loaded: Partial<Adjustments> = {
        aiPatches: [
          {
            id: 'p1',
            visible: false,
            subMasks: [],
          } as any,
        ],
      };
      const result = normalizeLoadedAdjustments(loaded as Adjustments);
      expect(result.aiPatches[0].visible).toBe(false);
    });
  });
});
