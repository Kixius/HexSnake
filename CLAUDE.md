# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

HexSnake is a complete, playable browser game: *Snake* on a **hexagonal grid** with
**roguelike progression**, built with vanilla TypeScript + HTML5 Canvas + Vite (no game
framework). The original approved design lives in
`C:\Users\daffy\.claude\plans\act-as-an-expert-twinkling-lovelace.md`. Run with
`npm run dev`.

## Commands

```bash
npm install        # devDeps only (vite, typescript, @types/node, puppeteer-core)
npm run dev        # Vite dev server with HMR (opens browser)
npm run build      # tsc --noEmit (typecheck) then vite build -> dist/
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit only
node scripts/smoke.mjs   # headless smoke test (needs `npm run dev` running)
npm run tauri dev    # desktop dev window: Vite + Tauri shell (needs Rust + MSVC Build Tools)
npm run tauri build  # build the Windows app -> src-tauri/target/release/{app.exe, bundle/nsis/*.exe}
```

**Desktop build:** `npm run tauri build` wraps the Vite output as a Windows app via Tauri 2
(`src-tauri/`). It needs the Rust toolchain + MSVC C++ Build Tools installed. The web and
desktop builds share **identical game code** — only `vite.config.ts` (`base: './'`, pinned
dev port) and `src-tauri/tauri.conf.json` are desktop-specific; never fork game logic for it.

**Debug cheat (dev only):** gated on `import.meta.env.DEV` (`src/vite-env.d.ts` types it),
so it's live under `npm run dev` / `npm run tauri dev` and dead code in production builds.
- `]` (BracketRight) in `Game.onMetaKey`: during **Playing** it calls `onFloorCleared()`
  (instantly clears the floor → upgrade pick → next depth); during **UpgradeSelect** it
  auto-picks the first card. Mash `]` to fast-forward to deep floors / specific upgrades.
