import { type Direction } from '../game/types';
import { opposite } from '../grid/hex';

/**
 * Keyboard input: maps the 6 hex directions onto keys, buffers them in a small
 * FIFO queue, and filters out illegal 180° reverses.
 *
 *   Q W E   ->   NW  N  NE
 *   A S D   ->   SW  S  SE
 *
 * Numpad (7/8/9 top, 1/2/3 bottom) and 4/6 are also accepted.
 */

const KEY_TO_DIR: Record<string, Direction> = {
  // Letter layout (primary)
  KeyW: 0, // N
  KeyE: 1, // NE
  KeyD: 2, // SE
  KeyS: 3, // S
  KeyA: 4, // SW
  KeyQ: 5, // NW
  // Numpad mirror
  Numpad8: 0, // N
  Numpad9: 1, // NE
  Numpad3: 2, // SE
  Numpad2: 3, // S
  Numpad1: 4, // SW
  Numpad7: 5, // NW
  // Extra numpad horizontals (spec's set omits clean L/R)
  Numpad4: 5, // NW
  Numpad6: 1, // NE
};

const MAX_QUEUE = 3;

export class Input {
  private queue: Direction[] = [];
  private phaseRequested = false;
  /** Becomes true on first direction press (used to launch a floor). */
  private directed = false;
  private handler = (e: KeyboardEvent) => this.onKeyDown(e);

  attach(): void {
    window.addEventListener('keydown', this.handler);
  }
  detach(): void {
    window.removeEventListener('keydown', this.handler);
  }

  /** True once the player has pressed any direction this floor. */
  get hasDirected(): boolean {
    return this.directed;
  }

  private onKeyDown(e: KeyboardEvent): void {
    const d = KEY_TO_DIR[e.code];
    if (d !== undefined) {
      this.enqueue(d);
      this.directed = true;
      e.preventDefault();
      return;
    }
    if (e.code === 'Space') {
      this.phaseRequested = true;
      e.preventDefault();
    }
  }

  private enqueue(d: Direction): void {
    const tail = this.queue[this.queue.length - 1];
    if (tail !== undefined && tail === d) return; // dedupe key repeats
    if (this.queue.length < MAX_QUEUE) this.queue.push(d);
  }

  /**
   * Pull exactly one legal direction. Drops any queued 180° reverse relative to
   * the (post-turn) heading and keeps looking. Returns null if none legal.
   */
  consumeNext(heading: Direction): Direction | null {
    while (this.queue.length > 0) {
      const d = this.queue.shift();
      if (d === undefined) break;
      if (d !== opposite(heading)) return d;
    }
    return null;
  }

  /**
   * What consumeNext would return right now, WITHOUT removing it. Used by the
   * responsive-turn flush to decide whether to apply input immediately.
   */
  peekApplied(heading: Direction): Direction | null {
    for (const d of this.queue) {
      if (d !== opposite(heading)) return d;
    }
    return null;
  }

  consumePhase(): boolean {
    const r = this.phaseRequested;
    this.phaseRequested = false;
    return r;
  }

  /** Discard queued directions (e.g. keys mashed during an overlay screen). */
  clearQueue(): void {
    this.queue.length = 0;
  }

  resetFloor(): void {
    this.queue.length = 0;
    this.phaseRequested = false;
    this.directed = false;
  }
}
