/**
 * Central tunables + palette. Adjust freely for playtesting.
 * Orange & teal, retro-modern roguelike, high contrast.
 */

export const CONFIG = {
  /** Playfield radius in hexes (hexagonal arena). R=11 -> 397 cells. */
  radius: 11,

  /** Snake / movement. */
  startLength: 3,
  /** Hard floor on snake length. Shedding Season never drops the body below this
   *  (a head needs at least one trailing segment), and regrowing up from it
   *  resets the shed cadence for a full runway. */
  minSnakeLength: 2,
  baseTickRate: 5, // ticks per second at depth 1 (lower = slower snake)
  tickRatePerDepth: 0.3,
  maxTickRate: 14,

  /** Essence (food) -> portal. */
  essenceBase: 5,
  essencePerDepth: 1,
  growthPerFoodBase: 1,
  scorePerEssence: 10,
  scorePerCore: 75,
  scorePerDepthCleared: 50,
  scorePerLooped: 25,

  /** Hazards (scale with depth). */
  wallDensityBase: 0.05,
  wallDensityPerDepth: 0.012,
  wallDensityMax: 0.15,
  slimeBase: 2,
  slimePerDepth: 0.5,
  obstacleBase: 0,
  obstaclePerDepth: 0.6,
  obstacleMoveEvery: 2, // obstacle moves once every N ticks
  chamberCoreChance: 0.3,
  /** Chamber Cores only spawn on cells with at least this many adjacent hexes
   *  free of walls/slime, so the snake always has an escape route after eating. */
  chamberCoreMinEscapeHexes: 2,

  /** Health / damage. */
  startHealth: 1,
  slimeDamage: 1,

  /** Loop safety. */
  maxFrameMs: 250,

  /** Rendering. */
  margin: 28,
} as const;

/**
 * Color palette. Typed as a mutable `Palette` interface (not `as const`) so
 * themes can swap it at runtime: `theme.ts` does `Object.assign(PALETTE, preset)`,
 * and because every reader accesses `PALETTE.x` live at draw time, the next frame
 * reflects the new colors with zero call-site edits. Add new keys here AND to every
 * preset in `theme.ts`.
 */
export interface Palette {
  bg: string;
  grid: string;
  gridEdge: string;
  arenaEdge: string;

  snakeHead: string;
  snakeBody: string;
  snakeBodyBright: string;
  snakeOutline: string;
  acid: string;
  /** Glow color used behind the snake head. */
  headGlow: string;

  essence: string;
  essenceGlow: string;

  portal: string;
  portalBright: string;
  portalGlow: string;

  wall: string;
  wallEdge: string;

  slime: string;
  slimeEdge: string;

  obstacle: string;
  obstacleEdge: string;
  /** Glow color used behind moving obstacles. */
  obstacleGlow: string;

  text: string;
  textDim: string;
  teal: string;
  orange: string;
  danger: string;
  /** Glow color used behind the death title. */
  dangerGlow: string;
  gold: string;
  legendary: string;
}

export const PALETTE: Palette = {
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

  text: '#e6edf3',
  textDim: '#8b97a7',
  teal: '#2dd4bf',
  orange: '#f97316',
  danger: '#ef4444',
  dangerGlow: 'rgba(239, 68, 68, 0.5)',
  gold: '#fbbf24',
  legendary: '#a78bfa',
};
