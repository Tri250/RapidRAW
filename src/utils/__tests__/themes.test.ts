import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  THEMES,
  DEFAULT_THEME_ID,
  LIGHT_THEME_IDS,
  getThemeById,
  applyTheme,
  isLightTheme,
  hexToRgb,
  rgbToString,
  ThemeProps,
} from '../themes';
import { Theme } from '../../components/ui/AppProperties';

const REQUIRED_CSS_VARIABLES = [
  '--app-bg-primary',
  '--app-bg-secondary',
  '--app-surface',
  '--app-card-active',
  '--app-button-text',
  '--app-text-primary',
  '--app-text-secondary',
  '--app-accent',
  '--app-border-color',
  '--app-hover-color',
];

const EXPECTED_THEME_IDS = [
  Theme.DeepSpaceBlack,
  Theme.Dark,
  Theme.Light,
  Theme.Grey,
  Theme.Snow,
  Theme.Arctic,
  Theme.Blue,
  Theme.MutedGreen,
  Theme.Sepia,
];

describe('Theme 枚举', () => {
  it('包含所有预期的主题 id', () => {
    const themeValues = Object.values(Theme);
    expect(themeValues.length).toBe(EXPECTED_THEME_IDS.length);
    EXPECTED_THEME_IDS.forEach((id) => {
      expect(themeValues).toContain(id);
    });
  });
});

describe('THEMES 数组', () => {
  it('是一个非空数组', () => {
    expect(Array.isArray(THEMES)).toBe(true);
    expect(THEMES.length).toBeGreaterThan(0);
  });

  it('包含 9 个主题', () => {
    expect(THEMES.length).toBe(9);
  });

  it('每个主题都有 id, name, splashImage, cssVariables 字段', () => {
    THEMES.forEach((theme) => {
      expect(theme).toHaveProperty('id');
      expect(theme).toHaveProperty('name');
      expect(theme).toHaveProperty('splashImage');
      expect(theme).toHaveProperty('cssVariables');
      expect(typeof theme.id).toBe('string');
      expect(typeof theme.name).toBe('string');
      expect(typeof theme.splashImage).toBe('string');
      expect(typeof theme.cssVariables).toBe('object');
      expect(theme.cssVariables).not.toBeNull();
    });
  });

  it('每个主题的 cssVariables 包含所有必要的 CSS 变量', () => {
    THEMES.forEach((theme) => {
      REQUIRED_CSS_VARIABLES.forEach((variable) => {
        expect(theme.cssVariables).toHaveProperty(variable);
        expect(typeof theme.cssVariables[variable]).toBe('string');
        expect(theme.cssVariables[variable].length).toBeGreaterThan(0);
      });
    });
  });

  it('包含所有预期的主题 id', () => {
    const themeIds = THEMES.map((t) => t.id);
    EXPECTED_THEME_IDS.forEach((id) => {
      expect(themeIds).toContain(id);
    });
  });

  it('所有主题 id 都是唯一的', () => {
    const themeIds = THEMES.map((t) => t.id);
    const uniqueIds = new Set(themeIds);
    expect(uniqueIds.size).toBe(themeIds.length);
  });

  it('每个主题的 name 都以 settings.themes. 开头', () => {
    THEMES.forEach((theme) => {
      expect(theme.name.startsWith('settings.themes.')).toBe(true);
    });
  });

  it('每个主题的 splashImage 都是有效的图片路径', () => {
    THEMES.forEach((theme) => {
      expect(theme.splashImage.startsWith('/')).toBe(true);
      expect(theme.splashImage.endsWith('.jpg')).toBe(true);
    });
  });

  describe('各个主题的特定属性', () => {
    it('DeepSpaceBlack 主题具有正确的属性', () => {
      const theme = THEMES.find((t) => t.id === Theme.DeepSpaceBlack);
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('settings.themes.deepSpaceBlack');
      expect(theme!.splashImage).toBe('/splash-dark.jpg');
    });

    it('Dark 主题具有正确的属性', () => {
      const theme = THEMES.find((t) => t.id === Theme.Dark);
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('settings.themes.dark');
      expect(theme!.splashImage).toBe('/splash-dark.jpg');
    });

    it('Light 主题具有正确的属性', () => {
      const theme = THEMES.find((t) => t.id === Theme.Light);
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('settings.themes.light');
      expect(theme!.splashImage).toBe('/splash-light.jpg');
    });

    it('Grey 主题具有正确的属性', () => {
      const theme = THEMES.find((t) => t.id === Theme.Grey);
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('settings.themes.grey');
      expect(theme!.splashImage).toBe('/splash-grey.jpg');
    });

    it('Snow 主题具有正确的属性', () => {
      const theme = THEMES.find((t) => t.id === Theme.Snow);
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('settings.themes.snow');
      expect(theme!.splashImage).toBe('/splash-light.jpg');
    });

    it('Arctic 主题具有正确的属性', () => {
      const theme = THEMES.find((t) => t.id === Theme.Arctic);
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('settings.themes.arctic');
      expect(theme!.splashImage).toBe('/splash-light.jpg');
    });

    it('Blue 主题具有正确的属性', () => {
      const theme = THEMES.find((t) => t.id === Theme.Blue);
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('settings.themes.blue');
      expect(theme!.splashImage).toBe('/splash-dark.jpg');
    });

    it('MutedGreen 主题具有正确的属性', () => {
      const theme = THEMES.find((t) => t.id === Theme.MutedGreen);
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('settings.themes.mutedGreen');
      expect(theme!.splashImage).toBe('/splash-dark.jpg');
    });

    it('Sepia 主题具有正确的属性', () => {
      const theme = THEMES.find((t) => t.id === Theme.Sepia);
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('settings.themes.sepia');
      expect(theme!.splashImage).toBe('/splash-dark.jpg');
    });
  });
});

