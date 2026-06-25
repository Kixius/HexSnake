import { PALETTE } from '../../../config';
import { FONT } from '../../paint';
import { settingsStore } from '../../../settings/SettingsStore';
import { DEFAULT_KEYBINDS } from '../../../settings/defaults';
import {
  ACTION_LABELS,
  ALL_ACTIONS,
  findConflict,
  formatCode,
  isReservedCode,
} from '../../../settings/Keybinds';
import type { ActionId } from '../../../settings/types';
import { button, label, listRow, screenTitle } from '../widgets';
import type { Screen } from '../types';

/**
 * Keybind reassignment. Activate a row (click or focused Enter) to enter
 * "press a key" capture; the next keydown is bound to that action (reserved
 * keys and conflicts are rejected with a message; Esc cancels). Bindings persist
 * via the settings store and re-apply to Input through the store subscription.
 */
let rebinding: ActionId | null = null;
let message = '';

export const keybindsScreen: Screen = {
  render(ctx, ui, api, w, h) {
    screenTitle(ctx, w, h, 'KEYBINDS', 'select a row, then press a new key');

    const kb = settingsStore.keybinds;
    const rowW = Math.min(440, w * 0.62);
    const gap = 6;
    const x = (w - rowW) / 2;
    // Rows scale to fit between the subtitle and the action bar so all 9 actions
    // stay visible (and clickable) even at the minimum window height.
    const top = h * 0.2;
    const bottomLimit = h * 0.82;
    const rowH = Math.max(
      26,
      Math.min(42, Math.floor((bottomLimit - top - gap * (ALL_ACTIONS.length - 1)) / ALL_ACTIONS.length)),
    );
    let y = top;
    for (const action of ALL_ACTIONS) {
      const isRebind = rebinding === action;
      const code = kb[action];
      if (
        listRow(ctx, ui, {
          id: `kb.${action}`,
          x,
          y,
          w: rowW,
          h: rowH,
          label: ACTION_LABELS[action],
          value: isRebind ? 'press a key…' : formatCode(code),
          selected: isRebind,
        })
      ) {
        rebinding = action;
        message = '';
      }
      y += rowH + gap;
    }

    if (message) {
      label(ctx, x, y + 4, message, { color: PALETTE.danger, font: `14px ${FONT}` });
    }

    // RESET DEFAULTS + BACK, side by side so they share one row.
    const btnY = h * 0.9;
    const btnH = 44;
    const bw = Math.min(200, w * 0.3);
    if (
      button(ctx, ui, {
        id: 'kb.reset',
        x: w / 2 - bw - 10,
        y: btnY,
        w: bw,
        h: btnH,
        label: 'RESET DEFAULTS',
      })
    ) {
      settingsStore.setKeybinds({ ...DEFAULT_KEYBINDS });
      rebinding = null;
      message = '';
    }
    if (
      button(ctx, ui, {
        id: 'screen.back',
        x: w / 2 + 10,
        y: btnY,
        w: bw,
        h: btnH,
        label: 'BACK',
      })
    ) {
      rebinding = null;
      message = '';
      api.pop();
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  },

  onKey(e) {
    if (rebinding === null) return false;
    if (e.code === 'Escape') {
      rebinding = null;
      message = '';
      return true;
    }
    if (isReservedCode(e.code)) {
      message = `"${formatCode(e.code)}" is reserved for menus`;
      return true;
    }
    const conflict = findConflict(settingsStore.keybinds, rebinding, e.code);
    if (conflict !== null) {
      message = `"${formatCode(e.code)}" is used by ${ACTION_LABELS[conflict]}`;
      return true;
    }
    settingsStore.setKeybinds({ ...settingsStore.keybinds, [rebinding]: e.code });
    rebinding = null;
    message = '';
    return true;
  },
};
