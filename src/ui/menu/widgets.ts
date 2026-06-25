import { PALETTE } from '../../config';
import { FONT } from '../paint';
import type { UiContext } from './UiContext';

/**
 * Immediate-mode menu widgets. Each is `(ctx, ui, opts) => result`: it draws,
 * registers its rect, and reports interaction via `ui.interact`/`ui.drag`.
 * Styles read `PALETTE` so themes apply automatically. All set their own
 * text alignment/baseline so they compose without state leaking between them.
 */

export interface ButtonOpts {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

/** A rectangular button. Returns true on activation (click or focused Enter). */
export function button(ctx: CanvasRenderingContext2D, ui: UiContext, o: ButtonOpts): boolean {
  const { hover, focused, activated } = ui.interact(o.id, { x: o.x, y: o.y, w: o.w, h: o.h });
  const accent = hover || focused ? PALETTE.gold : PALETTE.teal;
  ctx.fillStyle = PALETTE.grid;
  ctx.fillRect(o.x, o.y, o.w, o.h);
  if (hover || focused) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = accent;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.restore();
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = accent;
  ctx.strokeRect(o.x, o.y, o.w, o.h);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 18px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(o.label, o.x + o.w / 2, o.y + o.h / 2);
  return activated;
}

export interface SliderOpts {
  id: string;
  x: number;
  y: number;
  w: number;
  value: number;
  min: number;
  max: number;
}

/** Horizontal slider adjusted by mouse (drag or click-to-position). Returns the
 *  (possibly changed) value, clamped to [min,max]. */
export function slider(ctx: CanvasRenderingContext2D, ui: UiContext, o: SliderOpts): number {
  const hitH = 36;
  const r = { x: o.x, y: o.y - hitH / 2, w: o.w, h: hitH };
  let v = o.value;
  // Resolve the drag BEFORE interact(): interact() claims a hovered press as a
  // click (sets clickConsumed), which would prevent drag() from ever starting —
  // leaving the slider stuck. Letting drag() go first lets the slider own the
  // press as a drag; interact() then only registers the rect + reports hover.
  const dragging = ui.drag(o.id, r);
  const { hover, focused } = ui.interact(o.id, r);
  if (dragging) {
    const t = clamp((ui.mouseX - o.x) / o.w, 0, 1);
    v = o.min + t * (o.max - o.min);
  }
  v = clamp(v, o.min, o.max);

  const trackH = 8;
  const trackY = o.y - trackH / 2;
  const frac = (v - o.min) / (o.max - o.min);
  const accent = hover || focused || dragging ? PALETTE.gold : PALETTE.teal;
  ctx.fillStyle = PALETTE.gridEdge;
  ctx.fillRect(o.x, trackY, o.w, trackH);
  ctx.fillStyle = accent;
  ctx.fillRect(o.x, trackY, o.w * frac, trackH);
  // handle
  ctx.fillStyle = PALETTE.text;
  ctx.beginPath();
  ctx.arc(o.x + o.w * frac, o.y, 8, 0, Math.PI * 2);
  ctx.fill();
  return v;
}

export interface ToggleOpts {
  id: string;
  x: number;
  y: number;
  w: number;
  label: string;
  value: boolean;
}

/** A labeled ON/OFF switch. Returns the resulting value (flipped on activation). */
export function toggle(ctx: CanvasRenderingContext2D, ui: UiContext, o: ToggleOpts): boolean {
  const h = 40;
  const { hover, focused, activated } = ui.interact(o.id, { x: o.x, y: o.y, w: o.w, h });
  const accent = hover || focused ? PALETTE.gold : PALETTE.teal;
  ctx.fillStyle = PALETTE.text;
  ctx.font = `16px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(o.label, o.x, o.y + h / 2);

  // switch on the right
  const sw = 54;
  const sh = 24;
  const sx = o.x + o.w - sw;
  const sy = o.y + (h - sh) / 2;
  ctx.fillStyle = o.value ? accent : PALETTE.gridEdge;
  ctx.fillRect(sx, sy, sw, sh);
  ctx.fillStyle = PALETTE.text;
  const knobX = o.value ? sx + sw - sh / 2 : sx + sh / 2;
  ctx.beginPath();
  ctx.arc(knobX, sy + sh / 2, sh / 2 - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = o.value ? PALETTE.bg : PALETTE.textDim;
  ctx.textAlign = 'center';
  ctx.fillText(o.value ? 'ON' : 'OFF', sx + sw / 2, sy + sh / 2);
  return activated ? !o.value : o.value;
}

export interface ListRowOpts {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  value?: string;
  selected?: boolean;
}

/** A selectable row (theme list, settings entries). Returns true on activation. */
export function listRow(
  ctx: CanvasRenderingContext2D,
  ui: UiContext,
  o: ListRowOpts,
): boolean {
  const { hover, focused, activated } = ui.interact(o.id, { x: o.x, y: o.y, w: o.w, h: o.h });
  const hi = hover || focused || o.selected;
  const accent = o.selected ? PALETTE.gold : hover || focused ? PALETTE.teal : PALETTE.gridEdge;
  ctx.fillStyle = hi ? accent : 'transparent';
  if (hi) {
    ctx.save();
    ctx.globalAlpha = o.selected ? 0.16 : 0.12;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.restore();
  }
  ctx.lineWidth = o.selected ? 2 : 1;
  ctx.strokeStyle = accent;
  ctx.strokeRect(o.x, o.y, o.w, o.h);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 18px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(o.label, o.x + 18, o.y + o.h / 2);
  if (o.value !== undefined) {
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `15px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(o.value, o.x + o.w - 18, o.y + o.h / 2);
  }
  return activated;
}

