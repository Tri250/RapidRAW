import { Theme } from '../components/ui/AppProperties';

export interface ThemeProps {
  cssVariables: any;
  id: Theme;
  name: string;
  splashImage: string;
}

export const THEMES: Array<ThemeProps> = [
  {
    id: Theme.Dark,
    name: 'settings.themes.dark',
    splashImage: '/splash-dark.jpg',
    cssVariables: {
      '--app-bg-primary': 'rgb(12, 12, 18)',
      '--app-bg-secondary': 'rgb(22, 24, 30)',
      '--app-surface': 'rgb(18, 20, 26)',
      '--app-card-active': 'rgb(30, 34, 42)',
      '--app-button-text': 'rgb(12, 12, 18)',
      '--app-text-primary': 'rgb(230, 234, 238)',
      '--app-text-secondary': 'rgb(140, 148, 158)',
      '--app-accent': 'rgb(62, 168, 138)',
      '--app-border-color': 'rgb(38, 42, 52)',
      '--app-hover-color': 'rgb(62, 168, 138)',
    },
  },
  {
    id: Theme.Light,
    name: 'settings.themes.light',
    splashImage: '/splash-light.jpg',
    cssVariables: {
      '--app-bg-primary': 'rgb(245, 245, 245)',
      '--app-bg-secondary': 'rgb(255, 255, 255)',
      '--app-surface': 'rgb(241, 241, 241)',
      '--app-card-active': 'rgb(250, 250, 250)',
      '--app-button-text': 'rgb(255, 255, 255)',
      '--app-text-primary': 'rgb(20, 20, 20)',
      '--app-text-secondary': 'rgb(108, 108, 108)',
      '--app-accent': 'rgb(198, 142, 110)',
      '--app-border-color': 'rgb(224, 224, 224)',
      '--app-hover-color': 'rgb(198, 142, 110)',
    },
  },
  {
    id: Theme.Grey,
    name: 'settings.themes.grey',
    splashImage: '/splash-grey.jpg',
    cssVariables: {
      '--app-bg-primary': 'rgb(112, 112, 112)',
      '--app-bg-secondary': 'rgb(118, 118, 118)',
      '--app-surface': 'rgb(108, 108, 108)',
      '--app-card-active': 'rgb(133, 133, 133)',
      '--app-button-text': 'rgb(45, 45, 45)',
      '--app-text-primary': 'rgb(240, 240, 240)',
      '--app-text-secondary': 'rgb(180, 180, 180)',
      '--app-accent': 'rgb(220, 220, 220)',
      '--app-border-color': 'rgb(138, 138, 138)',
      '--app-hover-color': 'rgb(220, 220, 220)',
    },
  },
];

export const DEFAULT_THEME_ID = Theme.Dark;
