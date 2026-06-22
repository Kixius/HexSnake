import { CONFIG } from '../config';
import { type Hex, equals, hexKey, neighbors } from '../grid/hex';
import { type MovingObstacle } from '../game/types';
import type { GridManager } from '../grid/GridManager';

/**
 * Moving obstacles roam the floor one hex at a time. They AVOID the snake's
 * occupied cells and each other, so they never insta-kill by parking on the
 * head — the danger is the snake steering INTO one (handled in SnakeController
 * step #2). Obstacles are tracked in the Floor, not in GridManager occupancy.
 */
export function stepObstacles(
  obstacles: MovingObstacle[],
  grid: GridManager,
  snakeCells: ReadonlySet<string>,
): void {
  // Current obstacle positions (for mutual non-stacking).
  const occ = new Set(obstacles.map((o) => hexKey(o.hex)));

  for (const o of obstacles) {
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

    occ.delete(hexKey(o.hex));
    o.prevHex = o.hex;
    o.hex = pick;
    occ.add(hexKey(pick));
  }
}

export function obstacleAt(obstacles: readonly MovingObstacle[], h: Hex): boolean {
  return obstacles.some((o) => equals(o.hex, h));
}
