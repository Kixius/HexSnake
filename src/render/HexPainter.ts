/**
 * Low-level flat-top hex drawing primitives. Pure Canvas2D helpers — no game state.
 *
 * Flat-top hex vertices sit at angles 0°, 60°, ..., 300° (i * 60°).
 * `size` = center-to-corner distance everywhere.
 */

export interface Point {
  x: number;
  y: number;
}

/** Trace a single hex path (no beginPath) so callers can batch many into one fill. */
export function traceHex(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Fill (and optionally stroke) a single hex. */
export function paintHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  fill: string,
  stroke?: string,
  lineWidth = 1,
): void {
  ctx.beginPath();
  traceHex(ctx, cx, cy, size);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

/** Fill a hex inset by `inset` (fraction of size) — used for tiles that shouldn't touch. */
export function paintHexInset(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  inset: number,
  fill: string,
  stroke?: string,
): void {
  paintHex(ctx, cx, cy, size * (1 - inset), fill, stroke);
}

/** A filled circle (used for essence pellets, obstacle markers). */
export function paintCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