describe('DEFAULT_THEME_ID', () => {
  it('等于 Theme.DeepSpaceBlack', () => {
    expect(DEFAULT_THEME_ID).toBe(Theme.DeepSpaceBlack);
  });

  it('存在于 THEMES 数组中', () => {
    const themeIds = THEMES.map((t) => t.id);
    expect(themeIds).toContain(DEFAULT_THEME_ID);
  });
});

describe('LIGHT_THEME_IDS', () => {
  it('包含 Light, Snow, Arctic 主题', () => {
    expect(LIGHT_THEME_IDS).toContain(Theme.Light);
    expect(LIGHT_THEME_IDS).toContain(Theme.Snow);
    expect(LIGHT_THEME_IDS).toContain(Theme.Arctic);
  });

  it('只包含 3 个亮色主题', () => {
    expect(LIGHT_THEME_IDS.length).toBe(3);
  });
});

describe('getThemeById', () => {
  it('返回正确的 DeepSpaceBlack 主题', () => {
    const theme = getThemeById(Theme.DeepSpaceBlack);
    expect(theme).toBeDefined();
    expect(theme.id).toBe(Theme.DeepSpaceBlack);
    expect(theme.name).toBe('settings.themes.deepSpaceBlack');
  });

  it('返回正确的 Dark 主题', () => {
    const theme = getThemeById(Theme.Dark);
    expect(theme).toBeDefined();
    expect(theme.id).toBe(Theme.Dark);
    expect(theme.name).toBe('settings.themes.dark');
  });

  it('返回正确的 Light 主题', () => {
    const theme = getThemeById(Theme.Light);
    expect(theme).toBeDefined();
    expect(theme.id).toBe(Theme.Light);
    expect(theme.name).toBe('settings.themes.light');
  });

  it('返回正确的 Grey 主题', () => {
    const theme = getThemeById(Theme.Grey);
    expect(theme).toBeDefined();
    expect(theme.id).toBe(Theme.Grey);
  });

  it('返回正确的 Snow 主题', () => {
    const theme = getThemeById(Theme.Snow);
    expect(theme).toBeDefined();
    expect(theme.id).toBe(Theme.Snow);
  });

  it('返回正确的 Arctic 主题', () => {
    const theme = getThemeById(Theme.Arctic);
    expect(theme).toBeDefined();
    expect(theme.id).toBe(Theme.Arctic);
  });

  it('返回正确的 Blue 主题', () => {
    const theme = getThemeById(Theme.Blue);
    expect(theme).toBeDefined();
    expect(theme.id).toBe(Theme.Blue);
  });

  it('返回正确的 MutedGreen 主题', () => {
    const theme = getThemeById(Theme.MutedGreen);
    expect(theme).toBeDefined();
    expect(theme.id).toBe(Theme.MutedGreen);
  });

  it('返回正确的 Sepia 主题', () => {
    const theme = getThemeById(Theme.Sepia);
    expect(theme).toBeDefined();
    expect(theme.id).toBe(Theme.Sepia);
  });

  it('对于所有主题 ID 都能返回有效的 ThemeProps 对象', () => {
    Object.values(Theme).forEach((themeId) => {
      const theme = getThemeById(themeId as Theme);
      expect(theme).toBeDefined();
      expect(theme).toHaveProperty('id');
      expect(theme).toHaveProperty('name');
      expect(theme).toHaveProperty('splashImage');
      expect(theme).toHaveProperty('cssVariables');
    });
  });

  it('无效的主题 ID 返回默认主题', () => {
    const theme = getThemeById('invalid-theme' as Theme);
    expect(theme).toBeDefined();
    expect(theme.id).toBe(DEFAULT_THEME_ID);
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
  });

  afterEach(() => {
    document.documentElement.removeAttribute('style');
  });

  it('应用 Light 主题时设置正确的 CSS 变量', () => {
    applyTheme(Theme.Light);
    const theme = getThemeById(Theme.Light);
    const rootStyle = document.documentElement.style;

    Object.entries(theme.cssVariables).forEach(([key, value]) => {
      expect(rootStyle.getPropertyValue(key)).toBe(value);
    });
  });

  it('应用 Dark 主题时设置正确的 CSS 变量', () => {
    applyTheme(Theme.Dark);
    const theme = getThemeById(Theme.Dark);
    const rootStyle = document.documentElement.style;

    Object.entries(theme.cssVariables).forEach(([key, value]) => {
      expect(rootStyle.getPropertyValue(key)).toBe(value);
    });
  });

  it('应用 DeepSpaceBlack 主题时设置正确的 CSS 变量', () => {
    applyTheme(Theme.DeepSpaceBlack);
    const theme = getThemeById(Theme.DeepSpaceBlack);
    const rootStyle = document.documentElement.style;

    Object.entries(theme.cssVariables).forEach(([key, value]) => {
      expect(rootStyle.getPropertyValue(key)).toBe(value);
    });
  });

  it('所有 CSS 变量名都正确（以 --app- 开头）', () => {
    applyTheme(Theme.Light);
    const theme = getThemeById(Theme.Light);

    Object.keys(theme.cssVariables).forEach((key) => {
      expect(key.startsWith('--app-')).toBe(true);
    });
  });

  it('切换主题时会覆盖之前的 CSS 变量', () => {
    applyTheme(Theme.Light);
    const lightTheme = getThemeById(Theme.Light);
    expect(document.documentElement.style.getPropertyValue('--app-bg-primary')).toBe(
      lightTheme.cssVariables['--app-bg-primary']
    );

    applyTheme(Theme.Dark);
    const darkTheme = getThemeById(Theme.Dark);
    expect(document.documentElement.style.getPropertyValue('--app-bg-primary')).toBe(
      darkTheme.cssVariables['--app-bg-primary']
    );
  });

  it('设置所有必需的 CSS 变量', () => {
    applyTheme(Theme.Light);
    const rootStyle = document.documentElement.style;

    REQUIRED_CSS_VARIABLES.forEach((variable) => {
      expect(rootStyle.getPropertyValue(variable).length).toBeGreaterThan(0);
    });
  });
});