- `\` (Backslash) during **Playing** toggles `debugGodMode`: the snake is invulnerable
  (deaths are swallowed in `update`) AND `tickDt()` runs at 0.25× (`dt / debugTimeScale`),
  i.e. slow-mo for inspecting collisions. Toggling on also tops up health and clears the
  accumulator so the rate change doesn't burst-catch-up.

A dim `DEV` hint is drawn in `renderFrame` via `drawDevHint()`.

`tsconfig.json` uses `"strict": true` and `"noUncheckedIndexedAccess": true`. The latter
makes array indexing (e.g. `DIRS[i]`, `segments[0]`) type as `T | undefined` — use the
`head` getter (which throws if empty) and the `dir(i)` helper rather than indexing
directly, so bugs fail loudly.

## Hex grid system (the foundation)

**Flat-top hexes, axial coordinates `Hex = { q, r }`** with derived `s = -q - r` (cube
constraint `q + r + s = 0`). All math follows Red Blob Games' flat-top axial conventions
and lives in **`src/grid/hex.ts`**, which is pure (no state, no canvas) — keep it that way.

The 6 directions are ordered clockwise from North; this index **is** the control index
used everywhere (`src/input/Input.ts` maps keys to it):

| Key | Dir | (dq, dr) |    | Key | Dir | (dq, dr) |
|-----|-----|----------|----|-----|-----|----------|
| W   | N   | ( 0, -1) |    | S   | S   | ( 0, +1) |
| E   | NE  | (+1, -1) |    | A   | SW  | (-1, +1) |
| D   | SE  | (+1,  0) |    | Q   | NW  | (-1,  0) |

- **Opposite direction** (no-reverse rule) = `(index + 3) % 6`.
- Playfield is a **hexagonal arena of radius R** (`CONFIG.radius`, default 11 → 397
  cells); `inBounds(h) = max(|q|, |r|, |q+r|) <= R`. No wraparound — out-of-bounds is a wall.
- Cube-rounding (in `pixelToHex`) re-enforces `q + r + s = 0`. Always `inBounds`-check
  pixel/mouse-derived hexes (corners round out-of-bounds).

## Architecture

`src/game/Game.ts` (**GameManager**) owns the fixed-timestep loop, the FSM
(`Menu → Playing → UpgradeSelect → Dead`), run stats, and wires every subsystem. Module
map (full tree in `README.md`): `Game` = GameManager, `grid/` = GridManager + pure
`hex.ts`, `snake/SnakeController`, `upgrades/UpgradeSystem` + `registry`, plus `floor/`,
`input/`, `render/`, `ui/`.

**Game loop — fixed tick + render interpolation.** The snake advances exactly 1 hex per
logic tick; `render(alpha)` lerps each segment between `prevSegments` and `segments`.
`update()` is pure simulation; `render()` never mutates state. Frame deltas are clamped
(`CONFIG.maxFrameMs`); sim pauses on `document.hidden` and `P`. `GameManager` sets the
DPR transform each frame before drawing — `Renderer.render` must **not** reset it.

**Upgrade seam — `GameSnapshot`** (`src/upgrades/snapshot.ts`): a single shared struct
of tunables owned by GameManager. `UpgradeSystem.apply()` (and `resetMultiplier()`,
used by Apex Predator) are the *only* writers — with two documented runtime
exceptions where `SnakeController.step` writes directly: `health` (slime DoT) and
`hydraUsed` (the one-time Hydra split). `Renderer` and `Hud` read the snapshot each
tick. **Never** scatter `if (hasAcidicTrail)` checks — add a field to `GameSnapshot`,
set it in `registry.ts`, and read it where needed. The pool is a curated **12-card
draft** across four rarities (common/rare/epic/legendary); `UpgradeSystem.rollThree()`
offers 3 weighted-distinct choices on floor-clear and chamber-core-consume.

## Critical invariants (don't break these)

- **Self/obstacle collision = death, unless a card resolves it.** Health (`maxHealth`,
  default 1) is tapped only by slime DoT. **Chitinous Shell** soaks a wall hit via a
  *separate* `wallCharges` counter (per-floor refill, cap 2) and shatters the struck
  placed wall, not HP. Self-collision is death *unless* one of these is active: the
  **Phase Shifter** window (`Space`), **Apex Predator** (devours the bitten tail and
  resets the score multiplier via `UpgradeSystem.resetMultiplier`), or **Ouroboros
  Loop** (vaporizes enclosed hazards, then truncates the body to clear the overlap).
  **Hydra's Venom** (1×/run) survives an obstacle hit by severing the front half — the
  tail half reverses to become the new head (heading derived neck→head so it moves
  *outward*, never into its own neck).
- **Death isn't always run-end — `GameSnapshot.lives` (default `CONFIG.startLives` = 3).**
  A true death (wall/obstacle/self/slime) with `lives > 0` instead *revives*: `onDeath`
  decrements a life and `respawn()` repositions the snake to the floor spawn in launch
  state, refills health/armor/phase/slip, and plays a red flash — but **keeps the same
  floor** (layout, slime, roaming obstacles, already-eaten essence) and the `essenceCollected`
  /`portalActive` progress ("resume from the middle"). Only a death at `lives == 0` ends the
  run. **Auxiliary Heart** (common, maxStacks 3) and **Regenerative Bloom** (epic, maxStacks 1)
  add lives. Card-resolved survivals (Chitinous/Phase/Apex/Ouroboros/Hydra) never touch lives.
- **Collision resolution order in `SnakeController.step`** is fixed, first-match-wins:
  bounds/wall (→ active **Diagonal Slip** deflects along a placed wall, else Chitinous
  soak+shatter, else die) → moving obstacle (→ **Hydra** split or die) → commit move →
  own body via `selfCollideIndex` (→ **Apex** eat / **Ouroboros** capture / die, unless
  phasing) → essence → chamber core → portal → slime (DoT, death check last).
- **Moving obstacles avoid the snake** (and each other) when roaming — they never insta-kill
  by parking on the head. The danger is the snake steering *into* one. (This deliberately
  differs from the plan's "post-move head overlap" for fairness.)
- **Input queue:** FIFO capped at 3 in `Input.ts`; **consume exactly one queued direction
  per tick** via `consumeNext`, re-validating no-reverse against the post-turn heading.
  The launch path also uses `consumeNext` (never bypass it — reversing into the starting
  body would be an instant-death bug).
- **Real-time timers are framerate-independent:** the Phase Shifter and Diagonal Slip
  cooldowns use `performance.now()` (advanced via the `now` passed into `update()`), not
  per-render.
- **Acidic Trail** leaves a lingering acid **wake**: each step the rearmost segment
  drips a fresh pool (`snake.acidTtl`, a hexKey→ticks map), and once the tail recedes
  off a hex that pool is left behind and decays over `snap.acidicTrailTicks` (default
  8). `snake.acidicHexes` is the live `ReadonlySet` of still-active pools — read each
  tick by `Renderer` and `stepObstacles`, the latter dissolving any moving obstacle that
  stands on or crosses one (spliced out of `floor.obstacles`). The wake is what makes
  the card work: obstacles avoid the snake's occupied cells, so only the empty vacated
  hexes behind it can ever dissolve a roaming hazard. The old tail-melting Acid Trail
  (and the brief "last 3 segments" version that slid with the tail and never lingered)
  were removed when the card was repurposed.
- **Spore is a beneficial pickup — a permanent slow is a *buff* here** (the snake
  speeds up every floor, so slowing it buys reaction time). A green downward-triangle
  pellet (`Occupant.Spore`, passable) spawns rarely from floor `CONFIG.sporeStartDepth`
  (3); it's never required to advance. Collecting one consumes it (no growth/score,
  `StepResult.ateSpore`) and adds a **permanent multiplicative slow** for the run via
  `UpgradeSystem.applySpore` → `snap.sporeStacks`. `Game.tickDt` folds it in as
  `rate *= Math.pow(1 - sporeSlowPerStack, sporeStacks)` (5% each, default) — this is
  a third `GameSnapshot` writer path, routed through `UpgradeSystem` to honor the seam.

## Procedural floors

`FloorGenerator.generate(depth, snap)` returns a `Floor` (grid + obstacles + spawn +
`essenceNeeded` + `clusters`). Difficulty scales with depth (tick rate, wall density,
slime/obstacle counts). **Nutrient Storage** lowers `essenceNeeded` (min 1); **Tri-
Directional Fork** lays essence as 3-adjacent-hex clusters (`Floor.clusters` maps each
member to its siblings so eating one clears the rest — 1 cluster = 1 toward the portal).
**BFS connectivity is guaranteed**: every wall placement is checked — if it would
disconnect any passable cell from spawn, it is rejected. The portal (and Chamber Core)
are placed at the **farthest reachable cell** from the relevant origin (snake head for
the portal). Chamber Core is hidden beyond `max(4, snap.radarRadius)` hexes.

## Tuning

All gameplay constants and the orange/teal palette live in `src/config.ts`; per-upgrade
runtime values default in `src/upgrades/snapshot.ts`; mutation definitions are data-driven
in `src/upgrades/registry.ts` (add new ones there — no other code needs to change for
pure-snapshot effects).
