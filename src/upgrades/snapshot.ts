import { CONFIG } from '../config';

/**
 * The upgrade seam. A single shared struct of tunables owned by GameManager.
 *
 * - ONLY UpgradeSystem.apply() mutates these fields.
 * - SnakeController / Renderer / HUD READ them every tick.
 *
 * Do not scatter `if (hasAcidTrail)` checks around the codebase: add a field
 * here, have the relevant mutation set it, and read it where needed.
 */
export interface GameSnapshot {
  /** Health pool (tapped by slime DoT only). */
  maxHealth: number;
  /** Wall/bounds soak charges (Thick Scales) — separate from health. */
  wallCharges: number;
  /** Score multiplier, capped. */
  scoreMult: number;
  /** Body segments added per essence eaten. */
  growthPerFood: number;
  /** Acid Trail: tail melts on a timer. */
  meltEnabled: boolean;
  meltDelayMs: number;
  /** Phase Shifter: active-cd ability to pass through own body. */
  phaseEnabled: boolean;
  phaseDurationMs: number;
  phaseCooldownMs: number;
  /** Split Tongue: reveal rare items within this hex radius. */
  radarRadius: number;
}

export function createSnapshot(): GameSnapshot {
  return {
    maxHealth: CONFIG.startHealth,
    wallCharges: 0,
    scoreMult: 1,
    growthPerFood: CONFIG.growthPerFoodBase,
    meltEnabled: false,
    meltDelayMs: 1500,
    phaseEnabled: false,
    phaseDurationMs: 3000,
    phaseCooldownMs: 9000,
    radarRadius: 0,
  };
}