describe('isLightTheme', () => {
  it('Light 主题返回 true', () => {
    expect(isLightTheme(Theme.Light)).toBe(true);
  });

  it('Snow 主题返回 true', () => {
    expect(isLightTheme(Theme.Snow)).toBe(true);
  });

  it('Arctic 主题返回 true', () => {
    expect(isLightTheme(Theme.Arctic)).toBe(true);
  });

  it('Dark 主题返回 false', () => {
    expect(isLightTheme(Theme.Dark)).toBe(false);
  });

  it('DeepSpaceBlack 主题返回 false', () => {
    expect(isLightTheme(Theme.DeepSpaceBlack)).toBe(false);
  });

  it('Grey 主题返回 false', () => {
    expect(isLightTheme(Theme.Grey)).toBe(false);
  });

  it('Blue 主题返回 false', () => {
    expect(isLightTheme(Theme.Blue)).toBe(false);
  });

  it('MutedGreen 主题返回 false', () => {
    expect(isLightTheme(Theme.MutedGreen)).toBe(false);
  });

  it('Sepia 主题返回 false', () => {
    expect(isLightTheme(Theme.Sepia)).toBe(false);
  });

  it('所有亮色主题都返回 true', () => {
    LIGHT_THEME_IDS.forEach((themeId) => {
      expect(isLightTheme(themeId)).toBe(true);
    });
  });

  it('非亮色主题都返回 false', () => {
    const nonLightThemes = Object.values(Theme).filter(
      (t) => !LIGHT_THEME_IDS.includes(t as Theme)
    );
    nonLightThemes.forEach((themeId) => {
      expect(isLightTheme(themeId as Theme)).toBe(false);
    });
  });
});

