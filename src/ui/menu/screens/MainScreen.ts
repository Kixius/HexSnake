import { PALETTE } from '../../../config';
import { FONT, drawControls } from '../../paint';
import { logo } from '../Logo';
import { isTauri } from '../../../platform/tauri';
import { button } from '../widgets';
import type { Screen } from '../types';

/**
 * Title screen: logo (or text fallback) up top, a vertical stack of buttons
 * (NEW GAME / SETTINGS / CARD GALLERY, plus EXIT on desktop), and the hex
 * controls diagram with a navigation hint always visible.
 */
export const mainScreen: Screen = {
  render(ctx, ui, api, w, h) {
    // Backdrop.
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ---- Logo or text fallback ----
    const logoBoxW = Math.min(w * 0.6, 560);
    const logoBoxH = h * 0.22;
    const logoBoxX = (w - logoBoxW) / 2;
    const logoBoxY = h * 0.07;
    if (logo.ready) {
      logo.draw(ctx, logoBoxX, logoBoxY, logoBoxW, logoBoxH);
    } else {
      ctx.font = `bold 72px ${FONT}`;
      ctx.fillStyle = PALETTE.teal;
      ctx.shadowColor = PALETTE.headGlow;
      ctx.shadowBlur = 24;
      ctx.fillText('HEX' + 'SNAKE', w / 2, logoBoxY + logoBoxH * 0.45);
      ctx.shadowBlur = 0;
      ctx.font = `18px ${FONT}`;
      ctx.fillStyle = PALETTE.textDim;
      ctx.fillText('snake on a hex grid · roguelike depths', w / 2, logoBoxY + logoBoxH * 0.45 + 52);
    }

    // ---- Buttons ----
    const bw = Math.min(280, w * 0.32);
    const bh = 48;
    const gap = 14;
    const bx = (w - bw) / 2;

    const items: { id: string; label: string; fn: () => void }[] = [
      { id: 'btn.newgame', label: 'NEW GAME', fn: () => api.startRun() },
      { id: 'btn.settings', label: 'SETTINGS', fn: () => api.push('settings') },
      { id: 'btn.gallery', label: 'CARD GALLERY', fn: () => api.push('gallery') },
    ];
    if (isTauri()) {
      items.push({ id: 'btn.exit', label: 'EXIT', fn: () => api.exit() });
    }

    let by = h * 0.46;
    for (const it of items) {
      if (button(ctx, ui, { id: it.id, x: bx, y: by, w: bw, h: bh, label: it.label })) {
        it.fn();
      }
      by += bh + gap;
    }

    // ---- Controls diagram (always visible) ----
    drawControls(ctx, w / 2, h * 0.82, 'move: Q W E / A S D   ·   ENTER = select   ·   ESC = back');

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  },
};
