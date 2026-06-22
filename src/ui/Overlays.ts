import { PALETTE } from '../config';
import { DIR_NAMES } from '../grid/hex';
import type { MutationDef } from '../upgrades/registry';
import { rarityColor } from '../upgrades/registry';
import type { RunSummary } from '../game/types';

const FONT = "'Consolas', 'Courier New', monospace";

interface CardRect {
  x: number;
  y: number;
  w: number;
  h: number;
  def: MutationDef;
  index: number;
}

/** Full-screen overlays: title menu, the 3-card upgrade pick, and the death summary. */
export class Overlays {
  private cards: CardRect[] = [];
  private w = 0;
  private h = 0;

  constructor(private ctx: CanvasRenderingContext2D) {}

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  // ---- Menu ----

  drawMenu(): void {
    const ctx = this.ctx;
    this.dim(ctx, 0.75);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `bold 72px ${FONT}`;
    ctx.fillStyle = PALETTE.teal;
    ctx.shadowColor = 'rgba(45,212,191,0.5)';
    ctx.shadowBlur = 24;
    ctx.fillText('HEX' + 'SNAKE', this.w / 2, this.h * 0.28);
    ctx.shadowBlur = 0;

    ctx.font = `18px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('snake on a hex grid · roguelike depths', this.w / 2, this.h * 0.28 + 56);

    this.drawControls(ctx, this.w / 2, this.h * 0.5);

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText('PRESS ENTER TO DESCEND', this.w / 2, this.h * 0.82);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  private drawControls(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    const layout: { key: string; dir: string }[][] = [
      [{ key: 'Q', dir: DIR_NAMES[5] }, { key: 'W', dir: DIR_NAMES[0] }, { key: 'E', dir: DIR_NAMES[1] }],
      [{ key: 'A', dir: DIR_NAMES[4] }, { key: 'S', dir: DIR_NAMES[3] }, { key: 'D', dir: DIR_NAMES[2] }],
    ];
    const ks = 38;
    const gap = 8;
    const rowW = 3 * ks + 2 * gap;
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
        ctx.fillText(cell.key, x + ks / 2, y + ks / 2);
        ctx.font = `10px ${FONT}`;
        ctx.fillStyle = PALETTE.textDim;
        ctx.fillText(cell.dir, x + ks / 2, y + ks + 8);
        ctx.font = `bold 18px ${FONT}`;
      }
    }
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('numpad 7/8/9 · 1/2/3 also work  ·  SPACE = phase', cx, cy + 78);
  }

  // ---- Upgrade select ----

  drawUpgradeSelect(choices: MutationDef[]): void {
    const ctx = this.ctx;
    this.dim(ctx, 0.82);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `bold 34px ${FONT}`;
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText('MUTATION', this.w / 2, this.h * 0.16);
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('choose one — click or press 1 / 2 / 3', this.w / 2, this.h * 0.16 + 36);

    const cardW = Math.min(260, this.w * 0.26);
    const cardH = Math.min(320, this.h * 0.46);
    const gap = 24;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = (this.w - totalW) / 2;
    const y = (this.h - cardH) / 2 + 10;

    this.cards = [];
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let i = 0; i < choices.length; i++) {
      const def = choices[i];
      if (!def) continue;
      const x = startX + i * (cardW + gap);
      this.cards.push({ x, y, w: cardW, h: cardH, def, index: i });
      this.drawCard(ctx, { x, y, w: cardW, h: cardH, def, index: i });
    }
    ctx.textAlign = 'left';
  }

  private drawCard(ctx: CanvasRenderingContext2D, c: CardRect): void {
    const color = rarityColor(c.def.rarity);
    ctx.fillStyle = '#12182250';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    // rarity top band
    ctx.fillStyle = color;
    ctx.fillRect(c.x, c.y, c.w, 6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.strokeRect(c.x, c.y, c.w, c.h);

    const pad = 18;
    ctx.fillStyle = color;
    ctx.font = `12px ${FONT}`;
    ctx.fillText(c.def.rarity.toUpperCase(), c.x + pad, c.y + 22);

    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 22px ${FONT}`;
    this.wrapText(ctx, c.def.name, c.x + pad, c.y + 52, c.w - pad * 2, 26);

    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `15px ${FONT}`;
    this.wrapText(ctx, c.def.description, c.x + pad, c.y + 130, c.w - pad * 2, 22);

    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText(`[ ${c.index + 1} ]`, c.x + pad, c.y + c.h - 34);
  }

  /** Returns the chosen card index for a click, or null. */
  hitTestCard(px: number, py: number): number | null {
    for (const c of this.cards) {
      if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return c.index;
    }
    return null;
  }

  // ---- Death ----

  drawDeath(summary: RunSummary): void {
    const ctx = this.ctx;
    this.dim(ctx, 0.85);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `bold 64px ${FONT}`;
    ctx.fillStyle = PALETTE.danger;
    ctx.shadowColor = 'rgba(239,68,68,0.5)';
    ctx.shadowBlur = 20;
    ctx.fillText('YOU DIED', this.w / 2, this.h * 0.22);
    ctx.shadowBlur = 0;

    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    const reasonTxt = summary.reason ? `slain by: ${summary.reason.toUpperCase()}` : '';
    ctx.fillText(reasonTxt, this.w / 2, this.h * 0.22 + 48);

    const lines: [string, string][] = [
      ['DEPTH REACHED', `${summary.depth}`],
      ['FINAL SCORE', `${summary.score}`],
      ['LENGTH', `${summary.length}`],
    ];
    let y = this.h * 0.38;
    ctx.font = `16px ${FONT}`;
    for (const [k, v] of lines) {
      ctx.fillStyle = PALETTE.textDim;
      ctx.fillText(k, this.w / 2 - 60, y);
      ctx.fillStyle = PALETTE.teal;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText(v, this.w / 2 + 80, y);
      ctx.font = `16px ${FONT}`;
      y += 34;
    }

    // Build list.
    y += 14;
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText('BUILD', this.w / 2, y);
    y += 28;
    ctx.font = `14px ${FONT}`;
    if (summary.mutations.length === 0) {
      ctx.fillStyle = PALETTE.textDim;
      ctx.fillText('(no mutations)', this.w / 2, y);
    } else {
      for (const m of summary.mutations) {
        ctx.fillStyle = PALETTE.text;
        ctx.fillText(m.stacks > 1 ? `${m.name} x${m.stacks}` : m.name, this.w / 2, y);
        y += 22;
      }
    }

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText('PRESS ENTER TO TRY AGAIN', this.w / 2, this.h - 50);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // ---- helpers ----

  private dim(ctx: CanvasRenderingContext2D, alpha: number): void {
    ctx.fillStyle = `rgba(8,10,14,${alpha})`;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxW: number,
    lineH: number,
  ): void {
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
  }
}
