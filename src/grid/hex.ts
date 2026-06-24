/**
 * Pure flat-top axial hex math. No state, no canvas, no I/O.
 * Reference: Red Blob Games, "Hexagonal Grids" (flat-top axial system).
 *
 * Direction ordering is CLOCKWISE from North and doubles as the control
 * index used everywhere (see Input.ts for the QWE/ASD key map):
 *
 *   index  name  (dq, dr)   key
 *     0    N     ( 0, -1)   W
 *     1    NE    (+1, -1)   E
 *     2    SE    (+1,  0)   D
 *     3    S     ( 0, +1)   S
 *     4    SW    (-1, +1)   A
 *     5    NW    (-1,  0)   Q
 *
 * Opposite direction = (index + 3) % 6.
 */

export interface Hex {
  q: number;
  r: number;
}

export const DIRS: readonly Hex[] = [
  { q: 0, r: -1 }, // 0 N
  { q: 1, r: -1 }, // 1 NE
  { q: 1, r: 0 }, // 2 SE
  { q: 0, r: 1 }, // 3 S
  { q: -1, r: 1 }, // 4 SW
  { q: -1, r: 0 }, // 5 NW
];

export const DIR_NAMES = ['N', 'NE', 'SE', 'S', 'SW', 'NW'] as const;
export const NUM_DIRS = 6;

export function makeHex(q: number, r: number): Hex {
  return { q, r };
}

export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`;
}

export function equals(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}

export function clone(h: Hex): Hex {
  return { q: h.q, r: h.r };
}

/** Safe direction lookup; throws on out-of-range so index bugs fail loudly. */
export function dir(i: number): Hex {
  const d = DIRS[i];
  if (!d) throw new Error(`Invalid direction index: ${i}`);
  return d;
}

export function opposite(i: number): number {
  // The opposite direction is 3 steps away (180°) on a 6-direction hex.
  return ((((i + 3) % NUM_DIRS) + NUM_DIRS) % NUM_DIRS);
}

export function add(a: Hex, b: Hex): Hex {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function neighbor(h: Hex, i: number): Hex {
  return add(h, dir(i));
}

/** All 6 neighbors (in-bounds-ness is the caller's concern). */
export function neighbors(h: Hex): Hex[] {
  return DIRS.map((d) => add(h, d));
}

/**
 * Direction index from `from` to an adjacent `to`, or null if `to` is not a
 * direct neighbor. Used to derive headings from segment pairs (e.g. Hydra split).
 */
export function directionOf(from: Hex, to: Hex): number | null {
  for (let i = 0; i < NUM_DIRS; i++) {
    const d = DIRS[i];
    if (d && from.q + d.q === to.q && from.r + d.r === to.r) return i;
  }
  return null;
}

/** Hex distance in steps. */
export function distance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/** In a hexagonal arena of `radius` centered at origin. */
export function inBounds(h: Hex, radius: number): boolean {
  return Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r)) <= radius;
}

/** Flat-top axial -> pixel. `size` = center-to-corner distance. */
export function hexToPixel(h: Hex, size: number): { x: number; y: number } {
  const x = size * 1.5 * h.q;
  const y = size * (Math.sqrt(3) / 2 * h.q + Math.sqrt(3) * h.r);
  return { x, y };
}

/** Pixel -> axial with cube rounding (re-enforces q + r + s = 0). */
export function pixelToHex(x: number, y: number, size: number): Hex {
  const qFrac = ((2 / 3) * x) / size;
  const rFrac = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / size;
  return cubeRound(qFrac, rFrac);
}

function cubeRound(qFrac: number, rFrac: number): Hex {
  const sFrac = -qFrac - rFrac;
  let q = Math.round(qFrac);
  let r = Math.round(rFrac);
  const s = Math.round(sFrac);
  const qDiff = Math.abs(q - qFrac);
  const rDiff = Math.abs(r - rFrac);
  const sDiff = Math.abs(s - sFrac);
  // Reset the axis with the largest rounding error so q + r + s = 0 holds.
  if (qDiff > rDiff && qDiff > sDiff) {
    q = -r - s;
  } else if (rDiff > sDiff) {
    r = -q - s;
  }
  return { q, r };
}

/** Every hex in a hexagonal arena of `radius` centered at the origin. */
export function hexesInRadius(radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      out.push({ q, r });
    }
  }
  return out;
}
