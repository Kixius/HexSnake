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
```

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

**Responsive input flush.** Because latency is otherwise locked to the (slow) tick
interval, `GameManager.loop` runs an extra `update()` immediately when a direction
*change* is waiting (`Input.peekApplied` returns a dir ≠ current heading), instead of
waiting for the next tick boundary. Only actual turns are pulled forward — straight-line
speed is unchanged and holding a key can't speed the snake up (each flushed step resets
the accumulator). Launch likewise moves on the first tick rather than the second.

**Upgrade seam — `GameSnapshot`** (`src/upgrades/snapshot.ts`): a single shared struct
of tunables owned by GameManager. `UpgradeSystem.apply()` is the *only* writer;
`SnakeController`, `Renderer`, and `Hud` read it each tick. **Never** scatter
`if (hasAcidTrail)` checks — add a field to `GameSnapshot`, set it in
`registry.ts`, and read it where needed.

## Critical invariants (don't break these)

- **Tail collision = death is absolute.** Health (`maxHealth`, default 1) is tapped only
  by slime DoT. **Thick Scales** soaks a wall hit via a *separate* `wallCharges` counter
  (per-floor refill), not HP. The only way to survive self-collision is the active
  **Phase Shifter** window (`Space`) — never HP.
- **Collision resolution order in `SnakeController.step`** is fixed, first-match-wins:
  bounds/wall (→ soak or die) → moving obstacle → slime (DoT) → own body (unless phasing)
  → essence → chamber core → portal.
- **Moving obstacles avoid the snake** (and each other) when roaming — they never insta-kill
  by parking on the head. The danger is the snake steering *into* one. (This deliberately
  differs from the plan's "post-move head overlap" for fairness.)
- **Input queue:** FIFO capped at 3 in `Input.ts`; **consume exactly one queued direction
  per tick** via `consumeNext`, re-validating no-reverse against the post-turn heading.
  The launch path also uses `consumeNext` (never bypass it — reversing into the starting
  body would be an instant-death bug).
- **Real-time timers are framerate-independent:** Acid Trail melt and Phase Shifter use
  `performance.now()` / `dt`, advanced in `update()`, not per-render.
- **Acid Trail** trims the tail on a real-time timer (`meltDelayMs`) — melted segments
  are simply removed (so they can't cause self-collision) and drawn as fading acid in
  `snake.acidTrails`.

## Procedural floors

`FloorGenerator.generate(depth)` returns a `Floor` (grid + obstacles + spawn +
`essenceNeeded`). Difficulty scales with depth (tick rate, wall density, slime/obstacle
counts). **BFS connectivity is guaranteed**: every wall placement is checked — if it
would disconnect any passable cell from spawn, it is rejected. The portal (and Chamber
Core) are placed at the **farthest reachable cell** from the relevant origin (snake head
for the portal). Chamber Core is hidden beyond `max(4, snap.radarRadius)` hexes —
**Split Tongue** is what reveals it from afar.

## Tuning

All gameplay constants and the orange/teal palette live in `src/config.ts`; per-upgrade
runtime values default in `src/upgrades/snapshot.ts`; mutation definitions are data-driven
in `src/upgrades/registry.ts` (add new ones there — no other code needs to change for
pure-snapshot effects).
