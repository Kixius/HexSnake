import { PALETTE } from '../../config';
import { FONT, dim } from '../paint';
import { mainScreen } from './screens/MainScreen';
import { cardGalleryScreen } from './screens/CardGalleryScreen';
import { keybindsScreen } from './screens/KeybindsScreen';
import { musicScreen } from './screens/MusicScreen';
import { difficultyScreen } from './screens/DifficultyScreen';
import { settingsHubScreen } from './screens/SettingsHubScreen';
import { themeScreen } from './screens/ThemeScreen';
import type { MenuApi, Screen, ScreenId } from './types';
import { UiContext } from './UiContext';
import { button } from './widgets';
import { settingsStore } from '../../settings/SettingsStore';

export interface MenuActions {
  startRun(): void;
  exit(): void;
}

const SCREEN_TITLES: Record<ScreenId, string> = {
  main: 'HEXSNAKE',
  settings: 'SETTINGS',
  keybinds: 'KEYBINDS',
  music: 'MUSIC',
  theme: 'THEME',
  gallery: 'CARD GALLERY',
  difficulty: 'DIFFICULTY',
};

/**
 * Owns the menu: a screen stack (Back = pop), a single `UiContext`, and input
 * dispatch. Renders under `State.Menu` only. Screens are stateless and read
 * authoritative values from settingsStore/theme; navigation flows through `api`.
 * New screens plug in via `register` (later phases) — adding a screen is the only
 * change needed to extend the menu.
 */
export class MenuController {
  private ui = new UiContext();
  private stack: ScreenId[] = ['main'];
  private w = 0;
  private h = 0;
  private screens: Partial<Record<ScreenId, Screen>> = {
    main: mainScreen,
    settings: settingsHubScreen,
    theme: themeScreen,
    music: musicScreen,
    difficulty: difficultyScreen,
    keybinds: keybindsScreen,
    gallery: cardGalleryScreen,
  };
  private readonly api: MenuApi;

  constructor(actions: MenuActions) {
    this.api = {
      push: (id) => this.push(id),
      pop: () => this.pop(),
      startRun: () => actions.startRun(),
      exit: () => actions.exit(),
    };
  }

  /** Register a screen (settings/keybinds/music/theme/gallery in later phases). */
  register(id: ScreenId, screen: Screen): void {
    this.screens[id] = screen;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  /** Return to the top screen + clear interaction state (on entering the menu). */
  reset(): void {
    this.stack = ['main'];
    this.ui.clearInteraction();
  }

  private top(): ScreenId {
    return this.stack[this.stack.length - 1] ?? 'main';
  }

  private push(id: ScreenId): void {
    if (this.top() === id) return;
    this.stack.push(id);
    this.ui.focusId = null;
  }

  private pop(): void {
    if (this.stack.length > 1) this.stack.pop();
    this.ui.focusId = null;
  }

  // ---- input ----

  onPointerMove(x: number, y: number, inside: boolean): void {
    this.ui.setPointer(x, y, inside);
  }

  onPointerDown(x: number, y: number): void {
    this.ui.press(x, y);
  }

  onPointerUp(): void {
    this.ui.release();
  }

  /** Returns true if the key was consumed (caller should preventDefault). */
  onKey(e: KeyboardEvent): boolean {
    const screen = this.screens[this.top()];
    if (screen?.onKey?.(e, this.ui)) return true;
    // Directional nav follows the player's (rebindable) movement keys, so the
    // menu reacts to whatever they're currently using in-game: N=up, S=down,
    // NW/SW=left, NE/SE=right. Arrow keys always work too.
    const kb = settingsStore.keybinds;
    if (e.code === kb.dir0) {
      this.ui.nav.up = true;
      return true;
    }
    if (e.code === kb.dir3) {
      this.ui.nav.down = true;
      return true;
    }
    if (e.code === kb.dir4 || e.code === kb.dir5) {
      this.ui.nav.left = true;
      return true;
    }
    if (e.code === kb.dir1 || e.code === kb.dir2) {
      this.ui.nav.right = true;
      return true;
    }
    switch (e.code) {
      case 'Escape':
        this.pop();
        return true;
      case 'ArrowUp':
        this.ui.nav.up = true;
        return true;
      case 'ArrowDown':
        this.ui.nav.down = true;
        return true;
      case 'ArrowLeft':
        this.ui.nav.left = true;
        return true;
      case 'ArrowRight':
        this.ui.nav.right = true;
        return true;
      case 'Enter':
      case 'Space':
        this.ui.nav.activate = true;
        return true;
      default:
        return false;
    }
  }

  // ---- render ----

  render(ctx: CanvasRenderingContext2D): void {
    // Opaque backdrop so no stale game frame shows through.
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    this.ui.begin();
    const screen = this.screens[this.top()];
    if (screen) {
      screen.render(ctx, this.ui, this.api, this.w, this.h);
    } else {
      this.renderPlaceholder(ctx, this.top());
    }
    this.ui.end();
  }

  /** Shown for screens not yet registered (replaced screen-by-screen in later phases). */
  private renderPlaceholder(ctx: CanvasRenderingContext2D, id: ScreenId): void {
    dim(ctx, this.w, this.h, 0.85);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(SCREEN_TITLES[id] ?? id.toUpperCase(), this.w / 2, this.h * 0.4);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('coming soon', this.w / 2, this.h * 0.4 + 44);
    const bw = 160;
    if (
      button(ctx, this.ui, {
        id: 'placeholder.back',
        x: this.w / 2 - bw / 2,
        y: this.h * 0.55,
        w: bw,
        h: 44,
        label: 'BACK',
      })
    ) {
      this.pop();
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }
}
