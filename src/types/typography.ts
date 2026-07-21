export type TextVariant = 'displayLarge' | 'display' | 'headline' | 'title' | 'heading' | 'body' | 'label' | 'small' | 'caption';
export type TextWeight = 'bold' | 'semibold' | 'medium' | 'normal';
export type TextColor = 'primary' | 'secondary' | 'accent' | 'button' | 'info' | 'success' | 'error' | 'white';

export const TextWeights: Record<TextWeight, TextWeight> = {
  bold: 'bold',
  semibold: 'semibold',
  medium: 'medium',
  normal: 'normal',
};
export const TextColors: Record<TextColor, TextColor> = {
  primary: 'primary',
  secondary: 'secondary',
  accent: 'accent',
  button: 'button',
  info: 'info',
  success: 'success',
  error: 'error',
  white: 'white',
};

// Map keys to classes
export const TEXT_WEIGHT_KEYS: Record<TextWeight, string> = {
  bold: 'font-bold',
  semibold: 'font-semibold',
  medium: 'font-medium',
  normal: 'font-normal',
};
export const TEXT_COLOR_KEYS: Record<TextColor, string> = {
  primary: 'text-text-primary',
  secondary: 'text-text-secondary',
  accent: 'text-accent',
  button: 'text-button-text',
  info: 'text-blue-400',
  success: 'text-green-400',
  error: 'text-red-400',
  white: 'text-white',
};

export interface VariantConfig {
  size: string;
  defaultWeight: TextWeight;
  defaultColor: TextColor;
  defaultElement: React.ElementType;
  lineHeight: string;
  extraClasses?: string;
}

export const TextVariants: Record<TextVariant, VariantConfig> = {
  displayLarge: {
    size: 'text-5xl',
    defaultWeight: 'bold',
    defaultColor: 'primary',
    defaultElement: 'h1',
    lineHeight: 'leading-tight',
    extraClasses: 'text-shadow-shiny mb-4',
  },
  display: {
    size: 'text-3xl',
    defaultWeight: 'bold',
    defaultColor: 'primary',
    defaultElement: 'h1',
    lineHeight: 'leading-tight',
    extraClasses: 'text-shadow-shiny',
  },
  headline: {
    size: 'text-2xl',
    defaultWeight: 'bold',
    defaultColor: 'primary',
    defaultElement: 'h1',
    lineHeight: 'leading-snug',
    extraClasses: 'text-shadow-shiny',
  },
  title: {
    size: 'text-xl',
    defaultWeight: 'bold',
    defaultColor: 'primary',
    defaultElement: 'h2',
    lineHeight: 'leading-snug',
    extraClasses: 'text-shadow-shiny',
  },
  heading: {
    size: 'text-sm',
    defaultWeight: 'semibold',
    defaultColor: 'primary',
    defaultElement: 'h3',
    lineHeight: 'leading-normal',
  },
  body: {
    size: 'text-sm',
    defaultWeight: 'normal',
    defaultColor: 'secondary',
    defaultElement: 'p',
    lineHeight: 'leading-relaxed',
  },
  label: {
    size: 'text-sm',
    defaultWeight: 'medium',
    defaultColor: 'secondary',
    defaultElement: 'span',
    lineHeight: 'leading-normal',
  },
  small: {
    size: 'text-xs',
    defaultWeight: 'normal',
    defaultColor: 'secondary',
    defaultElement: 'p',
    lineHeight: 'leading-tight',
  },
  caption: {
    size: 'text-xs',
    defaultWeight: 'normal',
    defaultColor: 'secondary',
    defaultElement: 'span',
    lineHeight: 'leading-tight',
  },
};
