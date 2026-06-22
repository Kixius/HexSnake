import { PALETTE } from '../config';
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
  health: number;
  maxHealth: number;
  mutations: ActiveMutation[];
  phase: PhaseState;
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

    // Health pips.
    this.drawHealth(ctx, 20, 74, d.health, d.maxHealth);

    // Top-right: essence progress / portal status.
    this.drawProgress(ctx, w, d);

    // Bottom-left: active mutations.
    this.drawMutations(ctx, d.mutations);

    // Bottom-center: phase ability.
    if (d.phase.enabled) this.drawPhase(ctx, w, d.phase);

    ctx.restore();
  }

  private drawHealth(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    health: number,
    max: number,
  ): void {
    const r = 7;
    for (let i = 0; i < max; i++) {
      ctx.beginPath();
      ctx.arc(x + 8 + i * 22, y + 8, r, 0, Math.PI * 2);
      ctx.fillStyle = i < health ? PALETTE.danger : PALETTE.wallEdge;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = PALETTE.textDim;
      ctx.stroke();
    }
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
}
