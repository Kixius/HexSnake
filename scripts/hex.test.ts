// Deterministic regression test for the pure hex math (no browser needed).
// Run: node --experimental-strip-types scripts/hex.test.ts
import { DIRS, NUM_DIRS, neighbor, opposite, distance, inBounds } from '../src/grid/hex.ts';

let failures = 0;
const fail = (msg: string) => {
  console.error('  FAIL: ' + msg);
  failures++;
};

// opposite(): the bug that caused reversals into the neck.
for (let i = 0; i < NUM_DIRS; i++) {
  const o = opposite(i);
  const d = DIRS[i]!;
  const od = DIRS[o]!;
  if (o !== (i + 3) % NUM_DIRS) fail(`opposite(${i})=${o}, expected ${(i + 3) % NUM_DIRS}`);
  if (od.q !== -d.q || od.r !== -d.r) fail(`opposite(${i}) is not the negated vector`);
  if (opposite(o) !== i) fail(`opposite(opposite(${i})) !== ${i}`);
}

// The three opposite pairs reported by the player: W/S, E/A, D/Q  <=>  N/S, NE/SW, SE/NW.
const isReverse = (heading: number, dir: number) => dir === opposite(heading);
if (!isReverse(0, 3)) fail('N vs S should be a reverse (W/S)');
if (!isReverse(1, 4)) fail('NE vs SW should be a reverse (E/A)');
if (!isReverse(2, 5)) fail('SE vs NW should be a reverse (D/Q)');
if (isReverse(0, 1)) fail('N vs NE should NOT be a reverse');
if (isReverse(0, 0)) fail('N vs N should NOT be a reverse');

// neighbor then back returns to the start.
const start = { q: 3, r: -2 };
for (let i = 0; i < NUM_DIRS; i++) {
  const n = neighbor(start, i);
  if (distance(start, n) !== 1) fail(`neighbor ${i} not distance 1`);
  const back = neighbor(n, opposite(i));
  if (back.q !== start.q || back.r !== start.r) fail(`step ${i} then opposite did not return`);
}

// inBounds sanity.
if (!inBounds({ q: 0, r: 0 }, 11)) fail('origin should be in bounds');
if (inBounds({ q: 12, r: 0 }, 11)) fail('q=12 should be out of bounds');

console.log(failures === 0 ? 'HEX TESTS: PASS' : `HEX TESTS: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