describe('hexToRgb', () => {
  it('正确转换 6 位 hex 颜色（带 #）', () => {
    const result = hexToRgb('#ff0000');
    expect(result).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('正确转换 6 位 hex 颜色（不带 #）', () => {
    const result = hexToRgb('ff0000');
    expect(result).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('正确转换绿色', () => {
    const result = hexToRgb('#00ff00');
    expect(result).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('正确转换蓝色', () => {
    const result = hexToRgb('#0000ff');
    expect(result).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('正确转换白色', () => {
    const result = hexToRgb('#ffffff');
    expect(result).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('正确转换黑色', () => {
    const result = hexToRgb('#000000');
    expect(result).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('正确转换灰色', () => {
    const result = hexToRgb('#808080');
    expect(result).toEqual({ r: 128, g: 128, b: 128 });
  });

  it('支持大写字母', () => {
    const result = hexToRgb('#FFA500');
    expect(result).toEqual({ r: 255, g: 165, b: 0 });
  });

  it('支持混合大小写', () => {
    const result = hexToRgb('#fFa500');
    expect(result).toEqual({ r: 255, g: 165, b: 0 });
  });

  it('无效的 hex 颜色返回 null', () => {
    expect(hexToRgb('invalid')).toBeNull();
    expect(hexToRgb('#123')).toBeNull();
    expect(hexToRgb('#12345')).toBeNull();
    expect(hexToRgb('#gggggg')).toBeNull();
    expect(hexToRgb('')).toBeNull();
  });

  it('3 位 hex 颜色返回 null（不支持简写）', () => {
    expect(hexToRgb('#fff')).toBeNull();
  });
});

describe('rgbToString', () => {
  it('正确转换 rgb 值为字符串', () => {
    expect(rgbToString(255, 0, 0)).toBe('rgb(255, 0, 0)');
  });

  it('正确转换绿色', () => {
    expect(rgbToString(0, 255, 0)).toBe('rgb(0, 255, 0)');
  });

  it('正确转换蓝色', () => {
    expect(rgbToString(0, 0, 255)).toBe('rgb(0, 0, 255)');
  });

  it('正确转换白色', () => {
    expect(rgbToString(255, 255, 255)).toBe('rgb(255, 255, 255)');
  });

  it('正确转换黑色', () => {
    expect(rgbToString(0, 0, 0)).toBe('rgb(0, 0, 0)');
  });

  it('正确转换灰色', () => {
    expect(rgbToString(128, 128, 128)).toBe('rgb(128, 128, 128)');
  });

  it('支持 0-255 范围内的任意值', () => {
    expect(rgbToString(10, 20, 30)).toBe('rgb(10, 20, 30)');
    expect(rgbToString(100, 150, 200)).toBe('rgb(100, 150, 200)');
  });
});

describe('ThemeProps 接口', () => {
  it('所有主题都符合 ThemeProps 接口', () => {
    THEMES.forEach((theme: ThemeProps) => {
      expect(typeof theme.id).toBe('string');
      expect(typeof theme.name).toBe('string');
      expect(typeof theme.splashImage).toBe('string');
      expect(typeof theme.cssVariables).toBe('object');
      expect(theme.cssVariables).not.toBeNull();
    });
  });
});
