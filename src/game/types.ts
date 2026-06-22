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
  /** Thick Scales consumed a wall/bounds charge this step (move cancelled). */
  wallSoaked: boolean;
}

export interface RunSummary {
  depth: number;
  score: number;
  length: number;
  mutations: { name: string; stacks: number }[];
  reason: DeathReason | null;
}
