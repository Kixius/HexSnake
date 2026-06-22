import { CONFIG } from '../config';
import { type Hex, hexKey } from '../grid/hex';
import { type GameSnapshot, createSnapshot } from '../upgrades/snapshot';
import { UpgradeSystem } from '../upgrades/UpgradeSystem';
import { type MutationDef } from '../upgrades/registry';
import { FloorGenerator, type Floor } from '../floor/FloorGenerator';
import { stepObstacles } from '../floor/hazards';
import { SnakeController } from '../snake/SnakeController';
import { Renderer } from '../render/Renderer';
import { Hud, type HudData } from '../ui/Hud';
import { Overlays } from '../ui/Overlays';
import { Input } from '../input/Input';
import { type DeathReason, type Direction, type RunSummary, Occupant } from './types';
import { State } from './GameState';

/**
 * GameManager — owns the fixed-timestep loop, the FSM, run stats, and wires
 * every subsystem together. Pure simulation in update(); interpolation in render().
 */
export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer: Renderer;
  private hud = new Hud();
  private overlays: Overlays;
  private input = new Input();

  private dpr = 1;
  private w = 0;
  private h = 0;

  state: State = State.Menu;
  private depth = 1;
  private score = 0;
  private essenceCollected = 0;
  private portalActive = false;
  private paused = false;

  private floor: Floor | null = null;
  private snake: SnakeController | null = null;
  private snap: GameSnapshot = createSnapshot();
  private upgrades = new UpgradeSystem();

  private choices: MutationDef[] = [];
  private runSummary: RunSummary | null = null;

  private lastNow = 0;
  private accumulator = 0;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.renderer = new Renderer(ctx);
    this.overlays = new Overlays(ctx);
  }

  // ---- lifecycle ----

  start(): void {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.accumulator = 0;
    });
    this.input.attach();
    window.addEventListener('keydown', (e) => this.onMetaKey(e));
    this.canvas.addEventListener('click', (e) => this.onClick(e));
    requestAnimationFrame(this.loop);
  }

  private resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.renderer.resize(this.w, this.h);
    this.overlays.resize(this.w, this.h);
  }

  // ---- the loop ----

  private tickDt(): number {
    const rate = Math.min(
      CONFIG.maxTickRate,
      CONFIG.baseTickRate + CONFIG.tickRatePerDepth * (this.depth - 1),
    );
    return 1000 / rate;
  }

  private loop = (now: number): void => {
    if (this.lastNow === 0) this.lastNow = now;
    const frame = Math.min(now - this.lastNow, CONFIG.maxFrameMs);
    this.lastNow = now;

    if (document.hidden || this.paused || this.state !== State.Playing) {
      // Frozen states still render (overlays, death, upgrade cards); no interpolation.
      this.accumulator = 0;
      this.renderFrame(now, 1);
      requestAnimationFrame(this.loop);
      return;
    }

    this.accumulator += frame;
    const dt = this.tickDt();
    let guard = 0;
    while (this.accumulator >= dt && guard < 8) {
      this.update(now);
      this.accumulator -= dt;
      guard++;
      if (this.state !== State.Playing) break;
    }
    const alpha = dt > 0 ? this.accumulator / dt : 0;
    this.renderFrame(now, alpha);
    requestAnimationFrame(this.loop);
  };

  // ---- simulation ----

  private update(now: number): void {
    const snake = this.snake;
    const floor = this.floor;
    if (!snake || !floor) return;

    if (this.input.consumePhase()) snake.activatePhase(this.snap, now);

    if (!snake.started) {
      // Respect no-reverse even at launch (can't reverse into your own body).
      const d = this.input.consumeNext(snake.heading);
      if (d !== null) {
        snake.heading = d;
        snake.started = true;
      }
      return;
    }

    const candidate = this.input.consumeNext(snake.heading);
    const res = snake.step(floor.grid, floor.obstacles, this.snap, now, this.tickDt(), candidate);

    if (res.ateEssence) {
      this.essenceCollected++;
      this.score += Math.round(CONFIG.scorePerEssence * this.snap.scoreMult);
      if (!this.portalActive && this.essenceCollected >= floor.essenceNeeded) {
        FloorGenerator.spawnPortal(floor.grid, snake.head);
        this.portalActive = true;
      }
    }
    if (res.ateCore) {
      this.score += Math.round(CONFIG.scorePerCore * this.snap.scoreMult);
      this.openUpgradeSelect();
      return;
    }
    if (res.reachedPortal) {
      this.onFloorCleared();
      return;
    }
    if (res.died) {
      this.onDeath(res.died);
      return;
    }

    // Obstacles roam (they avoid the snake, so no post-move head kill).
    const snakeCells = new Set(snake.segments.map((s) => hexKey(s)));
    stepObstacles(floor.obstacles, floor.grid, snakeCells);
  }

  // ---- transitions ----

  private startRun(): void {
    this.depth = 1;
    this.score = 0;
    this.snap = createSnapshot();
    this.upgrades = new UpgradeSystem();
    this.runSummary = null;
    this.beginFloor();
    this.state = State.Playing;
  }

  private beginFloor(): void {
    this.floor = FloorGenerator.generate(this.depth);
    const floor = this.floor;
    const heading: Direction = 2; // SE
    if (this.snake) {
      this.snake.reposition(floor.spawn, heading);
    } else {
      this.snake = new SnakeController(floor.spawn, heading, this.snap);
    }
    this.clearBodyCells(floor.grid, this.snake.segments);
    this.essenceCollected = 0;
    this.portalActive = false;
    this.input.resetFloor();
  }

  private clearBodyCells(grid: import('../grid/GridManager').GridManager, segs: Hex[]): void {
    for (const s of segs) {
      // Only walls could block the spawn; non-wall occupants are intentionally
      // kept away from spawn by the generator, so this is purely defensive.
      if (grid.occupantOf(s) === Occupant.Wall) grid.clear(s);
    }
  }

  private onFloorCleared(): void {
    this.score += Math.round(CONFIG.scorePerDepthCleared * this.snap.scoreMult);
    this.depth++;
    this.beginFloor();
    this.openUpgradeSelect();
  }

  private openUpgradeSelect(): void {
    this.choices = this.upgrades.rollThree();
    this.state = State.UpgradeSelect;
  }

  private pickUpgrade(index: number): void {
    const def = this.choices[index];
    if (!def) return;
    this.upgrades.apply(def.id, this.snap);
    this.snake?.onUpgradesChanged(this.snap);
    this.choices = [];
    this.input.clearQueue(); // discard directions mashed during the card screen
    this.state = State.Playing;
  }

  private onDeath(reason: DeathReason): void {
    this.runSummary = {
      depth: this.depth,
      score: this.score,
      length: this.snake?.length ?? 0,
      mutations: this.upgrades.buildSummary(),
      reason,
    };
    this.state = State.Dead;
  }

  // ---- input ----

  private onMetaKey(e: KeyboardEvent): void {
    if (this.state === State.Menu && e.code === 'Enter') {
      this.startRun();
      e.preventDefault();
    } else if (this.state === State.Dead && e.code === 'Enter') {
      this.state = State.Menu;
      e.preventDefault();
    } else if (this.state === State.UpgradeSelect) {
      if (e.code === 'Digit1') this.pickUpgrade(0);
      else if (e.code === 'Digit2') this.pickUpgrade(1);
      else if (e.code === 'Digit3') this.pickUpgrade(2);
    } else if (this.state === State.Playing && e.code === 'KeyP') {
      this.paused = !this.paused;
      e.preventDefault();
    }
  }

  private onClick(e: MouseEvent): void {
    if (this.state !== State.UpgradeSelect) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const idx = this.overlays.hitTestCard(x, y);
    if (idx !== null) this.pickUpgrade(idx);
  }

  // ---- render ----

  private renderFrame(now: number, alpha: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    if (this.state === State.Menu) {
      this.overlays.drawMenu();
      return;
    }

    if (this.floor && this.snake) {
      this.renderer.render({
        grid: this.floor.grid,
        snake: this.snake,
        obstacles: this.floor.obstacles,
        snap: this.snap,
        now,
        alpha,
        portalActive: this.portalActive,
      });
      this.hud.draw(ctx, this.w, this.h, this.hudData(now));
    }

    if (this.state === State.UpgradeSelect) {
      this.overlays.drawUpgradeSelect(this.choices);
    } else if (this.state === State.Dead && this.runSummary) {
      this.overlays.drawDeath(this.runSummary);
    }

    if (this.paused && this.state === State.Playing) this.drawPaused();
  }

  private hudData(now: number): HudData {
    const snake = this.snake;
    const floor = this.floor;
    return {
      depth: this.depth,
      score: this.score,
      length: snake?.length ?? 0,
      essenceCollected: this.essenceCollected,
      essenceNeeded: floor?.essenceNeeded ?? 0,
      portalActive: this.portalActive,
      health: snake?.health ?? 1,
      maxHealth: this.snap.maxHealth,
      mutations: this.upgrades.active,
      phase: snake ? snake.phaseState(this.snap, now) : {
        enabled: false,
        active: false,
        activeFrac: 0,
        cooldownFrac: 0,
        ready: false,
      },
    };
  }

  private drawPaused(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(8,10,14,0.6)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#e6edf3';
    ctx.font = "bold 40px 'Consolas','Courier New',monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PAUSED', this.w / 2, this.h / 2);
    ctx.font = "16px 'Consolas','Courier New',monospace";
    ctx.fillStyle = '#8b97a7';
    ctx.fillText('press P to resume', this.w / 2, this.h / 2 + 36);
    ctx.textAlign = 'left';
  }
}
