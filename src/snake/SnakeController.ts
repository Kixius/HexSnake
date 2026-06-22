import { CONFIG, PALETTE } from '../config';
import { type Hex, clone, equals, neighbor, opposite } from '../grid/hex';
import { type GameSnapshot } from '../upgrades/snapshot';
import {
  type Direction,
  type MovingObstacle,
  type StepResult,
  DeathReason,
  Occupant,
} from '../game/types';
import type { GridManager } from '../grid/GridManager';

/** A dissolved tail cell (Acid Trail) drawn as a fading acid puddle. */
export interface AcidTrail {
  hex: Hex;
  bornMs: number;
}

export interface PhaseState {
  enabled: boolean;
  active: boolean;
  /** 0..1 fraction of the active window remaining. */
  activeFrac: number;
  /** 0..1 fraction of cooldown remaining before next use. */
  cooldownFrac: number;
  ready: boolean;
}

/**
 * Snake model + movement + ordered collision resolution + upgrade-effect hooks.
 *
 * Invariants (see CLAUDE.md):
 *  - tail collision = death is ABSOLUTE (only Phase Shifter can survive it).
 *  - health is tapped by slime DoT only; wall soaks use a separate charge counter.
 *  - exactly one hex per step; prevSegments drives render interpolation.
 */
export class SnakeController {
  segments: Hex[];
  prevSegments: Hex[];
  heading: Direction;
  /** False until the player steers (floor launch). */
  started = false;

  health: number;
  private maxHealthSeen: number;
  private wallChargesConsumed = 0;

  growPending = 0;

  private phaseUntil = 0; // perf.now ms: active window end
  private phaseReadyAt = 0; // perf.now ms: next activation allowed
  private meltAccumulator = 0;

  acidTrails: AcidTrail[] = [];

  constructor(spawn: Hex, heading: Direction, snap: GameSnapshot) {
    this.heading = heading;
    this.segments = buildBody(spawn, heading, CONFIG.startLength);
    this.prevSegments = this.segments.map(clone);
    this.health = snap.maxHealth;
    this.maxHealthSeen = snap.maxHealth;
  }

  /** Reposition for a new floor; keeps run health + upgrades, refreshes per-floor resources. */
  reposition(spawn: Hex, heading: Direction): void {
    this.heading = heading;
    this.segments = buildBody(spawn, heading, CONFIG.startLength);
    this.prevSegments = this.segments.map(clone);
    this.started = false;
    this.growPending = 0;
    this.wallChargesConsumed = 0;
    this.phaseUntil = 0;
    this.phaseReadyAt = 0;
    this.meltAccumulator = 0;
    this.acidTrails = [];
  }

  get length(): number {
    return this.segments.length;
  }

  get head(): Hex {
    const h = this.segments[0];
    if (!h) throw new Error('snake has no head');
    return h;
  }

  wallChargesRemaining(snap: GameSnapshot): number {
    return Math.max(0, snap.wallCharges - this.wallChargesConsumed);
  }

  // ---- Phase Shifter ----

  isPhasing(now: number): boolean {
    return this.phaseUntil > 0 && now < this.phaseUntil;
  }

  activatePhase(snap: GameSnapshot, now: number): void {
    if (!snap.phaseEnabled) return;
    if (now < this.phaseReadyAt) return;
    if (this.isPhasing(now)) return;
    this.phaseUntil = now + snap.phaseDurationMs;
    this.phaseReadyAt = now + snap.phaseDurationMs + snap.phaseCooldownMs;
  }

  phaseState(snap: GameSnapshot, now: number): PhaseState {
    if (!snap.phaseEnabled) {
      return { enabled: false, active: false, activeFrac: 0, cooldownFrac: 0, ready: false };
    }
    const active = this.isPhasing(now);
    const activeFrac = active ? Math.max(0, (this.phaseUntil - now) / snap.phaseDurationMs) : 0;
    const cooling = !active && now < this.phaseReadyAt;
    const cooldownFrac = cooling
      ? Math.max(0, (this.phaseReadyAt - now) / snap.phaseCooldownMs)
      : 0;
    return {
      enabled: true,
      active,
      activeFrac,
      cooldownFrac,
      ready: !active && now >= this.phaseReadyAt,
    };
  }

  // ---- Upgrades changed between floors / on core ----

  onUpgradesChanged(snap: GameSnapshot): void {
    if (snap.maxHealth > this.maxHealthSeen) {
      // Thick Scales: full heal on the pick that raised max health.
      this.health = snap.maxHealth;
      this.maxHealthSeen = snap.maxHealth;
    } else if (this.health > snap.maxHealth) {
      this.health = snap.maxHealth;
    }
  }

