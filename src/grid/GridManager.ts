import { CONFIG } from '../config';
import { type Hex, hexesInRadius, hexKey, inBounds } from './hex';
import { Occupant } from '../game/types';

/**
 * Owns the playfield: which hex holds what. The snake's own body is NOT
 * tracked here (the SnakeController owns that) — only static/collectible
 * occupants: walls, slime, essence, chamber cores, and the portal.
 */
export class GridManager {
  readonly radius: number;
  private readonly occ = new Map<string, Occupant>();
  /** All in-bounds hexes (for iteration / generation). */
  readonly cells: readonly Hex[];

  constructor(radius: number = CONFIG.radius) {
    this.radius = radius;
    this.cells = hexesInRadius(radius);
    for (const c of this.cells) this.occ.set(hexKey(c), Occupant.Empty);
  }

  has(h: Hex): boolean {
    return inBounds(h, this.radius);
  }

  inBounds(h: Hex): boolean {
    return inBounds(h, this.radius);
  }

  occupantOf(h: Hex): Occupant {
    return this.occ.get(hexKey(h)) ?? Occupant.Empty;
  }

  setOccupant(h: Hex, o: Occupant): void {
    this.occ.set(hexKey(h), o);
  }

  clear(h: Hex): void {
    this.occ.set(hexKey(h), Occupant.Empty);
  }

  isPassable(h: Hex): boolean {
    return this.inBounds(h) && this.occupantOf(h) !== Occupant.Wall;
  }

  /** All empty in-bounds cells. */
  emptyCells(): Hex[] {
    return this.cells.filter((c) => this.occupantOf(c) === Occupant.Empty);
  }

  /** Count of a given occupant type across the floor. */
  count(o: Occupant): number {
    let n = 0;
    for (const v of this.occ.values()) if (v === o) n++;
    return n;
  }
}
