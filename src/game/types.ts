/** Shared types used across modules. */
import type { Hex } from '../grid/hex';

export type { Hex } from '../grid/hex';

/** A direction is an index into DIRS (0..5). See grid/hex.ts. */
export type Direction = number;

export enum Occupant {
  Empty = 0,
  Wall = 1,
  Slime = 2,
  Essence = 3,
  ChamberCore = 4,
  Portal = 5,
  /** Spore pellet: a beneficial pickup — collecting it permanently slows the snake
   *  (a *buff*). Not required to advance; passable (not a wall). */
  Spore = 6,
}

export interface MovingObstacle {
  hex: Hex;
  prevHex: Hex;
  /** Ticks until the obstacle moves again. */
  moveCounter: number;
}

export type DeathReason = 'wall' | 'obstacle' | 'slime' | 'self';

export interface StepResult {
  died: DeathReason | null;
  ateEssence: boolean;
  ateCore: boolean;
  reachedPortal: boolean;
  onSlime: boolean;
  /** Consumed a spore pellet this step (Game applies the permanent slow). */
  ateSpore: boolean;
  /** A wall/bounds charge was consumed this step (move cancelled). */
  wallSoaked: boolean;
  /** Chitinous Shell shattered the struck wall hex into open space (VFX hook). */
  wallBroken: boolean;
  /** Hydra's Venom triggered: front half severed, tail half now leads (VFX hook). */
  hydraSplit: boolean;
  /** Ouroboros Loop: number of hazards vaporized inside the closed body loop. */
  loopedHazards: number;
  /** Hex keys of obstacles destroyed by Ouroboros (Game.ts filters floor.obstacles). */
  loopInsideKeys: string[];
  /** Apex Predator: tail segments devoured (>0 ⇒ Game.ts resets score multiplier). */
  apexEaten: number;
}

export interface RunSummary {
  depth: number;
  score: number;
  length: number;
  mutations: { name: string; stacks: number }[];
  reason: DeathReason | null;
}
