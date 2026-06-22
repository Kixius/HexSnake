import { CONFIG } from '../config';
import { type Hex, distance, hexKey, neighbors } from '../grid/hex';
import { GridManager } from '../grid/GridManager';
import { type MovingObstacle, Occupant } from '../game/types';

export interface Floor {
  grid: GridManager;
  obstacles: MovingObstacle[];
  spawn: Hex;
  /** Essence pellets required to open the portal. */
  essenceNeeded: number;
  hasCore: boolean;
}

/**
 * Procedural floor generator. Guarantees via BFS that every non-wall cell is
 * reachable from spawn (the floor is always solvable). Difficulty scales with
 * depth: more/faster ticks, denser walls, more slime and roaming obstacles.
 */
export class FloorGenerator {
  static generate(depth: number): Floor {
    const grid = new GridManager(CONFIG.radius);
    const spawn: Hex = { q: 0, r: 0 };
    grid.clear(spawn);
    const safe = 3; // keep a safe radius around spawn

    // (1) Static walls — reject any placement that disconnects the floor.
    const wallDensity = Math.min(
      CONFIG.wallDensityMax,
      CONFIG.wallDensityBase + CONFIG.wallDensityPerDepth * (depth - 1),
    );
    const wallTarget = Math.floor(wallDensity * grid.cells.length);
    let walls = 0;
    let attempts = 0;
    while (walls < wallTarget && attempts < wallTarget * 10) {
      attempts++;
      const c = randCell(grid.cells);
      if (distance(c, spawn) <= safe) continue;
      if (grid.occupantOf(c) !== Occupant.Empty) continue;
      grid.setOccupant(c, Occupant.Wall);
      if (isConnected(grid, spawn)) walls++;
      else grid.clear(c);
    }

    // (2) Toxic slime.
    const slimeCount = Math.floor(CONFIG.slimeBase + CONFIG.slimePerDepth * (depth - 1));
    placeRandom(grid, spawn, safe, slimeCount, Occupant.Slime);

    // (3) Essence pellets (spread out, away from spawn so the snake must move).
    const essenceNeeded = CONFIG.essenceBase + CONFIG.essencePerDepth * (depth - 1);
    placeSpread(grid, spawn, safe, essenceNeeded, Occupant.Essence);

    // (4) Chamber Core (rare) at the farthest reachable cell from spawn.
    let hasCore = false;
    if (Math.random() < CONFIG.chamberCoreChance) {
      const far = farthestEmpty(grid, spawn);
      if (far) {
        grid.setOccupant(far, Occupant.ChamberCore);
        hasCore = true;
      }
    }

    // (5) Moving obstacles (not grid occupants — tracked on the Floor).
    const moverCount = Math.floor(CONFIG.obstacleBase + CONFIG.obstaclePerDepth * (depth - 1));
    const obstacles: MovingObstacle[] = [];
    let guard = 0;
    while (obstacles.length < moverCount && guard < moverCount * 25 + 50) {
      guard++;
      const c = randCell(grid.cells);
      if (distance(c, spawn) <= safe + 1) continue;
      if (grid.occupantOf(c) !== Occupant.Empty) continue;
      if (obstacles.some((o) => hexKey(o.hex) === hexKey(c))) continue;
      obstacles.push({ hex: c, prevHex: c, moveCounter: CONFIG.obstacleMoveEvery });
    }

    return { grid, obstacles, spawn, essenceNeeded, hasCore };
  }

  /** Open the portal at the passable empty cell farthest from the snake head. */
  static spawnPortal(grid: GridManager, from: Hex): Hex | null {
    const target = farthestEmpty(grid, from) ?? grid.emptyCells()[0] ?? null;
    if (!target) return null;
    grid.setOccupant(target, Occupant.Portal);
    return target;
  }
}

// ---------- generation helpers ----------

function randCell(cells: readonly Hex[]): Hex {
  const c = cells[Math.floor(Math.random() * cells.length)];
  if (!c) throw new Error('randCell: empty cell list');
  return c;
}

/** BFS flood from `start` over passable cells. */
function reachableSet(grid: GridManager, start: Hex): Set<string> {
  const seen = new Set<string>([hexKey(start)]);
  const queue: Hex[] = [start];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) break;
    for (const n of neighbors(cur)) {
      const k = hexKey(n);
      if (seen.has(k)) continue;
      if (!grid.isPassable(n)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return seen;
}

/** True iff every non-wall cell is reachable from `start`. */
function isConnected(grid: GridManager, start: Hex): boolean {
  const reach = reachableSet(grid, start);
  const passable = grid.cells.length - grid.count(Occupant.Wall);
  return reach.size === passable;
}

function bfsDistances(grid: GridManager, start: Hex): Map<string, number> {
  const dist = new Map<string, number>([[hexKey(start), 0]]);
  const queue: Hex[] = [start];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) break;
    const d = dist.get(hexKey(cur)) ?? 0;
    for (const n of neighbors(cur)) {
      const k = hexKey(n);
      if (dist.has(k)) continue;
      if (!grid.isPassable(n)) continue;
      dist.set(k, d + 1);
      queue.push(n);
    }
  }
  return dist;
}

function farthestEmpty(grid: GridManager, from: Hex): Hex | null {
  const dist = bfsDistances(grid, from);
  let best: Hex | null = null;
  let bestD = -1;
  for (const c of grid.cells) {
    if (grid.occupantOf(c) !== Occupant.Empty) continue;
    const d = dist.get(hexKey(c)) ?? -1;
    if (d > bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function placeRandom(
  grid: GridManager,
  spawn: Hex,
  safe: number,
  count: number,
  occ: Occupant,
): void {
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 30 + 50) {
    guard++;
    const c = randCell(grid.cells);
    if (distance(c, spawn) <= safe) continue;
    if (grid.occupantOf(c) !== Occupant.Empty) continue;
    grid.setOccupant(c, occ);
    placed++;
  }
}

function placeSpread(
  grid: GridManager,
  spawn: Hex,
  safe: number,
  count: number,
  occ: Occupant,
): void {
  const placed: Hex[] = [];
  let guard = 0;
  while (placed.length < count && guard < count * 80 + 100) {
    guard++;
    const c = randCell(grid.cells);
    if (distance(c, spawn) <= safe) continue;
    if (grid.occupantOf(c) !== Occupant.Empty) continue;
    if (placed.some((p) => distance(p, c) < 2)) continue;
    grid.setOccupant(c, occ);
    placed.push(c);
  }
}
