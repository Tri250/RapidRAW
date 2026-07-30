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
      '--app-accent-hover': 'rgb(82, 188, 158)',
      '--app-modal-preview-bg': 'rgb(15, 15, 15)',
      '--app-grid-line': 'rgba(255, 255, 255, 0.15)',
      '--app-shadow-shiny': '0 0 24px rgba(255, 255, 255, 0.12)',
      '--app-curves-grid-line': 'rgba(255, 255, 255, 0.22)',
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
      '--app-accent-hover': 'rgb(218, 162, 130)',
      '--app-modal-preview-bg': 'rgb(232, 232, 232)',
      '--app-grid-line': 'rgba(0, 0, 0, 0.1)',
      '--app-shadow-shiny': '0 0 24px rgba(0, 0, 0, 0.1)',
      '--app-curves-grid-line': 'rgba(0, 0, 0, 0.16)',
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
      '--app-button-text': 'rgb(38, 38, 38)',
      '--app-text-primary': 'rgb(245, 245, 245)',
      '--app-text-secondary': 'rgb(200, 200, 200)',
      '--app-accent': 'rgb(80, 152, 192)',
      '--app-border-color': 'rgb(138, 138, 138)',
      '--app-hover-color': 'rgb(100, 172, 212)',
      '--app-accent-hover': 'rgb(120, 192, 232)',
      '--app-modal-preview-bg': 'rgb(90, 90, 90)',
      '--app-grid-line': 'rgba(0, 0, 0, 0.18)',
      '--app-shadow-shiny': '0 0 24px rgba(255, 255, 255, 0.18)',
      '--app-curves-grid-line': 'rgba(255, 255, 255, 0.3)',
    },
  },
];

export const DEFAULT_THEME_ID = Theme.Dark;
