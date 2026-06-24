import type { UiContext } from './UiContext';

/** All reachable menu screens. The controller keeps a stack of these. */
export type ScreenId = 'main' | 'settings' | 'keybinds' | 'music' | 'theme' | 'gallery';

/** Actions a screen can request of the controller (navigation + run lifecycle). */
export interface MenuApi {
  push(id: ScreenId): void;
  pop(): void;
  startRun(): void;
  exit(): void;
}

/** A menu screen: pure render + optional key handler. Stateless across frames
 *  (reads authoritative state from settingsStore / theme); the controller owns
 *  navigation, so screens stay dumb about their siblings. */
export interface Screen {
  render(ctx: CanvasRenderingContext2D, ui: UiContext, api: MenuApi, w: number, h: number): void;
  /** Runs before default nav when present. Return true if the key is consumed. */
  onKey?(e: KeyboardEvent, ui: UiContext): boolean;
}
