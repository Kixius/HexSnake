import { CONFIG, PALETTE } from '../config';
import { type Hex, hexKey, hexesInRadius, hexToPixel } from '../grid/hex';
import { type GameSnapshot } from '../upgrades/snapshot';
import { Occupant, type MovingObstacle } from '../game/types';
import type { GridManager } from '../grid/GridManager';
import type { SnakeController } from '../snake/SnakeController';
import { paintCircle, paintHex, traceHex } from './HexPainter';

export interface RenderState {
  grid: GridManager;
  snake: SnakeController;
  obstacles: readonly MovingObstacle[];
  snap: GameSnapshot;
  now: number;
  /** Interpolation fraction toward the next tick (0..1). */
  alpha: number;
  portalActive: boolean;
}

/**
 * Draws the world: arena, grid, walls, slime, essence, core, portal, roaming
 * obstacles, acid trails, and the interpolated snake. Layout is recomputed on
 * resize; the hex size scales to fit the viewport.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  size = 20;
  private offsetX = 0;
  private offsetY = 0;
  private radius: number;

  constructor(ctx: CanvasRenderingContext2D, radius: number = CONFIG.radius) {
    this.ctx = ctx;
    this.radius = radius;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const cells = hexesInRadius(this.radius);
    let minCx = Infinity, maxCx = -Infinity, minCy = Infinity, maxCy = -Infinity;
    for (const c of cells) {
      const p = hexToPixel(c, 1);
      minCx = Math.min(minCx, p.x);
      maxCx = Math.max(maxCx, p.x);
      minCy = Math.min(minCy, p.y);
      maxCy = Math.max(maxCy, p.y);
    }
    const centerW = maxCx - minCx;
    const centerH = maxCy - minCy;
    const unitW = centerW + 2; // +2 size for flat-top half-widths both sides
    const unitH = centerH + Math.sqrt(3); // +sqrt(3) for vertical half-extents
    const availW = w - 2 * CONFIG.margin;
    const availH = h - 2 * CONFIG.margin;
    this.size = Math.max(6, Math.min(availW / unitW, availH / unitH));
    this.offsetX = (w - centerW * this.size) / 2 - minCx * this.size;
    this.offsetY = (h - centerH * this.size) / 2 - minCy * this.size;
  }

  toScreen(h: Hex): { x: number; y: number } {
    const p = hexToPixel(h, this.size);
    return { x: this.offsetX + p.x, y: this.offsetY + p.y };
  }

  render(rs: RenderState): void {
    const ctx = this.ctx;
    // (Transform/DPR is set by GameManager before calling render.)
    ctx.imageSmoothingEnabled = false;

    // Background.
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawGrid(rs);
    this.drawWallsAndSlime(rs);
    this.drawAcidicHexes(rs);
    this.drawEssence(rs);
    this.drawCore(rs);
    if (rs.portalActive) this.drawPortal(rs);
    this.drawObstacles(rs);
    this.drawSnake(rs);
  }

  // ---- arena grid ----

  private drawGrid(rs: RenderState): void {
    const ctx = this.ctx;
    const s = this.size;
    // Subtle tile fills + grid edges (one batched path).
    ctx.beginPath();
    for (const c of rs.grid.cells) {
      const p = this.toScreen(c);
      traceHex(ctx, p.x, p.y, s);
    }
    ctx.fillStyle = PALETTE.grid;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = PALETTE.gridEdge;
    ctx.stroke();

    // Arena border: bold teal edge on the outermost ring of cells.
    ctx.beginPath();
    for (const c of rs.grid.cells) {
      if (!this.isBorder(c)) continue;
      const p = this.toScreen(c);
      traceHex(ctx, p.x, p.y, s);
    }
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PALETTE.teal;
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private isBorder(c: Hex): boolean {
    return Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)) === this.radius;
  }

  // ---- walls + slime (batched) ----

  private drawWallsAndSlime(rs: RenderState): void {
    const ctx = this.ctx;
    const s = this.size;

    // Walls.
    ctx.beginPath();
    for (const c of rs.grid.cells) {
      if (rs.grid.occupantOf(c) !== Occupant.Wall) continue;
      const p = this.toScreen(c);
      traceHex(ctx, p.x, p.y, s * 0.96);
    }
    ctx.fillStyle = PALETTE.wall;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PALETTE.wallEdge;
    ctx.stroke();

    // Slime (pulsing).
    const pulse = 0.5 + 0.5 * Math.sin(rs.now / 360);
    for (const c of rs.grid.cells) {
      if (rs.grid.occupantOf(c) !== Occupant.Slime) continue;
      const p = this.toScreen(c);
      paintHex(ctx, p.x, p.y, s * 0.92, PALETTE.slime, PALETTE.slimeEdge, 1.5);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.35 * pulse;
      paintCircle(ctx, p.x, p.y, s * 0.34, PALETTE.slimeEdge);
      ctx.restore();
    }
  }

  // Acidic Trail: pulsing acid on the snake's trailing hexes (destroys hazards).
  private drawAcidicHexes(rs: RenderState): void {
    if (rs.snake.acidicHexes.size === 0) return;
    const ctx = this.ctx;
    const s = this.size;
    const pulse = 0.5 + 0.5 * Math.sin(rs.now / 200);
    for (const c of rs.grid.cells) {
      if (!rs.snake.acidicHexes.has(hexKey(c))) continue;
      const p = this.toScreen(c);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.3 * pulse;
      paintCircle(ctx, p.x, p.y, s * 0.44, PALETTE.acid);
      ctx.restore();
    }
  }

  // ---- essence ----

  private drawEssence(rs: RenderState): void {
    const ctx = this.ctx;
    const s = this.size;
    const pulse = 0.5 + 0.5 * Math.sin(rs.now / 300);
    ctx.save();
    ctx.shadowColor = PALETTE.essenceGlow;
    ctx.shadowBlur = 12 + 6 * pulse;
    for (const c of rs.grid.cells) {
      if (rs.grid.occupantOf(c) !== Occupant.Essence) continue;
      const p = this.toScreen(c);
      paintCircle(ctx, p.x, p.y, s * (0.3 + 0.05 * pulse), PALETTE.essence);
    }
    ctx.restore();
  }

  // ---- chamber core (Split Tongue reveals from afar) ----

  private drawCore(rs: RenderState): void {
    let core: Hex | null = null;
    for (const c of rs.grid.cells) {
      if (rs.grid.occupantOf(c) === Occupant.ChamberCore) {
        core = c;
        break;
      }
    }
    if (!core) return;
    const dist = hexDist(rs.snake.head, core);
    const reveal = Math.max(4, rs.snap.radarRadius);
    if (dist > reveal) return; // hidden until sensed (Split Tongue extends range)

    const ctx = this.ctx;
    const p = this.toScreen(core);
    const s = this.size;
    const spin = rs.now / 220;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.shadowColor = PALETTE.portalGlow;
    ctx.shadowBlur = 18;
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const ang = spin + (i * Math.PI) / 2;
      const r = s * 0.42;
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- portal ----

  private drawPortal(rs: RenderState): void {
    let portal: Hex | null = null;
    for (const c of rs.grid.cells) {
      if (rs.grid.occupantOf(c) === Occupant.Portal) {
        portal = c;
        break;
      }
    }
    if (!portal) return;
    const ctx = this.ctx;
    const p = this.toScreen(portal);
    const s = this.size;
    const t = rs.now / 500;
    ctx.save();
    ctx.shadowColor = PALETTE.portalGlow;
    ctx.shadowBlur = 22;
    for (let ring = 0; ring < 3; ring++) {
      const phase = (t + ring * 0.33) % 1;
      const radius = s * (0.25 + 0.55 * phase);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.lineWidth = 3 * (1 - phase) + 1;
      ctx.strokeStyle = ring === 1 ? PALETTE.portalBright : PALETTE.portal;
      ctx.globalAlpha = 1 - phase;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    paintCircle(ctx, p.x, p.y, s * 0.18, PALETTE.portalBright);
    ctx.restore();
  }

  // ---- obstacles (interpolated) ----

  private drawObstacles(rs: RenderState): void {
    const ctx = this.ctx;
    const s = this.size;
    // Obstacles advance one hex every `obstacleMoveEvery` ticks, so their glide
    // spans that many ticks — not the per-tick `alpha` the snake uses. Using
    // `alpha` alone made them visibly vibrate between hexes each tick (the
    // "glitch" from floor 3 on, when obstacles first appear). `moveCounter`
    // counts down from the period after each move, so this phase runs 0→1 across
    // exactly one hex-to-hex glide and hits 1 as the next move begins.
    const period = CONFIG.obstacleMoveEvery;
    for (const o of rs.obstacles) {
      const phase =
        period > 0 ? Math.min(1, (period - o.moveCounter + rs.alpha) / period) : rs.alpha;
      const a = this.toScreen(o.prevHex);
      const b = this.toScreen(o.hex);
      const x = a.x + (b.x - a.x) * phase;
      const y = a.y + (b.y - a.y) * phase;
      ctx.save();
      ctx.shadowColor = 'rgba(249,115,22,0.5)';
      ctx.shadowBlur = 12;
      paintHex(ctx, x, y, s * 0.9, PALETTE.obstacle, PALETTE.obstacleEdge, 2);
      ctx.restore();
      // warning marker (rotating square)
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rs.now / 400);
      ctx.fillStyle = PALETTE.portalBright;
      ctx.fillRect(-s * 0.16, -s * 0.16, s * 0.32, s * 0.32);
      ctx.restore();
    }
  }

  // ---- snake (interpolated) ----

  private drawSnake(rs: RenderState): void {
    const ctx = this.ctx;
    const s = this.size;
    const segs = rs.snake.segments;
    const prev = rs.snake.prevSegments;
    const len = segs.length;
    const phasing = rs.snake.isPhasing(rs.now);

    ctx.save();
    if (phasing) ctx.globalAlpha = 0.5;

    // Body (tail to neck) so head draws on top.
    for (let i = len - 1; i >= 1; i--) {
      const cur = segs[i];
      if (!cur) continue;
      const pv = prev[i] ?? cur;
      const a = this.toScreen(pv);
      const b = this.toScreen(cur);
      const x = a.x + (b.x - a.x) * rs.alpha;
      const y = a.y + (b.y - a.y) * rs.alpha;
      const t = i / Math.max(1, len - 1);
      const fill = lerpColor(PALETTE.snakeBodyBright, PALETTE.snakeBody, t);
      paintHex(ctx, x, y, s * 0.84, fill, PALETTE.snakeOutline, 1.5);
    }

    // Head.
    const head = segs[0];
    if (head) {
      const pv = prev[0] ?? head;
      const a = this.toScreen(pv);
      const b = this.toScreen(head);
      const x = a.x + (b.x - a.x) * rs.alpha;
      const y = a.y + (b.y - a.y) * rs.alpha;
      ctx.shadowColor = 'rgba(94,234,212,0.55)';
      ctx.shadowBlur = phasing ? 22 : 12;
      paintHex(ctx, x, y, s * 0.92, PALETTE.snakeHead, PALETTE.snakeOutline, 2);
      ctx.shadowBlur = 0;
      this.drawEyes(x, y, rs.snake.heading, s);
    }
    ctx.restore();
  }

  private drawEyes(x: number, y: number, heading: number, s: number): void {
    const ctx = this.ctx;
    // eyes offset perpendicular to heading direction (flat-top angles)
    const ang = (Math.PI / 3) * heading;
    const fx = Math.cos(ang);
    const fy = Math.sin(ang);
    const px = -fy; // perpendicular
    const py = fx;
    const fwd = s * 0.28;
    const side = s * 0.26;
    for (const sign of [-1, 1]) {
      const ex = x + fx * fwd + px * side * sign;
      const ey = y + fy * fwd + py * side * sign;
      paintCircle(ctx, ex, ey, s * 0.12, '#0e1116');
      paintCircle(ctx, ex + fx * s * 0.04, ey + fy * s * 0.04, s * 0.05, PALETTE.text);
    }
  }
}

// ---- small color/math helpers ----

function hexDist(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

function lerpColor(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r},${g},${bl})`;
}

function parseHex(h: string): { r: number; g: number; b: number } {
  const m = h.replace('#', '');
  const v = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
