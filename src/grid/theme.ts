/**
 * Drawing theme and DrawCtx. Themes control every colour the canvas layer paints.
 * Swap the theme at runtime to get light / dark / high-contrast without touching
 * the rendering code.
 */

import type { Sheet } from '../engine/sheet';
import type { Workbook } from '../engine/workbook';
import type { VisibleRange, ViewportRect } from './layout';
import type { Selection } from './selection';

export interface Theme {
  bg: string;
  gridline: string;
  headerBg: string;
  headerText: string;
  headerBorder: string;
  headerActiveBg: string;
  selBorder: string;
  selFill: string;
  activeBg: string;
  text: string;
  frozenLine: string;
}

export const LIGHT_THEME: Theme = {
  bg: '#ffffff',
  gridline: '#e1e5ea',
  headerBg: '#eef0f4',
  headerText: '#3a3f46',
  headerBorder: '#c8ccd2',
  headerActiveBg: '#ddeaff',
  selBorder: '#1f6feb',
  selFill: 'rgba(31, 111, 235, 0.10)',
  activeBg: '#ffffff',
  text: '#1f2328',
  frozenLine: '#999da3',
};

export const DARK_THEME: Theme = {
  bg: '#1f2328',
  gridline: '#2f353b',
  headerBg: '#262b30',
  headerText: '#c9d1d9',
  headerBorder: '#444b53',
  headerActiveBg: '#1e3a5f',
  selBorder: '#58a6ff',
  selFill: 'rgba(88, 166, 255, 0.18)',
  activeBg: '#1f2328',
  text: '#e6edf3',
  frozenLine: '#5a6470',
};

export const HIGH_CONTRAST_THEME: Theme = {
  bg: '#000000',
  gridline: '#ffffff',
  headerBg: '#111111',
  headerText: '#ffffff',
  headerBorder: '#ffffff',
  headerActiveBg: '#ffff00',
  selBorder: '#00ffff',
  selFill: 'rgba(0, 255, 255, 0.25)',
  activeBg: '#000000',
  text: '#ffffff',
  frozenLine: '#ffffff',
};

export type ThemeId = 'light' | 'dark' | 'high-contrast';

export const THEMES: Record<ThemeId, Theme> = {
  light: LIGHT_THEME,
  dark: DARK_THEME,
  'high-contrast': HIGH_CONTRAST_THEME,
};

export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  workbook: Workbook;
  sheet: Sheet;
  viewport: ViewportRect;
  visible: VisibleRange;
  selection: Selection;
  theme: Theme;
  dpr: number;
}
