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
  // 风景预设
  {
    id: 'landscape-vivid',
    name: 'Vivid Landscape',
    nameZh: '鲜艳风景',
    type: 'color',
    category: '风景',
    adjustments: {
      vibrance: 30,
      saturation: 15,
      clarity: 20,
      dehaze: 10,
      shadows: 15,
    },
  },
  {
    id: 'landscape-misty',
    name: 'Misty Mountains',
    nameZh: '云雾山峦',
    type: 'color',
    category: '风景',
    adjustments: {
      dehaze: -20,
      contrast: -10,
      shadows: 30,
      highlights: -15,
      vibrance: 10,
    },
  },
  {
    id: 'landscape-autumn',
    name: 'Autumn Warmth',
    nameZh: '金秋暖色',
    type: 'color',
    category: '风景',
    adjustments: {
      temperature: 25,
      saturation: 20,
      vibrance: 15,
      shadows: 10,
      highlights: -5,
    },
  },
  // 美食预设
  {
    id: 'food-bright',
    name: 'Food Bright',
    nameZh: '美食鲜亮',
    type: 'color',
    category: '美食',
    adjustments: {
      exposure: 5,
      contrast: 10,
      saturation: 20,
      vibrance: 15,
      highlights: -10,
      shadows: 20,
      clarity: 10,
    },
  },
  {
    id: 'food-warm',
    name: 'Food Warm',
    nameZh: '美食暖调',
    type: 'color',
    category: '美食',
    adjustments: {
      temperature: 20,
      saturation: 15,
      exposure: 3,
      contrast: 5,
      shadows: 10,
    },
  },
  // 夜景预设
  {
    id: 'night-city',
    name: 'Night City',
    nameZh: '城市夜景',
    type: 'color',
    category: '夜景',
    adjustments: {
      contrast: 25,
      highlights: -20,
      shadows: 40,
      clarity: 15,
      dehaze: 10,
      vibrance: 10,
    },
  },
  {
    id: 'night-neon',
    name: 'Neon Glow',
    nameZh: '霓虹灯光',
    type: 'color',
    category: '夜景',
    adjustments: {
      contrast: 30,
      saturation: 30,
      temperature: -15,
      tint: 20,
      vibrance: 20,
      highlights: -10,
      shadows: 25,
    },
  },
  // 建筑预设
  {
    id: 'arch-sharp',
    name: 'Architecture Sharp',
    nameZh: '建筑锐利',
    type: 'color',
    category: '建筑',
    adjustments: {
      contrast: 20,
      clarity: 30,
      structure: 20,
      dehaze: 10,
      highlights: -15,
      shadows: 15,
    },
  },
  {
    id: 'arch-minimal',
    name: 'Minimal B&W',
    nameZh: '极简黑白',
    type: 'color',
    category: '建筑',
    adjustments: {
      saturation: -100,
      contrast: 30,
      clarity: 20,
      highlights: -10,
      shadows: 10,
    },
  },
];
