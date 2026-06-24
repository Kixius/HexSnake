/**
 * Immediate-mode UI core for the menu system. One `UiContext` is reused every
 * frame: widgets `register` their rects while drawing and call `interact` to get
 * hover/focus/activate state. Directional keyboard nav is resolved against the
 * previous frame's rects at `begin()`; mouse and keyboard share a single
 * `focusId` (moving the mouse snaps focus to whatever it's over; idle mouse
 * leaves keyboard focus untouched). This mirrors how `Overlays` already rebuilds
 * its hit-test list each draw, but generalizes it.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Rect extends Box {
  id: string;
}

export interface InteractResult {
  hover: boolean;
  focused: boolean;
  activated: boolean;
}

export type NavDir = 'up' | 'down' | 'left' | 'right';

export class UiContext {
  // cross-frame state
  focusId: string | null = null;
  mouseX = 0;
  mouseY = 0;
  hasMouse = false;
  pointerDown = false;
  /** Active slider drag owner, or null. */
  dragId: string | null = null;

  /** Keyboard intents set between frames by the controller; consumed in begin/end. */
  readonly nav = { up: false, down: false, left: false, right: false, activate: false };

  // per-frame
  private rects: Rect[] = [];
  private hoverId: string | null = null;
  private prevRects: Rect[] = [];
  private clickPending = false;
  private clickConsumed = false;
  private mouseMoved = false;

  // ---- input setters (called by MenuController between frames) ----

  setPointer(x: number, y: number, inside: boolean): void {
    this.mouseX = x;
    this.mouseY = y;
    this.hasMouse = inside;
    this.mouseMoved = true;
  }

  /** Pointer pressed: records a click (activates hovered widget this frame) and
   *  may start a slider drag. */
  press(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
    this.hasMouse = true;
    this.pointerDown = true;
    this.clickPending = true;
    this.mouseMoved = true;
  }

  release(): void {
    this.pointerDown = false;
    this.dragId = null;
  }

  /** Clear all interaction state (on entering the menu, to avoid stale presses). */
  clearInteraction(): void {
    this.pointerDown = false;
    this.dragId = null;
    this.focusId = null;
    this.clickPending = false;
    this.clickConsumed = false;
    this.nav.up = false;
    this.nav.down = false;
    this.nav.left = false;
    this.nav.right = false;
    this.nav.activate = false;
  }

  // ---- per-frame lifecycle ----

  begin(): void {
    this.rects.length = 0;
    this.hoverId = null;
    this.clickConsumed = false;
    // Resolve directional moves against last frame's layout (stable across frames
    // on the same screen).
    const dir: NavDir | null = this.nav.up
      ? 'up'
      : this.nav.down
        ? 'down'
        : this.nav.left
          ? 'left'
          : this.nav.right
            ? 'right'
            : null;
    if (dir) this.focusId = spatialNav(this.prevRects, this.focusId, dir);
  }

  /** Register a focusable rect AND query its interaction state. */
  interact(id: string, box: Box): InteractResult {
    this.rects.push({ id, x: box.x, y: box.y, w: box.w, h: box.h });
    const hover = this.hasMouse && pointInRect(this.mouseX, this.mouseY, box);
    if (hover) this.hoverId = id;
    const focused = this.focusId === id;
    const clicked = hover && this.clickPending && !this.clickConsumed;
    if (clicked) this.clickConsumed = true;
    const activated = clicked || (focused && this.nav.activate);
    return { hover, focused, activated };
  }

  /** Slider drag: call during render. Returns true while this widget owns the drag. */
  drag(id: string, box: Box): boolean {
    if (this.dragId === id) return true;
    const hover = this.hasMouse && pointInRect(this.mouseX, this.mouseY, box);
    if (hover && this.clickPending && !this.clickConsumed && this.dragId === null) {
      this.dragId = id;
      this.clickConsumed = true;
      return true;
    }
    return false;
  }

  isDragging(id: string): boolean {
    return this.dragId === id;
  }

  end(): void {
    // Mouse snaps focus only when it actually moved (idle mouse yields to keyboard).
    if (this.mouseMoved && this.hoverId !== null) this.focusId = this.hoverId;
    // Clamp focus to a currently-registered rect (handles screen changes).
    if (this.focusId !== null && !this.rects.some((r) => r.id === this.focusId)) {
      this.focusId = null;
    }
    if (this.focusId === null && this.rects.length > 0) {
      const first = this.rects[0];
      if (first) this.focusId = first.id;
    }
    this.prevRects = this.rects.slice();
    this.clickPending = false;
    this.mouseMoved = false;
    this.nav.up = false;
    this.nav.down = false;
    this.nav.left = false;
    this.nav.right = false;
    this.nav.activate = false;
    if (!this.pointerDown) this.dragId = null;
  }
}

function pointInRect(x: number, y: number, b: Box): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

/** Best-focus target from `id` moving in `dir` across `rects` (spatial nearest). */
function spatialNav(rects: Rect[], fromId: string | null, dir: NavDir): string | null {
  if (rects.length === 0) return null;
  const from = fromId ? rects.find((r) => r.id === fromId) : null;
  if (!from) {
    const first = rects[0];
    return first ? first.id : null;
  }
  const fcx = from.x + from.w / 2;
  const fcy = from.y + from.h / 2;
  let best: Rect | null = null;
  let bestScore = Infinity;
  for (const c of rects) {
    if (c.id === from.id) continue;
    const dx = c.x + c.w / 2 - fcx;
    const dy = c.y + c.h / 2 - fcy;
    let forward: number;
    let lateral: number;
    if (dir === 'down') {
      if (dy <= 0) continue;
      forward = dy;
      lateral = Math.abs(dx);
    } else if (dir === 'up') {
      if (dy >= 0) continue;
      forward = -dy;
      lateral = Math.abs(dx);
    } else if (dir === 'right') {
      if (dx <= 0) continue;
      forward = dx;
      lateral = Math.abs(dy);
    } else {
      if (dx >= 0) continue;
      forward = -dx;
      lateral = Math.abs(dy);
    }
    const score = forward + lateral * 2;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best ? best.id : fromId;
}
