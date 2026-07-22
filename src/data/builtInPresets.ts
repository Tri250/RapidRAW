import { Adjustments, INITIAL_ADJUSTMENTS, PortraitAdjustments } from '../utils/adjustments';

type AdjustmentsWithoutPortrait = Omit<Partial<Adjustments>, 'portrait'>;

export interface BuiltInPreset {
  id: string;
  name: string;
  nameZh: string;
  type: 'portrait' | 'color' | 'ai-color' | 'combined';
  category: string;
  thumbnail?: string;
  adjustments: AdjustmentsWithoutPortrait & { portrait?: Partial<PortraitAdjustments> };
}

export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  // 人像预设
  {
    id: 'portrait-fresh',
    name: 'Fresh Skin',
    nameZh: '清新肌肤',
    type: 'portrait',
    category: '人像',
    adjustments: {
      portrait: {
        skinSmoothingStrength: 30,
        skinSmoothingDetailPreserve: 70,
        teethWhitenBrightness: 20,
        eyeBrightenAmount: 15,
      },
    },
  },
  {
    id: 'portrait-glow',
    name: 'Glow',
    nameZh: '光彩照人',
    type: 'portrait',
    category: '人像',
    adjustments: {
      portrait: {
        skinSmoothingStrength: 45,
        skinSmoothingDetailPreserve: 60,
        eyeEnlargeAmount: 20,
        eyeBrightenAmount: 25,
        teethWhitenBrightness: 30,
      },
    },
  },
  {
    id: 'portrait-slim',
    name: 'Slim Face',
    nameZh: '精致小脸',
    type: 'portrait',
    category: '人像',
    adjustments: {
      portrait: {
        faceSlimAmount: 35,
        jawAmount: -15,
      },
    },
  },
  {
    id: 'portrait-warm',
    name: 'Warm Tone',
    nameZh: '暖调人像',
    type: 'portrait',
    category: '人像',
    adjustments: {
      temperature: 15,
      saturation: 10,
      portrait: {
        skinSmoothingStrength: 25,
      },
    },
  },
  // 色彩预设
  {
    id: 'color-film',
    name: 'Film Look',
    nameZh: '胶片质感',
    type: 'color',
    category: '色彩',
    adjustments: {
      contrast: 15,
      saturation: -10,
      highlights: -20,
      shadows: 15,
      grainAmount: 25,
      grainRoughness: 40,
      vignetteAmount: -20,
    },
  },
  {
    id: 'color-cyber',
    name: 'Cyberpunk',
    nameZh: '赛博朋克',
    type: 'color',
    category: '色彩',
    adjustments: {
      contrast: 30,
      saturation: 25,
      temperature: -20,
      tint: 15,
      vibrance: 20,
    },
  },
  {
    id: 'color-vintage',
    name: 'Vintage',
    nameZh: '复古怀旧',
    type: 'color',
    category: '色彩',
    adjustments: {
      contrast: -10,
      saturation: -25,
      temperature: 20,
      vignetteAmount: -30,
      grainAmount: 30,
    },
  },
  {
    id: 'color-mono',
    name: 'B&W Classic',
    nameZh: '经典黑白',
    type: 'color',
    category: '色彩',
    adjustments: {
      saturation: -100,
      contrast: 20,
      clarity: 15,
    },
  },
  {
    id: 'color-sunset',
    name: 'Golden Hour',
    nameZh: '黄金时刻',
    type: 'color',
    category: '色彩',
    adjustments: {
      temperature: 30,
      saturation: 15,
      highlights: -10,
      shadows: 20,
      vibrance: 10,
    },
  },
  {
    id: 'color-cool',
    name: 'Cool Blue',
    nameZh: '冷调蓝',
    type: 'color',
    category: '色彩',
    adjustments: {
      temperature: -25,
      tint: -10,
      saturation: 5,
      contrast: 10,
    },
  },
  // AI色彩预设
  {
    id: 'ai-hdr',
    name: 'AI HDR',
    nameZh: 'AI高动态',
    type: 'ai-color',
    category: 'AI色彩',
    adjustments: {
      contrast: 20,
      highlights: -30,
      shadows: 40,
      clarity: 25,
      dehaze: 15,
    },
  },
  {
    id: 'ai-dreamy',
    name: 'Dreamy',
    nameZh: '梦幻柔光',
    type: 'ai-color',
    category: 'AI色彩',
    adjustments: {
      contrast: -15,
      highlights: 10,
      glowAmount: 30,
      halationAmount: 20,
      saturation: -5,
    },
  },
  // 组合预设
  {
    id: 'combined-wedding',
    name: 'Wedding',
    nameZh: '婚纱摄影',
    type: 'combined',
    category: '组合',
    adjustments: {
      exposure: 5,
      contrast: 10,
      highlights: -15,
      shadows: 20,
      temperature: 10,
      saturation: 5,
      portrait: {
        skinSmoothingStrength: 35,
        teethWhitenBrightness: 20,
      },
    },
  },
  {
    id: 'combined-street',
    name: 'Street',
    nameZh: '街头纪实',
    type: 'combined',
    category: '组合',
    adjustments: {
      contrast: 25,
      clarity: 20,
      structure: 15,
      saturation: -5,
      grainAmount: 15,
    },
  },
  // 色彩预设 - 扩展
  {
    id: 'color-teal',
    name: 'Teal & Orange',
    nameZh: '青橙电影',
    type: 'color',
    category: '色彩',
    adjustments: {
      temperature: -8,
      tint: 20,
      saturation: 10,
      vibrance: 15,
      contrast: 12,
      highlights: -10,
      shadows: 15,
    },
  },
  {
    id: 'color-pastel',
    name: 'Pastel Dream',
    nameZh: '粉彩梦境',
    type: 'color',
    category: '色彩',
    adjustments: {
      contrast: -15,
      saturation: -20,
      brightness: 10,
      highlights: -5,
      shadows: 20,
      vibrance: -10,
    },
  },
  {
    id: 'color-drama',
    name: 'High Drama',
    nameZh: '高对比戏剧',
    type: 'color',
    category: '色彩',
    adjustments: {
      contrast: 40,
      clarity: 30,
      structure: 20,
      highlights: -25,
      shadows: 30,
      vibrance: 10,
    },
  },
  {
    id: 'color-fujifilm',
    name: 'Fujifilm Classic',
    nameZh: '富士经典',
    type: 'color',
    category: '色彩',
    adjustments: {
      contrast: 8,
      saturation: -5,
      highlights: -15,
      shadows: 10,
      grainAmount: 15,
      grainRoughness: 35,
      colorGradingHighlightsHue: 30,
      colorGradingHighlightsSaturation: 5,
      colorGradingShadowsHue: 200,
      colorGradingShadowsSaturation: 5,
    },
  },
  // 人像预设 - 扩展
  {
    id: 'portrait-dramatic',
    name: 'Dramatic Portrait',
    nameZh: '戏剧人像',
    type: 'portrait',
    category: '人像',
    adjustments: {
      contrast: 25,
      clarity: 15,
      highlights: -20,
      shadows: 15,
      portrait: {
        skinSmoothingStrength: 20,
        skinSmoothingDetailPreserve: 75,
      },
    },
  },
  {
    id: 'portrait-natural',
    name: 'Natural Light',
    nameZh: '自然光人像',
    type: 'portrait',
    category: '人像',
    adjustments: {
      exposure: 3,
      contrast: 5,
      temperature: 5,
      portrait: {
        skinSmoothingStrength: 15,
        skinSmoothingDetailPreserve: 85,
      },
    },
  },
  // AI色彩预设 - 扩展
  {
    id: 'ai-clarity',
    name: 'AI Clarity',
    nameZh: 'AI清晰增强',
    type: 'ai-color',
    category: 'AI色彩',
    adjustments: {
      clarity: 35,
      structure: 25,
      dehaze: 10,
      contrast: 10,
    },
  },
  {
    id: 'ai-moody',
    name: 'Moody',
    nameZh: '情绪暗调',
    type: 'ai-color',
    category: 'AI色彩',
    adjustments: {
      contrast: 15,
      highlights: -30,
      shadows: -10,
      saturation: -15,
      vignetteAmount: -25,
      clarity: 10,
    },
  },
  // 组合预设 - 扩展
  {
    id: 'combined-landscape',
    name: 'Landscape',
    nameZh: '风景摄影',
    type: 'combined',
    category: '组合',
    adjustments: {
      contrast: 15,
      clarity: 25,
      structure: 15,
      saturation: 10,
      vibrance: 15,
      highlights: -15,
      shadows: 25,
      dehaze: 10,
    },
  },
  {
    id: 'combined-food',
    name: 'Food Photo',
    nameZh: '美食摄影',
    type: 'combined',
    category: '组合',
    adjustments: {
      brightness: 10,
      contrast: 10,
      saturation: 20,
      vibrance: 15,
      temperature: 8,
      clarity: 15,
      highlights: -10,
    },
  },
];
