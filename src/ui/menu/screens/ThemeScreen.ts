import { settingsStore } from '../../../settings/SettingsStore';
import { applyTheme, currentThemeId, THEME_ORDER } from '../../../theme';
import { backButton, listRow, screenTitle } from '../widgets';
import type { Screen } from '../types';

/** Theme picker. Selecting a preset persists it and recolors the whole game
 *  live (applyTheme mutates PALETTE in place; the settings subscription also
 *  re-applies on change). */
export const themeScreen: Screen = {
  render(ctx, ui, api, w, h) {
    screenTitle(ctx, w, h, 'THEME', 'pick a palette — applies live');

    const rowW = Math.min(360, w * 0.5);
    const rowH = 52;
    const gap = 12;
    const x = (w - rowW) / 2;
    let y = h * 0.26;
    const current = currentThemeId();
    for (const t of THEME_ORDER) {
      const selected = t.id === current;
      if (
        listRow(ctx, ui, {
          id: `theme.${t.id}`,
          x,
          y,
          w: rowW,
          h: rowH,
          label: t.name,
          value: selected ? 'ACTIVE' : undefined,
          selected,
        })
      ) {
        settingsStore.setTheme(t.id);
        applyTheme(t.id);
      }
      y += rowH + gap;
    }

    if (backButton(ctx, ui, w, h)) api.pop();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  },
};
