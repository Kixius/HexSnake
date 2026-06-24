import { CONFIG, PALETTE } from '../config';
import {
  type Hex,
  clone,
  directionOf,
  equals,
  hexKey,
  neighbor,
  neighbors,
  NUM_DIRS,
  opposite,
} from '../grid/hex';
import { type GameSnapshot } from '../upgrades/snapshot';
import {
  type Direction,
  type MovingObstacle,
  type StepResult,
  DeathReason,
  Occupant,
} from '../game/types';
import type { GridManager } from '../grid/GridManager';

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
 * Snake model + movement + ordered collision resolution + card-effect hooks.
 *
 * Invariants (see CLAUDE.md):
 *  - self/obstacle collision is death UNLESS an active card resolves it
 *    (Phase Shifter window, Apex Predator eat, Ouroboros loop capture,
 *    Hydra's Venom one-time split).
 *  - health is tapped by step() by slime DoT; `hydraUsed` is written here too —
 *    the two documented GameSnapshot fields SnakeController may mutate directly.
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
  private slipUntil = 0; // Diagonal Slip: active window end
  private slipReadyAt = 0; // Diagonal Slip: next activation allowed

  /** Shedding Season: hexes stepped this floor. */
  private hexesTraveled = 0;

  /** Acidic Trail: hex keys of the last ≤3 tail segments (destroys moving obstacles). */
  acidicHexes: ReadonlySet<string> = new Set();

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
    this.slipUntil = 0;
    this.slipReadyAt = 0;
    this.hexesTraveled = 0;
    this.acidicHexes = new Set();
  }

  /** Re-enter the launch (pre-steer) state at the current position — used after a
   *  Chamber Core pick so the player can choose a fresh direction instead of
   *  instantly resuming. Syncs the render-interpolation buffers so the snake
   *  renders stationary (the launch contract: started=false ⇒ prev==current). */
  haltForLaunch(): void {
    this.prevSegments = this.segments.map(clone);
    this.started = false;
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

  // ---- Diagonal Slip ----

  isSlipping(now: number): boolean {
    return this.slipUntil > 0 && now < this.slipUntil;
  }

  activateSlip(snap: GameSnapshot, now: number): void {
    if (!snap.slipEnabled) return;
    if (now < this.slipReadyAt) return;
    if (this.isSlipping(now)) return;
    this.slipUntil = now + snap.slipDurationMs;
    this.slipReadyAt = now + snap.slipDurationMs + snap.slipCooldownMs;
  }

  slipState(snap: GameSnapshot, now: number): PhaseState {
    if (!snap.slipEnabled) {
      return { enabled: false, active: false, activeFrac: 0, cooldownFrac: 0, ready: false };
    }
    const active = this.isSlipping(now);
    const activeFrac = active ? Math.max(0, (this.slipUntil - now) / snap.slipDurationMs) : 0;
    const cooling = !active && now < this.slipReadyAt;
    const cooldownFrac = cooling ? Math.max(0, (this.slipReadyAt - now) / snap.slipCooldownMs) : 0;
    return {
      enabled: true,
      active,
      activeFrac,
      cooldownFrac,
      ready: !active && now >= this.slipReadyAt,
    };
  }

  /** Try the two directions adjacent to `heading`; return the first that skims along
   *  the wall into open space, or null if both are blocked. */
  private pickSlipDirection(grid: GridManager, heading: number): number | null {
    const cands = [(heading + 1) % NUM_DIRS, (heading + NUM_DIRS - 1) % NUM_DIRS];
    for (const c of cands) {
      const cell = neighbor(this.head, c);
      if (grid.inBounds(cell) && grid.occupantOf(cell) !== Occupant.Wall) return c;
    }
    return null;
  }

  // ---- Upgrades changed between floors / on core ----

  onUpgradesChanged(snap: GameSnapshot): void {
    if (snap.maxHealth > this.maxHealthSeen) {
      // A max-health raise (e.g. legacy Thick-Scales-style) full-heals on the pick.
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
    _dtMs: number,
    candidate: Direction | null,
  ): StepResult {
    const result: StepResult = {
      died: null,
      ateEssence: false,
      ateCore: false,
      reachedPortal: false,
      onSlime: false,
      wallSoaked: false,
      wallBroken: false,
      hydraSplit: false,
      loopedHazards: 0,
      loopInsideKeys: [],
      apexEaten: 0,
    };

    let newHeading = candidate ?? this.heading;
    let newHead = neighbor(this.head, newHeading);

    // (1) Bounds / static wall — Slip can deflect, Chitinous/Thick can soak.
    let inB = grid.inBounds(newHead);
    let occ = inB ? grid.occupantOf(newHead) : Occupant.Empty;
    if (!inB || occ === Occupant.Wall) {
      // Slip only skims a placed (in-bounds) wall, not the arena perimeter.
      if (inB && occ === Occupant.Wall && snap.slipEnabled && this.isSlipping(now)) {
        const slipDir = this.pickSlipDirection(grid, newHeading);
        if (slipDir !== null) {
          newHeading = slipDir;
          newHead = neighbor(this.head, slipDir);
          inB = grid.inBounds(newHead);
          occ = inB ? grid.occupantOf(newHead) : Occupant.Empty;
          // fall through — a slip into an obstacle still dies below.
        } else {
          result.died = 'wall'; // slip attempted, nowhere to skim
          return result;
        }
      } else if (this.wallChargesRemaining(snap) > 0) {
        this.wallChargesConsumed++;
        // Chitinous Shell: shatter the struck placed wall into open space.
        if (snap.chitinousEnabled && inB && occ === Occupant.Wall) {
          grid.clear(newHead);
          result.wallBroken = true;
        }
        result.wallSoaked = true;
        return result; // keep old heading, do not move
      } else {
        result.died = 'wall';
        return result;
      }
    }

    // (2) Moving obstacle at the target cell — Hydra's Venom can sever & survive once.
    if (obstacles.some((o) => equals(o.hex, newHead))) {
      if (snap.hydraEnabled && !snap.hydraUsed && this.segments.length >= 4) {
        this.hydraSplit(snap, result);
        return result;
      }
      result.died = 'obstacle';
      return result;
    }

    // Commit the turn + advance.
    this.heading = newHeading;
    this.prevSegments = this.segments.map(clone);
    this.segments.unshift(newHead);
    this.hexesTraveled++;

    const growing = occ === Occupant.Essence;

    // (4) Self collision — Apex / Ouroboros can resolve it; otherwise death.
    if (!this.isPhasing(now)) {
      const k = this.selfCollideIndex(growing);
      if (k >= 0) {
        if (snap.apexEnabled) {
          // Apex Predator: devour from the bite onward; survive.
          const eaten = this.segments.length - k;
          this.segments = this.segments.slice(0, k);
          this.prevSegments = this.segments.map(clone);
          this.growPending = 0;
          result.apexEaten = eaten;
          this.refreshAcidicHexes(snap);
          return result;
        }
        if (snap.ouroborosEnabled) {
          // Ouroboros Loop: vaporize enclosed hazards, then truncate to clear the overlap.
          result.loopedHazards = this.resolveLoop(grid, obstacles, k, result);
          this.segments = this.segments.slice(0, k);
          this.prevSegments = this.segments.map(clone);
          this.growPending = 0;
          this.refreshAcidicHexes(snap);
          return result;
        }
        result.died = 'self';
        return result;
      }
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

    // Tail: grow vs recede. Shedding Season drops an extra segment on a cadence.
    if (this.growPending > 0) {
      this.growPending--;
    } else {
      this.segments.pop();
      if (
        snap.sheddingEnabled &&
        this.segments.length > 1 &&
        this.hexesTraveled % snap.sheddingInterval === 0
      ) {
        this.segments.pop();
      }
    }

    // Slime death check (after movement committed).
    if (result.onSlime && this.health <= 0) {
      result.died = 'slime';
    }

    this.refreshAcidicHexes(snap);
    return result;
  }

  /** Index of the body segment the new head (segments[0]) overlaps, or -1.
   *  The vacating tail is excluded unless we are growing this step. */
  private selfCollideIndex(growing: boolean): number {
    const last = this.segments.length - 1;
    const checkUpTo = growing ? last : last - 1;
    for (let i = 1; i <= checkUpTo; i++) {
      const seg = this.segments[i];
      if (seg && equals(seg, this.head)) return i;
    }
    return -1;
  }

  /** Hydra's Venom: sever the front half; the tail half reverses to become the new
   *  head moving outward (away from its own body). New heading is derived from the
   *  neck→head segment pair so it stays correct on curved bodies. */
  private hydraSplit(snap: GameSnapshot, result: StepResult): void {
    const k = Math.floor(this.segments.length / 2);
    const tail = this.segments.slice(k);
    tail.reverse();
    const newHeadSeg = tail[0];
    const neckSeg = tail[1];
    if (!newHeadSeg || !neckSeg) {
      result.died = 'obstacle'; // degenerate; don't consume the one-time use
      return;
    }
    const nh = directionOf(neckSeg, newHeadSeg); // outward (neck → head), never inward
    if (nh === null) {
      result.died = 'obstacle';
      return;
    }
    this.segments = tail;
    this.heading = nh;
    this.prevSegments = this.segments.map(clone);
    this.growPending = 0;
    snap.hydraUsed = true; // documented GameSnapshot write from step()
    result.hydraSplit = true;
  }

  /** Ouroboros Loop: flood-fill from the arena border treating the closed body ring
   *  (segments[0..k]) as a wall; any enclosed Slime / obstacle is vaporized. Obstacle
   *  hex keys are collected into result.loopInsideKeys for Game.ts to filter. */
  private resolveLoop(
    grid: GridManager,
    obstacles: readonly MovingObstacle[],
    k: number,
    result: StepResult,
  ): number {
    const ringSet = new Set(this.segments.slice(0, k + 1).map(hexKey));

    // Flood-fill the outside from every border cell not on the ring.
    const outside = new Set<string>();
    const queue: Hex[] = [];
    for (const c of grid.cells) {
      if (this.isBorder(c, grid.radius) && !ringSet.has(hexKey(c))) {
        const key = hexKey(c);
        if (!outside.has(key)) {
          outside.add(key);
          queue.push(c);
        }
      }
    }
    while (queue.length > 0) {
      const cur = queue.shift();
      if (!cur) break;
      for (const n of neighbors(cur)) {
        if (!grid.inBounds(n)) continue;
        const key = hexKey(n);
        if (ringSet.has(key) || outside.has(key)) continue;
        outside.add(key);
        queue.push(n);
      }
    }

    // Inside = in-bounds, not ring, not outside. Vaporize hazards there.
    let count = 0;
    for (const c of grid.cells) {
      const key = hexKey(c);
      if (ringSet.has(key) || outside.has(key)) continue;
      if (grid.occupantOf(c) === Occupant.Slime) {
        grid.clear(c);
        count++;
      }
    }
    for (const o of obstacles) {
      const key = hexKey(o.hex);
      if (ringSet.has(key) || outside.has(key)) continue;
      result.loopInsideKeys.push(key);
      count++;
    }
    return count;
  }

  private isBorder(c: Hex, radius: number): boolean {
    return Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)) === radius;
  }

  private refreshAcidicHexes(snap: GameSnapshot): void {
    if (snap.acidicEnabled && this.segments.length > 0) {
      this.acidicHexes = new Set(this.segments.slice(-3).map(hexKey));
    } else {
      this.acidicHexes = new Set();
    }
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
