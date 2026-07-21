const STRING_MAP_ZH: Record<string, string> = {
  'section_color_gading': '色彩调级',
  'section_color_grading': '色彩调级',
  'section_details': '细节调整',
  'section_effects': '效果',
  'section_base': '基础调整',
  'param_filter': '滤镜',
  'param_saturation': '饱和度',
  'param_hue': '色相',
  'param_tone_curve': '色调曲线',
  'param_contrast': '对比度',
  'param_contrast_highlight': '高光对比',
  'param_contrast_shadow': '阴影对比',
  'param_sharpness': '锐度',
  'param_brightness': '亮度',
  'param_clarity': '清晰度',
  'param_grain': '颗粒',
  'param_grain_size': '颗粒大小',
  'param_soft_light': '柔光',
  'param_warm_cool': '冷暖',
  'param_cyan_magenta': '青品',
  'param_vignette': '暗角',
  'param_exposure': '曝光',
  'param_highlights': '高光',
  'param_shadows': '阴影',
  'param_whites': '白色',
  'param_blacks': '黑色',
  'param_temperature': '色温',
  'param_tint': '色调',
};

const STRING_MAP_EN: Record<string, string> = {
  'section_color_grading': 'Color Grading',
  'section_details': 'Details',
  'section_effects': 'Effects',
  'section_base': 'Base',
  'param_filter': 'Filter',
  'param_saturation': 'Saturation',
  'param_hue': 'Hue',
  'param_tone_curve': 'Tone Curve',
  'param_contrast': 'Contrast',
  'param_contrast_highlight': 'Highlight Contrast',
  'param_contrast_shadow': 'Shadow Contrast',
  'param_sharpness': 'Sharpness',
  'param_brightness': 'Brightness',
  'param_clarity': 'Clarity',
  'param_grain': 'Grain',
  'param_grain_size': 'Grain Size',
  'param_soft_light': 'Soft Light',
  'param_warm_cool': 'Warm/Cool',
  'param_cyan_magenta': 'Cyan/Magenta',
  'param_vignette': 'Vignette',
  'param_exposure': 'Exposure',
  'param_highlights': 'Highlights',
  'param_shadows': 'Shadows',
  'param_whites': 'Whites',
  'param_blacks': 'Blacks',
  'param_temperature': 'Temperature',
  'param_tint': 'Tint',
};

export function resolvePresetString(ref: string, locale: string = 'zh'): string {
  if (!ref.startsWith('@string/')) return ref;
  const key = ref.replace('@string/', '');
  const map = locale === 'zh' ? STRING_MAP_ZH : STRING_MAP_EN;
  return map[key] || ref;
}

export function resolvePresetItem(item: { label?: string; value?: string; [k: string]: unknown }, locale?: string): { label?: string; value?: string; [k: string]: unknown } {
  return {
    ...item,
    label: item.label ? resolvePresetString(item.label, locale) : item.label,
    value: item.value ? resolvePresetString(item.value as string, locale) : item.value,
  };
}

export function resolvePresetSection(section: { title?: string; items?: Array<{ label?: string; value?: string; [k: string]: unknown }>; [k: string]: unknown }, locale?: string) {
  return {
    ...section,
    title: section.title ? resolvePresetString(section.title, locale) : section.title,
    items: section.items?.map(item => resolvePresetItem(item, locale)),
  };
}
