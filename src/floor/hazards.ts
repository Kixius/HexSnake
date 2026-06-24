import { CONFIG } from '../config';
import { type Hex, equals, hexKey, neighbors } from '../grid/hex';
import { type MovingObstacle } from '../game/types';
import type { GridManager } from '../grid/GridManager';

/**
 * Moving obstacles roam the floor one hex at a time. They AVOID the snake's
 * occupied cells and each other, so they never insta-kill by parking on the
 * head — the danger is the snake steering INTO one (handled in SnakeController
 * step #2). Obstacles are tracked in the Floor, not in GridManager occupancy.
 *
 * Acidic Trail: any obstacle sitting on, or moving onto, an acid hex is dissolved
 * (spliced out of the array here, since Game.ts passes the live `floor.obstacles`).
 */
export function stepObstacles(
  obstacles: MovingObstacle[],
  grid: GridManager,
  snakeCells: ReadonlySet<string>,
  acidHexes: ReadonlySet<string> = new Set(),
): void {
  // Current obstacle positions (for mutual non-stacking).
  const occ = new Set(obstacles.map((o) => hexKey(o.hex)));
  const dead = new Set<number>();
  const acidActive = acidHexes.size > 0;

  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (!o) continue;

    // Dissolved by acid it is already standing on.
    if (acidActive && acidHexes.has(hexKey(o.hex))) {
      dead.add(i);
      occ.delete(hexKey(o.hex));
      continue;
    }

    o.moveCounter--;
    if (o.moveCounter > 0) continue;
    o.moveCounter = CONFIG.obstacleMoveEvery;

    const opts = neighbors(o.hex).filter((n) => {
      if (!grid.isPassable(n)) return false;
      if (snakeCells.has(hexKey(n))) return false;
      if (occ.has(hexKey(n))) return false;
      return true;
    });
    const pick = opts[Math.floor(Math.random() * opts.length)];
    if (!pick) continue;

    // Dissolved by acid it tries to cross into.
    if (acidActive && acidHexes.has(hexKey(pick))) {
      dead.add(i);
      occ.delete(hexKey(o.hex));
      continue;
    }

    occ.delete(hexKey(o.hex));
    o.prevHex = o.hex;
    o.hex = pick;
    occ.add(hexKey(pick));
  }

  // Sweep dissolved obstacles back-to-front so indices stay valid.
  for (let i = obstacles.length - 1; i >= 0; i--) {
    if (dead.has(i)) obstacles.splice(i, 1);
  }
}

export function obstacleAt(obstacles: readonly MovingObstacle[], h: Hex): boolean {
  return obstacles.some((o) => equals(o.hex, h));
}
