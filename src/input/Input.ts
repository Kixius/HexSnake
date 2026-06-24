import { type Direction } from '../game/types';
import { opposite } from '../grid/hex';
import { NUMPAD_DIR_CODES, shiftSibling } from '../settings/Keybinds';
import type { Keybinds } from '../settings/types';

/**
 * Keyboard input: maps the 6 hex directions onto keys, buffers them in a small
 * FIFO queue, and filters out illegal 180° reverses.
 *
 *   Q W E   ->   NW  N  NE
 *   A S D   ->   SW  S  SE
 *
 * Bindings are configurable via `applyKeybinds` (loaded from saved settings).
 * The numpad mirror (7/8/9 top, 1/2/3 bottom, 4/6) is layered on top and is NOT
 * remappable, preserving the documented "numpad also works" convenience.
 */

const MAX_QUEUE = 3;

export class Input {
  private queue: Direction[] = [];
  private phaseRequested = false;
  private slipRequested = false;
  /** Becomes true on first direction press (used to launch a floor). */
  private directed = false;
  private handler = (e: KeyboardEvent) => this.onKeyDown(e);

  // Configurable bindings. Empty until applyKeybinds() runs.
  private dirByCode: Map<string, Direction> = new Map();
  private phaseCode = 'Space';
  private slipCode = 'ShiftLeft';
  private slipCodeAlt = 'ShiftRight';

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

  /** (Re)build key->action maps from saved settings. Call on startup + on rebind. */
  applyKeybinds(kb: Keybinds): void {
    const m = new Map<string, Direction>();
    m.set(kb.dir0, 0);
    m.set(kb.dir1, 1);
    m.set(kb.dir2, 2);
    m.set(kb.dir3, 3);
    m.set(kb.dir4, 4);
    m.set(kb.dir5, 5);
    // Numpad mirror is non-remappable; layer it on top.
    for (const [code, dir] of Object.entries(NUMPAD_DIR_CODES)) m.set(code, dir);
    this.dirByCode = m;
    this.phaseCode = kb.phase;
    this.slipCode = kb.slip;
    this.slipCodeAlt = shiftSibling(kb.slip);
  }

  private onKeyDown(e: KeyboardEvent): void {
    const d = this.dirByCode.get(e.code);
    if (d !== undefined) {
      this.enqueue(d);
      this.directed = true;
      e.preventDefault();
      return;
    }
    if (e.code === this.phaseCode) {
      this.phaseRequested = true;
      e.preventDefault();
      return;
    }
    if (e.code === this.slipCode || e.code === this.slipCodeAlt) {
      this.slipRequested = true;
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

  consumePhase(): boolean {
    const r = this.phaseRequested;
    this.phaseRequested = false;
    return r;
  }

  consumeSlip(): boolean {
    const r = this.slipRequested;
    this.slipRequested = false;
    return r;
  }

  /** Discard queued directions (e.g. keys mashed during an overlay screen). */
  clearQueue(): void {
    this.queue.length = 0;
  }

  resetFloor(): void {
    this.queue.length = 0;
    this.phaseRequested = false;
    this.slipRequested = false;
    this.directed = false;
  }
}
