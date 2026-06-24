import { UPGRADES } from '../../../upgrades/registry';
import { drawCard } from '../../paint';
import { backButton, paginator, screenTitle } from '../widgets';
import type { Screen } from '../types';

/** Browse every mutation in the pool, reusing the upgrade-card renderer.
 *  One row of three full-size cards per page (keeps descriptions readable). */
const PER_PAGE = 3;
const COLS = 3;
let page = 0;

export const cardGalleryScreen: Screen = {
  render(ctx, ui, api, w, h) {
    screenTitle(ctx, w, h, 'CARD GALLERY', `${UPGRADES.length} mutations`);
    const pageCount = Math.max(1, Math.ceil(UPGRADES.length / PER_PAGE));
    if (page > pageCount - 1) page = pageCount - 1;
    if (page < 0) page = 0;

    const gap = 18;
    const availW = w * 0.92;
    const colW = (availW - gap * (COLS - 1)) / COLS;
    const colH = h * 0.6;
    const startX = (w - availW) / 2;
    const startY = h * 0.16;

    const startIdx = page * PER_PAGE;
    for (let i = 0; i < PER_PAGE; i++) {
      const def = UPGRADES[startIdx + i];
      if (!def) continue;
      const x = startX + i * (colW + gap);
      drawCard(ctx, { x, y: startY, w: colW, h: colH }, def);
    }

    const newPage = paginator(ctx, ui, {
      id: 'gallery.page',
      x: w * 0.25,
      y: h * 0.82,
      w: w * 0.5,
      page,
      pageCount,
    });
    if (newPage !== page) page = newPage;

    if (backButton(ctx, ui, w, h)) {
      page = 0;
      api.pop();
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  },
};
