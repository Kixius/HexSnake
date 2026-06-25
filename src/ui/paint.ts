import { PALETTE } from '../config';
import { DIR_NAMES } from '../grid/hex';
import { rarityColor } from '../upgrades/registry';
import type { MutationDef } from '../upgrades/registry';

/** Shared font + low-level draw helpers used by both Overlays and the menu
 *  system, so neither depends on the other's class instance. */

export const FONT = "'Consolas', 'Courier New', monospace";

export interface CardBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Full-canvas dimming backdrop. */
export function dim(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number): void {
  ctx.fillStyle = `rgba(8,10,14,${alpha})`;
  ctx.fillRect(0, 0, w, h);
}

/** Greedy word-wrap text writer (text alignment/baseline/font set by caller). */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
): number {
  const words = text.split(' ');
  let line = '';
  let ly = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, ly);
      line = word;
      ly += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, ly);
  return ly; // last baseline drawn (for chaining)
}

/** Draw a mutation card into `box`. `index` adds the "[ n ]" pick badge. */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  box: CardBox,
  def: MutationDef,
  index?: number,
): void {
  const color = rarityColor(def.rarity);
  ctx.fillStyle = '#12182250';
  ctx.fillRect(box.x, box.y, box.w, box.h);
  // rarity top band
  ctx.fillStyle = color;
  ctx.fillRect(box.x, box.y, box.w, 6);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.strokeRect(box.x, box.y, box.w, box.h);

  const pad = 18;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  ctx.fillStyle = color;
  ctx.font = `12px ${FONT}`;
  ctx.fillText(def.rarity.toUpperCase(), box.x + pad, box.y + 22);

  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 22px ${FONT}`;
  wrapText(ctx, def.name, box.x + pad, box.y + 52, box.w - pad * 2, 26);

  if (def.flavor) {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = color;
    ctx.font = `italic 13px ${FONT}`;
    wrapText(ctx, def.flavor, box.x + pad, box.y + 92, box.w - pad * 2, 16);
    ctx.restore();
  }

  ctx.fillStyle = PALETTE.textDim;
  ctx.font = `15px ${FONT}`;
  wrapText(ctx, def.description, box.x + pad, box.y + 130, box.w - pad * 2, 22);

  if (index !== undefined) {
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText(`[ ${index + 1} ]`, box.x + pad, box.y + box.h - 34);
  }
}

/** The 2x3 hex key diagram centered at (cx, cy). `keys` (optional) overrides the
 *  default Q/W/E · A/S/D labels so the diagram reflects the player's current
 *  bindings — layout is [[NW,N,NE],[SW,S,SE]]. */
export function drawControls(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hint?: string | null,
  keys?: string[][],
): void {
  const r0 = keys?.[0];
  const r1 = keys?.[1];
  const layout: { key: string; dir: string }[][] = [
    [
      { key: r0?.[0] ?? 'Q', dir: DIR_NAMES[5] },
      { key: r0?.[1] ?? 'W', dir: DIR_NAMES[0] },
      { key: r0?.[2] ?? 'E', dir: DIR_NAMES[1] },
    ],
    [
      { key: r1?.[0] ?? 'A', dir: DIR_NAMES[4] },
      { key: r1?.[1] ?? 'S', dir: DIR_NAMES[3] },
      { key: r1?.[2] ?? 'D', dir: DIR_NAMES[2] },
    ],
  ];
  const ks = 38;
  const gap = 8;
  const rowW = 3 * ks + 2 * gap;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 18px ${FONT}`;
  for (let r = 0; r < 2; r++) {
    const row = layout[r];
    if (!row) continue;
    const startX = cx - rowW / 2;
    const y = cy - ks + r * (ks + gap + 14);
    for (let c = 0; c < 3; c++) {
      const cell = row[c];
      if (!cell) continue;
      const x = startX + c * (ks + gap);
      ctx.fillStyle = PALETTE.grid;
      ctx.fillRect(x, y, ks, ks);
      ctx.lineWidth = 2;
      ctx.strokeStyle = PALETTE.teal;
      ctx.strokeRect(x, y, ks, ks);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillText(cell.key, x + ks / 2, y + ks / 2);
      ctx.font = `10px ${FONT}`;
      ctx.fillStyle = PALETTE.textDim;
      ctx.fillText(cell.dir, x + ks / 2, y + ks + 8);
    }
  }
  if (hint !== null) {
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(hint ?? 'numpad 7/8/9 · 1/2/3 also work  ·  SPACE = phase', cx, cy + 78);
  }
}
