import { PALETTE, type Palette } from './config';

/**
 * Curated preset themes. Each is a *complete* `Palette` (every key, including the
 * rgba glows) so a swap recolors the whole game consistently.
 *
 * `applyTheme` mutates the shared `PALETTE` object in place via `Object.assign`;
 * because every reader accesses `PALETTE.x` live at draw time, the next rendered
 * frame shows the new colors with zero call-site edits.
 */

export type ThemeId = 'teal-orange' | 'synthwave' | 'forest' | 'mono';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
}

/** Display order for the theme picker. */
export const THEME_ORDER: readonly ThemeMeta[] = [
  { id: 'teal-orange', name: 'Teal & Orange' },
  { id: 'synthwave', name: 'Synthwave' },
  { id: 'forest', name: 'Forest' },
  { id: 'mono', name: 'Amber Mono' },
];

export const DEFAULT_THEME_ID: ThemeId = 'teal-orange';

const TEAL_ORANGE: Palette = {
  bg: '#0e1116',
  grid: '#171e2a',
  gridEdge: '#222d3f',
  arenaEdge: '#2dd4bf',
  snakeHead: '#5eead4',
  snakeBody: '#0f766e',
  snakeBodyBright: '#2dd4bf',
  snakeOutline: '#0a3a36',
  acid: '#22d3ee',
  headGlow: 'rgba(94, 234, 212, 0.55)',
  essence: '#5eead4',
  essenceGlow: 'rgba(94, 234, 212, 0.5)',
  portal: '#f59e0b',
  portalBright: '#fde68a',
  portalGlow: 'rgba(245, 158, 11, 0.45)',
  wall: '#394150',
  wallEdge: '#4b5568',
  slime: '#92400e',
  slimeEdge: '#d97706',
  obstacle: '#f97316',
  obstacleEdge: '#fdba74',
  obstacleGlow: 'rgba(249, 115, 22, 0.5)',
  spore: '#22c55e',
  sporeGlow: 'rgba(34, 197, 94, 0.5)',
  text: '#e6edf3',
  textDim: '#8b97a7',
  teal: '#2dd4bf',
  orange: '#f97316',
  danger: '#ef4444',
  dangerGlow: 'rgba(239, 68, 68, 0.5)',
  gold: '#fbbf24',
  legendary: '#a78bfa',
};

const SYNTHWAVE: Palette = {
  bg: '#1a0b2e',
  grid: '#241440',
  gridEdge: '#2e1a52',
  arenaEdge: '#ff2bd6',
  snakeHead: '#00e5ff',
  snakeBody: '#0b3b66',
  snakeBodyBright: '#00e5ff',
  snakeOutline: '#062a4a',
  acid: '#39ff14',
  headGlow: 'rgba(0, 229, 255, 0.55)',
  essence: '#ff2bd6',
  essenceGlow: 'rgba(255, 43, 214, 0.5)',
  portal: '#ffd000',
  portalBright: '#fff275',
  portalGlow: 'rgba(255, 208, 0, 0.45)',
  wall: '#3b2a5c',
  wallEdge: '#5a3f86',
  slime: '#7a1f6b',
  slimeEdge: '#c026d3',
  obstacle: '#ff2bd6',
  obstacleEdge: '#ff8be6',
  obstacleGlow: 'rgba(255, 43, 214, 0.5)',
  spore: '#a3e635',
  sporeGlow: 'rgba(163, 230, 53, 0.5)',
  text: '#f5e9ff',
  textDim: '#9b86c0',
  teal: '#00e5ff',
  orange: '#ff2bd6',
  danger: '#ff3b3b',
  dangerGlow: 'rgba(255, 59, 59, 0.5)',
  gold: '#ffd000',
  legendary: '#b388ff',
};

const FOREST: Palette = {
  bg: '#0d1410',
  grid: '#16221b',
  gridEdge: '#1f2e25',
  arenaEdge: '#7cfc00',
  snakeHead: '#9be86a',
  snakeBody: '#2e5d2a',
  snakeBodyBright: '#7cfc00',
  snakeOutline: '#163a17',
  acid: '#69d985',
  headGlow: 'rgba(124, 252, 0, 0.5)',
  essence: '#daa520',
  essenceGlow: 'rgba(218, 165, 32, 0.5)',
  portal: '#f0a500',
  portalBright: '#ffd166',
  portalGlow: 'rgba(240, 165, 0, 0.45)',
  wall: '#33402f',
  wallEdge: '#4b5a44',
  slime: '#5a3a1a',
  slimeEdge: '#8a5a2a',
  obstacle: '#daa520',
  obstacleEdge: '#ecc46b',
  obstacleGlow: 'rgba(218, 165, 32, 0.5)',
  spore: '#ccff00',
  sporeGlow: 'rgba(204, 255, 0, 0.5)',
  text: '#e8f0e0',
  textDim: '#8aa085',
  teal: '#7cfc00',
  orange: '#daa520',
  danger: '#e54646',
  dangerGlow: 'rgba(229, 70, 70, 0.5)',
  gold: '#f0a500',
  legendary: '#e8c547',
};

const MONO: Palette = {
  bg: '#0c0a00',
  grid: '#1a1400',
  gridEdge: '#241c00',
  arenaEdge: '#ffb000',
  snakeHead: '#ffd060',
  snakeBody: '#7a5200',
  snakeBodyBright: '#ffb000',
  snakeOutline: '#3a2600',
  acid: '#cc8800',
  headGlow: 'rgba(255, 176, 0, 0.5)',
  essence: '#ffd060',
  essenceGlow: 'rgba(255, 208, 96, 0.5)',
  portal: '#ff8c00',
  portalBright: '#ffb84d',
  portalGlow: 'rgba(255, 140, 0, 0.45)',
  wall: '#3a2a00',
  wallEdge: '#5a4200',
  slime: '#5a3a00',
  slimeEdge: '#8a6300',
  obstacle: '#ff8c00',
  obstacleEdge: '#ffb84d',
  obstacleGlow: 'rgba(255, 140, 0, 0.5)',
  spore: '#22c55e',
  sporeGlow: 'rgba(34, 197, 94, 0.5)',
  text: '#ffce5c',
  textDim: '#8a6f2a',
  teal: '#ffb000',
  orange: '#ff8c00',
  danger: '#ff5555',
  dangerGlow: 'rgba(255, 85, 85, 0.5)',
  gold: '#ffd060',
  legendary: '#ffe0a0',
};

export const THEMES: Record<ThemeId, Palette> = {
  'teal-orange': TEAL_ORANGE,
  synthwave: SYNTHWAVE,
  forest: FOREST,
  mono: MONO,
};

let currentTheme: ThemeId = DEFAULT_THEME_ID;

/** Swap the active palette by mutating the shared PALETTE in place. */
export function applyTheme(id: ThemeId): void {
  const preset = THEMES[id];
  if (!preset) return;
  Object.assign(PALETTE, preset);
  currentTheme = id;
}

export function currentThemeId(): ThemeId {
  return currentTheme;
}

/** True if `id` is a known preset (guard for settings loaded from storage). */
export function isThemeId(id: unknown): id is ThemeId {
  return typeof id === 'string' && id in THEMES;
}
