import { settingsStore } from '../../../settings/SettingsStore';
import { DIFFICULTY, DIFFICULTY_ORDER } from '../../../config';
import { backButton, listRow, screenTitle } from '../widgets';
import type { Screen } from '../types';

/** Difficulty picker. Selecting a level persists it; it applies to the next run
 *  (and any in-progress run keeps its own frozen difficulty). Non-active rows
 *  show their speed/points multipliers; the active row shows ACTIVE. */
export const difficultyScreen: Screen = {
  render(ctx, ui, api, w, h) {
    screenTitle(ctx, w, h, 'DIFFICULTY', 'applies to the next run');

    const rowW = Math.min(380, w * 0.55);
    const rowH = 52;
    const gap = 12;
    const x = (w - rowW) / 2;
    let y = h * 0.26;
    const current = settingsStore.difficulty;
    for (const id of DIFFICULTY_ORDER) {
      const d = DIFFICULTY[id];
      const selected = id === current;
      const value = selected ? 'ACTIVE' : `${d.speedMult}× speed · ${d.scoreMult}× pts`;
      if (
        listRow(ctx, ui, {
          id: `diff.${id}`,
          x,
          y,
          w: rowW,
          h: rowH,
          label: d.label,
          value,
          selected,
        })
      ) {
        settingsStore.setDifficulty(id);
      }
      y += rowH + gap;
    }

    if (backButton(ctx, ui, w, h)) api.pop();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  },
};
