/**
 * constants/theme.ts — Tema claro/oscuro del POS (Glassmorphism).
 *
 * Portado verbatim desde pos-mobil. La UI lo consume vía CSS variables
 * (ver styles/theme.css) y hooks.
 */

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceSolid: string;
  input: string;
  primary: string;
  primaryDark: string;
  primarySoft: string;
  onPrimary: string;
  secondary: string;
  secondarySoft: string;
  text: string;
  textSecondary: string;
  textDisabled: string;
  border: string;
  borderGlass: string;
  danger: string;
  dangerSoft: string;
  success: string;
  warning: string;
  warningSoft: string;
  info: string;
  shadow: string;
  blob: string;
}

export interface POSTheme {
  dark: boolean;
  colors: ThemeColors;
  fonts: {
    micro: number;
    small: number;
    regular: number;
    medium: number;
    large: number;
    xlarge: number;
    xxlarge: number;
    display: number;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    round: number;
  };
  glass: {
    opacity: number;
    blur: number;
  };
}

const lightColors: ThemeColors = {
  background: '#fcfdf2',
  surface: 'rgba(252, 223, 212, 0.55)',
  surfaceSolid: '#FFFFFF',
  input: 'rgba(255, 255, 255, 0.92)',
  primary: '#6d4e8d',
  primaryDark: '#4e2a5b',
  primarySoft: '#f3a0c0',
  onPrimary: '#FFFFFF',
  secondary: '#9b79b9',
  secondarySoft: '#fcdfd4',
  text: '#4e2a5b',
  textSecondary: '#6d4e8d',
  textDisabled: '#9b79b9',
  border: 'rgba(78, 42, 91, 0.18)',
  borderGlass: 'rgba(255, 255, 255, 0.8)',
  danger: '#C62828',
  dangerSoft: 'rgba(198, 40, 40, 0.10)',
  success: '#4e2a5b',
  warning: '#9b79b9',
  warningSoft: '#fcdfd4',
  info: '#6d4e8d',
  shadow: 'rgba(78, 42, 91, 0.25)',
  blob: 'rgba(155, 121, 185, 0.10)',
};

const darkColors: ThemeColors = {
  background: '#0F1020',
  surface: 'rgba(38, 40, 72, 0.62)',
  surfaceSolid: '#262848',
  input: 'rgba(56, 58, 100, 0.88)',
  primary: '#6E70E0',
  primaryDark: '#4648D4',
  primarySoft: 'rgba(110, 112, 224, 0.48)',
  onPrimary: '#FFFFFF',
  secondary: '#00995F',
  secondarySoft: 'rgba(0, 153, 94, 0.47)',
  text: '#F2F3FF',
  textSecondary: '#B8BAD6',
  textDisabled: '#6E708F',
  border: 'rgba(110,112,224,0.22)',
  borderGlass: 'rgba(255, 255, 255, 0.52)',
  danger: '#F87171',
  dangerSoft: 'rgba(248, 113, 113, 0.52)',
  success: '#4ADE80',
  warning: '#FBBF24',
  warningSoft: 'rgba(251, 190, 36, 0.57)',
  info: '#6E70E0',
  shadow: 'rgba(0,0,0,0.5)',
  blob: 'rgba(110, 112, 224, 0.06)',
};

export const posTheme: Record<ThemeMode, POSTheme> = {
  light: {
    dark: false,
    colors: lightColors,
    fonts: {
      micro: 11,
      small: 13,
      regular: 16,
      medium: 20,
      large: 24,
      xlarge: 32,
      xxlarge: 40,
      display: 40,
    },
    spacing: {xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 36},
    radius: {sm: 6, md: 14, lg: 20, xl: 24, round: 999},
    glass: {opacity: 0.55, blur: 20},
  },
  dark: {
    dark: true,
    colors: darkColors,
    fonts: {
      micro: 11,
      small: 13,
      regular: 16,
      medium: 20,
      large: 24,
      xlarge: 32,
      xxlarge: 40,
      display: 40,
    },
    spacing: {xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 36},
    radius: {sm: 6, md: 14, lg: 20, xl: 24, round: 999},
    glass: {opacity: 0.55, blur: 20},
  },
};