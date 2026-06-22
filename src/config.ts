/**
 * Central tunables + palette. Adjust freely for playtesting.
 * Orange & teal, retro-modern roguelike, high contrast.
 */

export const CONFIG = {
  /** Playfield radius in hexes (hexagonal arena). R=11 -> 397 cells. */
  radius: 11,

  /** Snake / movement. */
  startLength: 3,
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

  /** Health / damage. */
  startHealth: 1,
  slimeDamage: 1,

  /** Loop safety. */
  maxFrameMs: 250,

  /** Rendering. */
  margin: 28,
} as const;

export const PALETTE = {
  bg: '#0e1116',
  grid: '#171e2a',
  gridEdge: '#222d3f',
  arenaEdge: '#2dd4bf',

  snakeHead: '#5eead4',
  snakeBody: '#0f766e',
  snakeBodyBright: '#2dd4bf',
  snakeOutline: '#0a3a36',
  acid: '#22d3ee',

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

  text: '#e6edf3',
  textDim: '#8b97a7',
  teal: '#2dd4bf',
  orange: '#f97316',
  danger: '#ef4444',
  gold: '#fbbf24',
} as const;