export interface PaginatorOpts {
  id: string;
  x: number;
  y: number;
  w: number;
  page: number;
  pageCount: number;
}

/** Prev / page-count / Next controls. Returns the (possibly changed) page index. */
export function paginator(
  ctx: CanvasRenderingContext2D,
  ui: UiContext,
  o: PaginatorOpts,
): number {
  const bw = 90;
  const bh = 38;
  const prev = button(ctx, ui, { id: `${o.id}.prev`, x: o.x, y: o.y, w: bw, h: bh, label: '< Prev' });
  const next = button(ctx, ui, {
    id: `${o.id}.next`,
    x: o.x + o.w - bw,
    y: o.y,
    w: bw,
    h: bh,
    label: 'Next >',
  });
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = `15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Page ${o.page + 1} / ${o.pageCount}`, o.x + o.w / 2, o.y + bh / 2);
  let p = o.page;
  if (prev && o.page > 0) p = o.page - 1;
  if (next && o.page < o.pageCount - 1) p = o.page + 1;
  return p;
}

/** Plain label at (x,y). */
export function label(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  opts?: { color?: string; font?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline },
): void {
  ctx.fillStyle = opts?.color ?? PALETTE.text;
  ctx.font = opts?.font ?? `16px ${FONT}`;
  ctx.textAlign = opts?.align ?? 'left';
  ctx.textBaseline = opts?.baseline ?? 'top';
  ctx.fillText(text, x, y);
}

/** Decorative container panel. Not focusable. */
export function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = '#12182280';
  ctx.fillRect(x, y, w, h);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = PALETTE.gridEdge;
  ctx.strokeRect(x, y, w, h);
}

/** Standard centered screen title + optional subtitle. */
export function screenTitle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
  subtitle?: string,
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(title, w / 2, h * 0.12);
  if (subtitle) {
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(subtitle, w / 2, h * 0.12 + 32);
  }
}

/** Standard centered BACK button. Returns true on activation. */
export function backButton(
  ctx: CanvasRenderingContext2D,
  ui: UiContext,
  w: number,
  h: number,
): boolean {
  return button(ctx, ui, { id: 'screen.back', x: w / 2 - 90, y: h * 0.9, w: 180, h: 44, label: 'BACK' });
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
