import { PALETTE } from '../config';
import { FONT, dim, drawCard, type CardBox } from './paint';
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

  drawUpgradeSelect(
    choices: MutationDef[],
    opts: { hover?: number; pick?: { index: number; frac: number } | null } = {},
  ): void {
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

    const pick = opts.pick ?? null;
    // Hover is ignored once a pick is resolving (the chosen card owns the highlight).
    const hover = pick ? -1 : opts.hover ?? -1;

    this.cards = [];
    for (let i = 0; i < choices.length; i++) {
      const def = choices[i];
      if (!def) continue;
      const x = startX + i * (cardW + gap);
      const box: CardBox = { x, y, w: cardW, h: cardH };
      // Hit-test boxes stay unscaled so hover tracking can't flicker at the edges.
      this.cards.push({ x, y, w: cardW, h: cardH, def, index: i });

      const isPicked = pick !== null && i === pick.index;
      const isOther = pick !== null && i !== pick.index;
      const isHover = !pick && i === hover;

      ctx.save();
      // Scale around the card center: subtle on hover, growing through the pick anim.
      const scale = isPicked ? 1 + 0.07 * pick.frac : isHover ? 1.04 : 1;
      if (scale !== 1) {
        const cx = x + cardW / 2;
        const cy = y + cardH / 2;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
      }
      if (isOther) ctx.globalAlpha = 1 - 0.8 * pick.frac; // fade out the losers

      const glow = isPicked ? 16 + 26 * pick.frac : isHover ? 18 : 0;
      drawCard(ctx, box, def, i, { glow });
      ctx.restore();
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

  /** Death summary. `reveal` (0..1) drives a slow cinematic entrance: the backdrop
   *  dims in, then the title fades/slides/scales in, then reason → stats → build →
   *  the retry prompt, each staggered. Defaults to 1 (fully shown). */
  drawDeath(summary: RunSummary, reveal = 1): void {
    const ctx = this.ctx;
    // stage(a,b): smoothed 0→1 as `reveal` crosses [a, b].
    const stage = (a: number, b: number): number => {
      let t = (reveal - a) / (b - a);
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      return t * t * (3 - 2 * t); // smoothstep
    };

    // Backdrop dims in first so the slow zoom into the death point is visible briefly.
    dim(ctx, this.w, this.h, 0.85 * stage(0, 0.32));

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Title: fades in, slides down ~30px, eases scale 1.3 → 1.
    const tTitle = stage(0.18, 0.6);
    if (tTitle > 0) {
      const ty = this.h * 0.22 + (1 - tTitle) * -30;
      const s = 1 + (1 - tTitle) * 0.3;
      ctx.save();
      ctx.globalAlpha = tTitle;
      ctx.translate(this.w / 2, ty);
      ctx.scale(s, s);
      ctx.translate(-this.w / 2, -ty);
      ctx.font = `bold 64px ${FONT}`;
      ctx.fillStyle = PALETTE.danger;
      ctx.shadowColor = PALETTE.dangerGlow;
      ctx.shadowBlur = 20;
      ctx.fillText('YOU DIED', this.w / 2, ty);
      ctx.restore();
    }

    // Slain-by reason.
    const tReason = stage(0.42, 0.68);
    if (tReason > 0) {
      ctx.save();
      ctx.globalAlpha = tReason;
      ctx.font = `16px ${FONT}`;
      ctx.fillStyle = PALETTE.textDim;
      const reasonTxt = summary.reason ? `slain by: ${summary.reason.toUpperCase()}` : '';
      ctx.fillText(reasonTxt, this.w / 2, this.h * 0.22 + 48);
      ctx.restore();
    }

    // Stats lines (staggered).
    const lines: [string, string][] = [
      ['DEPTH REACHED', `${summary.depth}`],
      ['FINAL SCORE', `${summary.score}`],
      ['LENGTH', `${summary.length}`],
    ];
    let y = this.h * 0.38;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const [k, v] = line;
      const tLine = stage(0.55 + i * 0.05, 0.72 + i * 0.05);
      if (tLine > 0) {
        ctx.save();
        ctx.globalAlpha = tLine;
        ctx.font = `16px ${FONT}`;
        ctx.fillStyle = PALETTE.textDim;
        ctx.fillText(k, this.w / 2 - 60, y);
        ctx.fillStyle = PALETTE.teal;
        ctx.font = `bold 20px ${FONT}`;
        ctx.fillText(v, this.w / 2 + 80, y);
        ctx.restore();
      }
      y += 34;
    }

    // Build list.
    const tBuild = stage(0.74, 0.92);
    y += 14;
    if (tBuild > 0) {
      ctx.save();
      ctx.globalAlpha = tBuild;
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
      ctx.restore();
    }

    // Retry prompt — appears last, keeps its pulse.
    const tEnter = stage(0.9, 1.0);
    if (tEnter > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
      ctx.save();
      ctx.globalAlpha = tEnter * (0.5 + 0.5 * pulse);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillText('PRESS ENTER TO TRY AGAIN', this.w / 2, this.h - 50);
      ctx.restore();
    }

    ctx.textAlign = 'left';
  }
}