  // ---- The core step ----

  step(
    grid: GridManager,
    obstacles: readonly MovingObstacle[],
    snap: GameSnapshot,
    now: number,
    dtMs: number,
    candidate: Direction | null,
  ): StepResult {
    const result: StepResult = {
      died: null,
      ateEssence: false,
      ateCore: false,
      reachedPortal: false,
      onSlime: false,
      wallSoaked: false,
    };

    const newHeading = candidate ?? this.heading;
    const newHead = neighbor(this.head, newHeading);

    // (1) Bounds / static wall — Thick Scales can soak, cancelling the move.
    const inB = grid.inBounds(newHead);
    const occ = inB ? grid.occupantOf(newHead) : Occupant.Empty;
    const isWallHit = !inB || occ === Occupant.Wall;
    if (isWallHit) {
      if (this.wallChargesRemaining(snap) > 0) {
        this.wallChargesConsumed++;
        result.wallSoaked = true;
        return result; // keep old heading, do not move
      }
      result.died = 'wall';
      return result;
    }

    // (2) Moving obstacle at the target cell (pre-obstacle-move position).
    if (obstacles.some((o) => equals(o.hex, newHead))) {
      result.died = 'obstacle';
      return result;
    }

    // Commit the turn + advance.
    this.heading = newHeading;
    this.prevSegments = this.segments.map(clone);
    this.segments.unshift(newHead);

    const growing = occ === Occupant.Essence;

    // (4) Self collision (Phase Shifter skips it). Acid-melted cells already gone.
    if (!this.isPhasing(now) && this.selfCollides(growing)) {
      result.died = 'self';
      return result;
    }

    // (3/5/6/7) Resolve occupant.
    if (growing) {
      result.ateEssence = true;
      grid.clear(newHead);
      this.growPending += snap.growthPerFood;
    } else if (occ === Occupant.ChamberCore) {
      result.ateCore = true;
      grid.clear(newHead);
    } else if (occ === Occupant.Portal) {
      result.reachedPortal = true;
      // portal stays put until transition
    } else if (occ === Occupant.Slime) {
      result.onSlime = true;
      this.health -= CONFIG.slimeDamage;
    }

    // Tail: grow vs recede.
    if (this.growPending > 0) {
      this.growPending--;
    } else {
      this.segments.pop();
    }

    // Slime death check (after movement committed).
    if (result.onSlime && this.health <= 0) {
      result.died = 'slime';
    }

    // Acid Trail: trim the tail on a real-time timer.
    if (snap.meltEnabled) {
      this.meltTick(snap, now, dtMs);
    }
    this.pruneAcidTrails(now);

    return result;
  }

  /** True if the new head (segments[0]) overlaps a body cell that will remain. */
  private selfCollides(growing: boolean): boolean {
    const last = this.segments.length - 1;
    const checkUpTo = growing ? last : last - 1; // vacating tail excluded when not growing
    for (let i = 1; i <= checkUpTo; i++) {
      const seg = this.segments[i];
      if (seg && equals(seg, this.head)) return true;
    }
    return false;
  }

  private meltTick(snap: GameSnapshot, now: number, dtMs: number): void {
    this.meltAccumulator += dtMs;
    while (this.meltAccumulator >= snap.meltDelayMs && this.segments.length > 1) {
      this.meltAccumulator -= snap.meltDelayMs;
      const popped = this.segments.pop();
      if (popped) this.acidTrails.push({ hex: popped, bornMs: now });
    }
    if (this.acidTrails.length > 48) {
      this.acidTrails.splice(0, this.acidTrails.length - 48);
    }
  }

  private pruneAcidTrails(now: number): void {
    const lifespan = 700;
    this.acidTrails = this.acidTrails.filter((a) => now - a.bornMs < lifespan);
  }

  /** Resolve a death reason into a palette color for the death flash. */
  static deathColor(reason: DeathReason | null): string {
    switch (reason) {
      case 'wall':
        return PALETTE.wall;
      case 'obstacle':
        return PALETTE.obstacle;
      case 'slime':
        return PALETTE.slime;
      case 'self':
        return PALETTE.danger;
      default:
        return PALETTE.text;
    }
  }
}

/** Build a straight tail behind `spawn` along the opposite of `heading`. */
function buildBody(spawn: Hex, heading: Direction, length: number): Hex[] {
  const back = opposite(heading);
  const segs: Hex[] = [clone(spawn)];
  let cur = spawn;
  for (let i = 1; i < length; i++) {
    cur = neighbor(cur, back);
    segs.push(clone(cur));
  }
  return segs;
}
