import { backButton, listRow, screenTitle } from '../widgets';
import type { Screen } from '../types';

/** Settings hub: entries to each settings sub-screen. */
export const settingsHubScreen: Screen = {
  render(ctx, ui, api, w, h) {
    screenTitle(ctx, w, h, 'SETTINGS');

    const rowW = Math.min(360, w * 0.5);
    const rowH = 54;
    const gap = 14;
    const x = (w - rowW) / 2;
    let y = h * 0.3;

    const entries: { id: string; label: string; target: 'keybinds' | 'music' | 'theme' }[] = [
      { id: 'set.keybinds', label: 'KEYBINDS', target: 'keybinds' },
      { id: 'set.music', label: 'MUSIC', target: 'music' },
      { id: 'set.theme', label: 'THEME', target: 'theme' },
    ];
    for (const e of entries) {
      if (listRow(ctx, ui, { id: e.id, x, y, w: rowW, h: rowH, label: e.label, value: '>' })) {
        api.push(e.target);
      }
      y += rowH + gap;
    }

    if (backButton(ctx, ui, w, h)) api.pop();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  },
};
