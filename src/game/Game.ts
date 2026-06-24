import { CONFIG } from '../config';
import { type Hex, equals, hexKey } from '../grid/hex';
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
import { exitApp } from '../platform/tauri';
import { audioManager } from '../audio/AudioManager';
import { MenuController } from '../ui/menu/MenuController';
import { applyTheme } from '../theme';
import { settingsStore } from '../settings/SettingsStore';
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
  private menu: MenuController;

  private dpr = 1;
  private w = 0;
  private h = 0;

  state: State = State.Menu;
  private depth = 1;
  private score = 0;
  private essenceCollected = 0;
  private portalActive = false;
  private paused = false;
  /** Floor-clear pick is pending: generate the next floor AFTER the upgrade is
   *  applied, so FloorGenerator.generate() sees the updated snapshot (e.g.
   *  Nutrient Storage's essenceReduction). */
  private floorAdvancePending = false;

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
    this.menu = new MenuController({
      startRun: () => this.startRun(),
      exit: () => {
        void exitApp();
      },
    });
  }

  // ---- lifecycle ----

  start(): void {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.accumulator = 0;
    });
    // Apply saved settings before the first frame: theme colors + key bindings + audio.
    const settings = settingsStore.load();
    applyTheme(settings.theme);
    this.input.applyKeybinds(settings.keybinds);
    audioManager.apply(settings.audio);
    // Re-bind keys + re-apply theme/audio live whenever settings change.
    settingsStore.onChange((s) => {
      this.input.applyKeybinds(s.keybinds);
      applyTheme(s.theme);
      audioManager.apply(s.audio);
    });
    this.input.attach();
    window.addEventListener('keydown', (e) => this.onMetaKey(e));
    this.canvas.addEventListener('click', (e) => this.onClick(e));
    // Resume the AudioContext on the first user gesture (browser autoplay policy).
    const resumeOnce = () => {
      audioManager.resume();
      window.removeEventListener('pointerdown', resumeOnce);
      window.removeEventListener('keydown', resumeOnce);
    };
    window.addEventListener('pointerdown', resumeOnce);
    window.addEventListener('keydown', resumeOnce);
    // Menu pointer interaction (hover / drag / click for widgets).
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.state !== State.Menu) return;
      const p = this.canvasPos(e);
      this.menu.onPointerDown(p.x, p.y);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.state !== State.Menu) return;
      const rect = this.canvas.getBoundingClientRect();
      this.menu.onPointerMove(e.clientX - rect.left, e.clientY - rect.top, true);
    });
    this.canvas.addEventListener('pointerup', () => {
      if (this.state !== State.Menu) return;
      this.menu.onPointerUp();
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (this.state !== State.Menu) return;
      this.menu.onPointerMove(0, 0, false);
    });
    requestAnimationFrame(this.loop);
  }

  private canvasPos(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.renderer.resize(this.w, this.h);
    this.overlays.resize(this.w, this.h);
    this.menu.resize(this.w, this.h);
  }

  // ---- the loop ----

  private tickDt(): number {
    const rate = Math.min(
      CONFIG.maxTickRate,
      (CONFIG.baseTickRate + CONFIG.tickRatePerDepth * (this.depth - 1)) * this.snap.speedMult,
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
    if (this.input.consumeSlip()) snake.activateSlip(this.snap, now);

    // Pull exactly one queued direction, no-reverse-validated against the current
    // heading. At floor launch we step with it on this same tick so the body
    // realigns to the heading right away — otherwise a follow-up turn queued
    // before the first step (e.g. A then Q) would be validated against the
    // post-turn heading while the body is still in its launch orientation,
    // driving the head straight into the neck. (Same fix covers a Chamber Core
    // halt: the body must realign on the first post-halt step.)
    const candidate = this.input.consumeNext(snake.heading);

    if (!snake.started) {
      if (candidate === null) return; // wait for the first steer
      snake.heading = candidate;
      snake.started = true;
    }

    const res = snake.step(floor.grid, floor.obstacles, this.snap, now, this.tickDt(), candidate);

    if (res.ateEssence) {
      this.essenceCollected++;
      this.score += Math.round(CONFIG.scorePerEssence * this.snap.scoreMult);
      // Tri-Directional Fork: eating one cluster member dissolves the other two.
      const sibs = floor.clusters.get(hexKey(snake.head));
      if (sibs) {
        for (const s of sibs) {
          if (!equals(s, snake.head) && floor.grid.occupantOf(s) === Occupant.Essence) {
            floor.grid.clear(s);
          }
        }
      }
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

    // Ouroboros Loop: score the vaporized hazards and drop the enclosed obstacles.
    if (res.loopedHazards > 0) {
      this.score += Math.round(res.loopedHazards * CONFIG.scorePerLooped * this.snap.scoreMult);
      const kill = new Set(res.loopInsideKeys);
      floor.obstacles = floor.obstacles.filter((o) => !kill.has(hexKey(o.hex)));
    }
    // Apex Predator: biting the tail resets the score multiplier.
    if (res.apexEaten > 0) {
      this.upgrades.resetMultiplier(this.snap);
    }

    // Obstacles roam (they avoid the snake, so no post-move head kill). Acidic
    // Trail dissolves any that sit on or cross the snake's trailing acid hexes.
    const snakeCells = new Set(snake.segments.map((s) => hexKey(s)));
    stepObstacles(floor.obstacles, floor.grid, snakeCells, snake.acidicHexes);
  }

  // ---- transitions ----

  private startRun(): void {
    this.depth = 1;
    this.score = 0;
    this.snap = createSnapshot();
    this.upgrades = new UpgradeSystem();
    this.runSummary = null;
    this.menu.reset();
    this.beginFloor();
    this.state = State.Playing;
  }

  private beginFloor(): void {
    this.floor = FloorGenerator.generate(this.depth, this.snap);
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
    // Defer beginFloor() until after the pick — floor generation reads the
    // snapshot (e.g. Nutrient Storage's essenceReduction), so it must see the
    // just-applied upgrade, not the pre-pick value.
    this.floorAdvancePending = true;
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

    if (this.floorAdvancePending) {
      // Floor-clear pick: now generate the next floor with the updated snapshot.
      this.floorAdvancePending = false;
      this.beginFloor(); // reposition() resets the snake to launch (started=false)
    } else if (this.snake) {
      // Chamber Core pick: stay on this floor, but re-enter the launch state so
      // the player steers out deliberately instead of instantly resuming into a
      // wall — same as the start of a fresh floor.
      this.snake.haltForLaunch();
    }
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
    if (this.state === State.Menu) {
      if (this.menu.onKey(e)) e.preventDefault();
    } else if (this.state === State.Dead && e.code === 'Enter') {
      this.menu.reset();
      this.state = State.Menu;
      e.preventDefault();
    } else if (this.state === State.UpgradeSelect) {
      if (e.code === 'Digit1') this.pickUpgrade(0);
      else if (e.code === 'Digit2') this.pickUpgrade(1);
      else if (e.code === 'Digit3') this.pickUpgrade(2);
    } else if (this.state === State.Playing && e.code === settingsStore.current.keybinds.pause) {
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
      this.menu.render(ctx);
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
      slip: snake ? snake.slipState(this.snap, now) : {
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
