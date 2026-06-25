import { CONFIG } from '../config';

/**
 * The upgrade seam. A single shared struct of tunables owned by GameManager.
 *
 * - ONLY UpgradeSystem (apply / resetMultiplier) mutates these fields — with two
 *   documented runtime exceptions where SnakeController writes directly: `health`
 *   (slime DoT) and `hydraUsed` (the one-time Hydra split). These mirror per-tick
 *   state that has nowhere else to live; see CLAUDE.md.
 * - SnakeController / Renderer / HUD READ these fields every tick.
 *
 * Do not scatter `if (hasAcidicTrail)` checks around the codebase: add a field
 * here, have the relevant card set it, and read it where needed.
 */
export interface GameSnapshot {
  /** Health pool (tapped by slime DoT only). */
  maxHealth: number;
  /** Wall/bounds soak charges (Chitinous Shell) — separate from health. */
  wallCharges: number;
  /** Lives remaining, counting the life you're currently on. A death while this
   *  is > 1 revives you on the current floor (essence progress kept); a death at
   *  1 (your last life) ends the run. Life cards add to this. */
  lives: number;

  /** Score multiplier. Apex Predator resets this to 1 via UpgradeSystem.resetMultiplier. */
  scoreMult: number;
  /** Body segments added per essence eaten (Hypertrophy raises this). */
  growthPerFood: number;
  /** Multiplier on the snake's tick rate (Elongated Strike raises this = faster snake). */
  speedMult: number;
  /** Essence subtracted from each floor's portal requirement (Nutrient Storage). */
  essenceReduction: number;

  /** Phase Shifter: active-cd ability to pass through own body. */
  phaseEnabled: boolean;
  phaseDurationMs: number;
  phaseCooldownMs: number;

  /** Diagonal Slip: active-cd ability to deflect along a wall instead of crashing. */
  slipEnabled: boolean;
  slipDurationMs: number;
  slipCooldownMs: number;

  /** Acidic Trail: the snake leaves a decaying acid wake that dissolves roaming hazards. */
  acidicEnabled: boolean;
  /** Acidic Trail: ticks an acid pool lingers on a vacated hex before it fades. */
  acidicTrailTicks: number;

  /** Chitinous Shell: soak also shatters the struck in-bounds wall hex. */
  chitinousEnabled: boolean;
  chitinCap: number;

  /** Shedding Season: drop a tail segment every N hexes traveled. */
  sheddingEnabled: boolean;
  sheddingInterval: number;

  /** Tri-Directional Fork: essence spawns as 3-adjacent clusters. */
  forkEnabled: boolean;

  /** Ouroboros Loop: self-collision captures enclosed hazards for score. */
  ouroborosEnabled: boolean;
  /** Hydra's Venom: one-time obstacle-hit survival via body split. */
  hydraEnabled: boolean;
  hydraUsed: boolean;
  /** Apex Predator: self-collision eats the bitten tail + resets score multiplier. */
  apexEnabled: boolean;

  /** Sense radius for revealing Chamber Cores from afar (no card sets this now; default 0). */
  radarRadius: number;

  /** Spore pellets consumed this run. Each adds a permanent multiplicative slow
   *  (Math.pow(1 - sporeSlowPerStack, sporeStacks)) applied in tickDt. */
  sporeStacks: number;
}

export function createSnapshot(): GameSnapshot {
  return {
    maxHealth: CONFIG.startHealth,
    wallCharges: 0,
    lives: CONFIG.startLives,
    scoreMult: 1,
    growthPerFood: CONFIG.growthPerFoodBase,
    speedMult: 1,
    essenceReduction: 0,
    phaseEnabled: false,
    phaseDurationMs: 4000,
    phaseCooldownMs: 8000,
    slipEnabled: false,
    slipDurationMs: 2000,
    slipCooldownMs: 15000,
    acidicEnabled: false,
    acidicTrailTicks: 8,
    chitinousEnabled: false,
    chitinCap: 2,
    sheddingEnabled: false,
    sheddingInterval: 15,
    forkEnabled: false,
    ouroborosEnabled: false,
    hydraEnabled: false,
    hydraUsed: false,
    apexEnabled: false,
    radarRadius: 0,
    sporeStacks: 0,
  };
}
