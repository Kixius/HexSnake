import { CONFIG } from '../config';
import { type Hex, clone, distance, hexKey, neighbors } from '../grid/hex';
import { GridManager } from '../grid/GridManager';
import { type MovingObstacle, Occupant } from '../game/types';
import type { GameSnapshot } from '../upgrades/snapshot';

export interface Floor {
  grid: GridManager;
  obstacles: MovingObstacle[];
  spawn: Hex;
  /** Essence pellets required to open the portal. */
  essenceNeeded: number;
  hasCore: boolean;
  /** Tri-Directional Fork: maps each cluster-member hex key to its sibling hexes,
   *  so eating one member can clear the rest. Empty on non-Fork floors. */
  clusters: Map<string, Hex[]>;
}

/**
 * Procedural floor generator. Guarantees via BFS that every non-wall cell is
 * reachable from spawn (the floor is always solvable). Difficulty scales with
 * depth: more/faster ticks, denser walls, more slime and roaming obstacles.
 * The snapshot drives card-driven generation (Nutrient Storage, Tri-Directional Fork).
 */
export class FloorGenerator {
  static generate(depth: number, snap: GameSnapshot): Floor {
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

    // (3) Essence pellets. Nutrient Storage lowers the requirement (min 1);
    //     Tri-Directional Fork lays them as 3-adjacent clusters.
    const essenceNeeded = Math.max(
      1,
      CONFIG.essenceBase + CONFIG.essencePerDepth * (depth - 1) - snap.essenceReduction,
    );
    const clusters = new Map<string, Hex[]>();
    if (snap.forkEnabled) {
      placeClusters(grid, spawn, safe, essenceNeeded, clusters);
    } else {
      placeSpread(grid, spawn, safe, essenceNeeded, Occupant.Essence);
    }

    // (4) Chamber Core (rare) at the farthest reachable cell from spawn — but
    //     only on a cell with enough wall/slime-free neighbors that the snake
    //     can actually leave after eating it (no dead-end traps).
    let hasCore = false;
    if (Math.random() < CONFIG.chamberCoreChance) {
      const far = farthestEmpty(grid, spawn, CONFIG.chamberCoreMinEscapeHexes);
      if (far) {
        grid.setOccupant(far, Occupant.ChamberCore);
        hasCore = true;
      }
    }

    // (4b) Spore — a rare, beneficial slow-pickup from floor `sporeStartDepth`.
    //      Not required to advance; collecting one permanently slows the snake (a buff).
    if (depth >= CONFIG.sporeStartDepth && Math.random() < CONFIG.sporeChance) {
      placeRandom(grid, spawn, safe, 1, Occupant.Spore);
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

    return { grid, obstacles, spawn, essenceNeeded, hasCore, clusters };
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

/** Count in-bounds neighbors of `c` that are passable (not wall, not slime). */
function freeNeighborCount(grid: GridManager, c: Hex): number {
  let n = 0;
  for (const nb of neighbors(c)) {
    if (!grid.inBounds(nb)) continue;
    const occ = grid.occupantOf(nb);
    if (occ !== Occupant.Wall && occ !== Occupant.Slime) n++;
  }
  return n;
}

/** Farthest empty cell from `from` (BFS). If `minFreeNeighbors > 0`, the cell
 *  must also have at least that many wall/slime-free neighbors. */
function farthestEmpty(grid: GridManager, from: Hex, minFreeNeighbors = 0): Hex | null {
  const dist = bfsDistances(grid, from);
  let best: Hex | null = null;
  let bestD = -1;
  for (const c of grid.cells) {
    if (grid.occupantOf(c) !== Occupant.Empty) continue;
    if (minFreeNeighbors > 0 && freeNeighborCount(grid, c) < minFreeNeighbors) continue;
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

/**
 * Tri-Directional Fork: lay `count` essence clusters, each an anchor plus two
 * adjacent empty hexes. Every member maps to its sibling list in `clusters`
 * so eating one member can clear the rest (1 cluster = 1 toward the portal).
 */
function placeClusters(
  grid: GridManager,
  spawn: Hex,
  safe: number,
  count: number,
  clusters: Map<string, Hex[]>,
): void {
  const anchors: Hex[] = [];
  let guard = 0;
  while (anchors.length < count && guard < count * 80 + 100) {
    guard++;
    const anchor = randCell(grid.cells);
    if (distance(anchor, spawn) <= safe) continue;
    if (grid.occupantOf(anchor) !== Occupant.Empty) continue;
    if (anchors.some((p) => distance(p, anchor) < 3)) continue;
    const adj = neighbors(anchor).filter(
      (n) => grid.inBounds(n) && grid.occupantOf(n) === Occupant.Empty,
    );
    if (adj.length < 2) continue; // need a trio
    const members = [anchor, adj[0]!, adj[1]!];
    for (const m of members) grid.setOccupant(m, Occupant.Essence);
    const siblings = members.map(clone);
    for (const m of members) clusters.set(hexKey(m), siblings);
    anchors.push(anchor);
  }
}
