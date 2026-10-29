import chalk from 'chalk';

export type ThemeName = 'warm-orange' | 'dark' | 'light' | 'colorblind';

export interface ThemeColors {
  primary: (text: string) => string;
  secondary: (text: string) => string;
  accent: (text: string) => string;
  success: (text: string) => string;
  warning: (text: string) => string;
  error: (text: string) => string;
  muted: (text: string) => string;
  border: (text: string) => string;
  highlight: (text: string) => string;
  diffAdd: (text: string) => string;
  diffRemove: (text: string) => string;
  diffHeader: (text: string) => string;
}

const noColor = Boolean(process.env.NO_COLOR && process.env.NO_COLOR !== '0');

function identity(s: string): string {
  return s;
}

export const THEMES: Record<ThemeName, ThemeColors> = {
  'warm-orange': {
    primary: noColor ? identity : chalk.hex('#FF6B35').bold,
    secondary: noColor ? identity : chalk.hex('#FFA559'),
    accent: noColor ? identity : chalk.hex('#FF8C42'),
    success: noColor ? identity : chalk.greenBright,
    warning: noColor ? identity : chalk.hex('#FFAE03'),
    error: noColor ? identity : chalk.redBright,
    muted: noColor ? identity : chalk.gray,
    border: noColor ? identity : chalk.hex('#E85D04'),
    highlight: noColor ? identity : chalk.hex('#FFE6A7'),
    diffAdd: noColor ? identity : chalk.green,
    diffRemove: noColor ? identity : chalk.red,
    diffHeader: noColor ? identity : chalk.cyan,
  },
  'dark': {
    primary: noColor ? identity : chalk.cyanBright.bold,
    secondary: noColor ? identity : chalk.blueBright,
    accent: noColor ? identity : chalk.magentaBright,
    success: noColor ? identity : chalk.greenBright,
    warning: noColor ? identity : chalk.yellowBright,
    error: noColor ? identity : chalk.redBright,
    muted: noColor ? identity : chalk.gray,
    border: noColor ? identity : chalk.gray,
    highlight: noColor ? identity : chalk.whiteBright,
    diffAdd: noColor ? identity : chalk.green,
    diffRemove: noColor ? identity : chalk.red,
    diffHeader: noColor ? identity : chalk.cyan,
  },
  'light': {
    primary: noColor ? identity : chalk.hex('#005F73').bold,
    secondary: noColor ? identity : chalk.hex('#0A9396'),
    accent: noColor ? identity : chalk.hex('#94D2BD'),
    success: noColor ? identity : chalk.hex('#2B9348'),
    warning: noColor ? identity : chalk.hex('#CA6702'),
    error: noColor ? identity : chalk.hex('#AE2012'),
    muted: noColor ? identity : chalk.hex('#6C757D'),
    border: noColor ? identity : chalk.hex('#ADB5BD'),
    highlight: noColor ? identity : chalk.hex('#001219'),
    diffAdd: noColor ? identity : chalk.green,
    diffRemove: noColor ? identity : chalk.red,
    diffHeader: noColor ? identity : chalk.blue,
  },
  'colorblind': {
    primary: noColor ? identity : chalk.hex('#0072B2').bold, // Okabe-Ito Blue
    secondary: noColor ? identity : chalk.hex('#56B4E9'), // Sky Blue
    accent: noColor ? identity : chalk.hex('#E69F00'), // Orange
    success: noColor ? identity : chalk.hex('#009E73'), // Bluish Green
    warning: noColor ? identity : chalk.hex('#F0E442'), // Yellow
    error: noColor ? identity : chalk.hex('#D55E00'), // Vermilion
    muted: noColor ? identity : chalk.gray,
    border: noColor ? identity : chalk.hex('#56B4E9'),
    highlight: noColor ? identity : chalk.hex('#CC79A7'), // Reddish Purple
    diffAdd: noColor ? identity : chalk.hex('#009E73'),
    diffRemove: noColor ? identity : chalk.hex('#D55E00'),
    diffHeader: noColor ? identity : chalk.hex('#0072B2'),
  },
};

let currentThemeName: ThemeName = 'warm-orange';

export function getTheme(themeName: ThemeName = currentThemeName): ThemeColors {
  return THEMES[themeName] || THEMES['warm-orange'];
}

export function setTheme(themeName: ThemeName): void {
  if (THEMES[themeName]) {
    currentThemeName = themeName;
  }
}

export function getCurrentThemeName(): ThemeName {
  return currentThemeName;
}
