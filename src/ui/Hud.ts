import { CONFIG, PALETTE } from '../config';
import type { ActiveMutation } from '../upgrades/UpgradeSystem';
import { rarityColor } from '../upgrades/registry';
import type { PhaseState } from '../snake/SnakeController';

export interface HudData {
  depth: number;
  score: number;
  length: number;
  essenceCollected: number;
  essenceNeeded: number;
  portalActive: boolean;
  /** Spare lives — each revives you on the current floor when you die. */
  lives: number;
  /** Spore pellets collected this run — each grants a permanent 5% slow (a *buff*:
   *  the snake speeds up every floor, so slowing gives more reaction time). */
  sporeStacks: number;
  /** Chitinous Shell armor charges left this floor (0 if no armor card). */
  armor: number;
  /** Per-floor armor refill amount (snap.wallCharges); 0 hides the counter. */
  maxArmor: number;
  mutations: ActiveMutation[];
  phase: PhaseState;
  slip: PhaseState;
}

const FONT = "'Consolas', 'Courier New', monospace";

/** In-game heads-up display: floor, length, score, essence progress, build, phase. */
export class Hud {
  private h = 0;

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, d: HudData): void {
    this.h = h;
    ctx.save();
    ctx.textBaseline = 'top';

    // Top-left: floor + length + score.
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillStyle = PALETTE.teal;
    ctx.fillText(`FLOOR ${d.depth}`, 20, 16);

    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(`LEN ${d.length}`, 20, 50);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(`SCORE ${d.score}`, 110, 50);

    // Lives pips — the red-dot counter. Filled = spare lives, empty = lives lost.
    this.drawLives(ctx, 20, 74, d.lives);
    // Armor charges (Chitinous Shell) — only when the player actually has armor.
    if (d.maxArmor > 0) this.drawArmor(ctx, 20, 98, d.armor, d.maxArmor);

    // Top-right: essence progress / portal status.
    this.drawProgress(ctx, w, d);
    // Spore slow buff collected this run (right side, under the bar).
    if (d.sporeStacks > 0) this.drawSpore(ctx, w, d.sporeStacks);

    // Bottom-left: active mutations.
    this.drawMutations(ctx, d.mutations);

    // Bottom-center: active abilities.
    if (d.slip.enabled) this.drawSlip(ctx, w, d.slip);
    if (d.phase.enabled) this.drawPhase(ctx, w, d.phase);

    ctx.restore();
  }

  /** Lives counter: filled red dots = lives remaining (counting the life you're
   *  on), hollow dots = lives lost (up to the starting 3, growing if life cards
   *  push past it). At 1 life you're on your final life — the next death ends the
   *  run — so a pulsing "FINAL LIFE" warning is shown. */
  private drawLives(ctx: CanvasRenderingContext2D, x: number, y: number, lives: number): void {
    const r = 7;
    const slots = Math.max(CONFIG.startLives, lives);
    for (let i = 0; i < slots; i++) {
      ctx.beginPath();
      ctx.arc(x + 8 + i * 22, y + 8, r, 0, Math.PI * 2);
      ctx.fillStyle = i < lives ? PALETTE.danger : PALETTE.wallEdge;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = PALETTE.textDim;
      ctx.stroke();
    }
    if (lives <= 1) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * pulse;
      ctx.fillStyle = PALETTE.danger;
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('FINAL LIFE', x + 8 + slots * 22 + 10, y + 8);
      ctx.restore();
    }
  }

  /** Chitinous Shell armor: a shield glyph + "ARMOR current/max". */
  private drawArmor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    armor: number,
    max: number,
  ): void {
    const cy = y + 9;
    ctx.save();
    this.drawShield(ctx, x + 9, cy, 8, armor > 0);
    ctx.font = `15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = armor > 0 ? PALETTE.text : PALETTE.textDim;
    ctx.fillText(`ARMOR ${armor}/${max}`, x + 24, cy);
    ctx.restore();
  }

  private drawShield(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    filled: boolean,
  ): void {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy - r * 0.35);
    ctx.lineTo(cx + r * 0.78, cy + r * 0.7);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.78, cy + r * 0.7);
    ctx.lineTo(cx - r, cy - r * 0.35);
    ctx.closePath();
    ctx.fillStyle = filled ? PALETTE.teal : PALETTE.wallEdge;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PALETTE.textDim;
    ctx.stroke();
  }

  private drawProgress(ctx: CanvasRenderingContext2D, w: number, d: HudData): void {
    const barW = 240;
    const x = w - barW - 20;
    const y = 22;
    ctx.font = `14px ${FONT}`;
    ctx.textAlign = 'right';
    if (d.portalActive) {
      ctx.fillStyle = PALETTE.portal;
      ctx.fillText('PORTAL OPEN — DESCEND', w - 20, y);
    } else {
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(`ESSENCE ${d.essenceCollected} / ${d.essenceNeeded}`, w - 20, y);
    }
    ctx.textAlign = 'left';

    // Bar.
    const by = y + 24;
    ctx.fillStyle = PALETTE.grid;
    ctx.fillRect(x, by, barW, 12);
    const frac = d.essenceNeeded > 0 ? Math.min(1, d.essenceCollected / d.essenceNeeded) : 0;
    ctx.fillStyle = d.portalActive ? PALETTE.portal : PALETTE.essence;
    ctx.fillRect(x, by, barW * frac, 12);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PALETTE.gridEdge;
    ctx.strokeRect(x, by, barW, 12);
  }

  /** Spore slow buff: a green "slow" triangle + "SLOW ×N", under the bar. A gentle
   *  pulse marks it as an active, beneficial effect the player has collected. */
  private drawSpore(ctx: CanvasRenderingContext2D, w: number, stacks: number): void {
    const x = w - 20;
    const y = 74;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    ctx.save();
    ctx.globalAlpha = 0.8 + 0.2 * pulse;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `14px ${FONT}`;
    const label = `SLOW ×${stacks}`;
    ctx.fillStyle = PALETTE.spore;
    ctx.fillText(label, x, y);
    // Downward "slow" triangle icon just left of the label, matching the world pellets.
    const tw = ctx.measureText(label).width;
    const ix = x - tw - 13;
    const r = 5;
    ctx.beginPath();
    ctx.moveTo(ix, y + r);
    ctx.lineTo(ix - r * 0.92, y - r * 0.66);
    ctx.lineTo(ix + r * 0.92, y - r * 0.66);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawMutations(ctx: CanvasRenderingContext2D, muts: ActiveMutation[]): void {
    const x = 20;
    let y = this.h - 24 - muts.length * 24;
    if (y < 120) y = 120;
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('MUTATIONS', x, y);
    y += 20;
    for (const m of muts) {
      ctx.fillStyle = rarityColor(m.def.rarity);
      const label = m.stacks > 1 ? `${m.def.name} x${m.stacks}` : m.def.name;
      ctx.fillText(label, x, y);
      y += 22;
    }
  }

  private drawPhase(ctx: CanvasRenderingContext2D, w: number, p: PhaseState): void {
    const label = p.active ? 'PHASING' : p.ready ? '[SPACE] PHASE READY' : 'PHASE …';
    ctx.font = `14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = p.active ? PALETTE.teal : p.ready ? PALETTE.gold : PALETTE.textDim;
    const cx = w / 2;
    const y = this.h - 30;
    ctx.fillText(label, cx, y);
    // cooldown/active bar
    const frac = p.active ? p.activeFrac : 1 - p.cooldownFrac;
    const bw = 180;
    ctx.fillStyle = PALETTE.grid;
    ctx.fillRect(cx - bw / 2, y + 20, bw, 6);
    ctx.fillStyle = p.active ? PALETTE.teal : PALETTE.gold;
    ctx.fillRect(cx - bw / 2, y + 20, bw * frac, 6);
    ctx.textAlign = 'left';
  }

  private drawSlip(ctx: CanvasRenderingContext2D, w: number, p: PhaseState): void {
    const label = p.active ? 'SLIPPING' : p.ready ? '[SHIFT] SLIP READY' : 'SLIP …';
    ctx.font = `14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = p.active ? PALETTE.orange : p.ready ? PALETTE.gold : PALETTE.textDim;
    const cx = w / 2;
    const y = this.h - 64;
    ctx.fillText(label, cx, y);
    const frac = p.active ? p.activeFrac : 1 - p.cooldownFrac;
    const bw = 180;
    ctx.fillStyle = PALETTE.grid;
    ctx.fillRect(cx - bw / 2, y + 20, bw, 6);
    ctx.fillStyle = p.active ? PALETTE.orange : PALETTE.gold;
    ctx.fillRect(cx - bw / 2, y + 20, bw * frac, 6);
    ctx.textAlign = 'left';
  }
}
