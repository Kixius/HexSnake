import { PALETTE } from '../config';
import { FONT, dim, drawCard } from './paint';
import type { MutationDef } from '../upgrades/registry';
import type { RunSummary } from '../game/types';

interface CardRect {
  x: number;
  y: number;
  w: number;
  h: number;
  def: MutationDef;
  index: number;
}

/** In-game overlays that are NOT part of the menu system: the 3-card upgrade
 *  pick and the death summary. (The title screen is owned by MenuController.)
 *  Shared drawing helpers live in ./paint so both can use them. */
export class Overlays {
  private cards: CardRect[] = [];
  private w = 0;
  private h = 0;

  constructor(private ctx: CanvasRenderingContext2D) {}

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  // ---- Upgrade select ----

  drawUpgradeSelect(choices: MutationDef[]): void {
    const ctx = this.ctx;
    dim(ctx, this.w, this.h, 0.82);
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
    for (let i = 0; i < choices.length; i++) {
      const def = choices[i];
      if (!def) continue;
      const x = startX + i * (cardW + gap);
      this.cards.push({ x, y, w: cardW, h: cardH, def, index: i });
      drawCard(ctx, { x, y, w: cardW, h: cardH }, def, i);
    }
    ctx.textAlign = 'left';
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
    dim(ctx, this.w, this.h, 0.85);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `bold 64px ${FONT}`;
    ctx.fillStyle = PALETTE.danger;
    ctx.shadowColor = PALETTE.dangerGlow;
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
      ctx.font = `16px ${FONT}`;
      ctx.fillText(k, this.w / 2 - 60, y);
      ctx.fillStyle = PALETTE.teal;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText(v, this.w / 2 + 80, y);
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
}
