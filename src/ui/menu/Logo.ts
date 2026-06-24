/**
 * Loads the title logo from `public/` (tries PNG then SVG; with Vite `base:'./'`
 * the runtime URL is `./logo.png` / `./logo.svg`). The main menu draws the image
 * when `ready`, and falls back to the text title otherwise. Load is async and
 * silent on failure (no 404 console noise) so the menu never blocks on it.
 */
class Logo {
  private img: HTMLImageElement | null = null;

  constructor() {
    this.tryLoad('./logo.png', () => this.tryLoad('./logo.svg', () => {}));
  }

  private tryLoad(src: string, onErr: () => void): void {
    const im = new Image();
    im.onload = () => {
      this.img = im;
    };
    im.onerror = onErr;
    im.src = src;
  }

  get ready(): boolean {
    return this.img !== null;
  }

  get width(): number {
    return this.img?.width ?? 0;
  }

  get height(): number {
    return this.img?.height ?? 0;
  }

  /** Draw letterboxed (aspect-preserving) inside the given box. No-op if not ready. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, maxW: number, maxH: number): void {
    const im = this.img;
    if (!im) return;
    const scale = Math.min(maxW / im.width, maxH / im.height);
    const dw = im.width * scale;
    const dh = im.height * scale;
    ctx.drawImage(im, x + (maxW - dw) / 2, y + (maxH - dh) / 2, dw, dh);
  }
}

export const logo = new Logo();
