# HexSnake

Snake on a **hexagonal grid** with **roguelike progression** — eat essence, descend
through procedurally generated depths, and mutate your snake into a build. Vanilla
TypeScript + HTML5 Canvas, bundled with Vite. Permadeath. Orange & teal retro-modern.

## Quick start

```bash
npm install
npm run dev
```

Vite opens the game in your browser (default http://localhost:5173). That's it.

Other scripts:

```bash
npm run build     # typecheck (tsc --noEmit) then bundle to dist/
npm run preview   # serve the production build
npm run typecheck # tsc --noEmit only
```

## Controls

The flat-top hex grid mirrors the keyboard: the **top row** keys steer into the
three upper hexes, the **bottom row** into the three lower hexes.

```
   Q  W  E      NW  N  NE
      \ | /         \ | /
       (●)   ──►     (●)
      / | \         / | \
   A  S  D      SW  S  SE
```

| Key        | Direction |
| ---------- | --------- |
| `W`        | N (up)    |
| `E`        | NE        |
| `D`        | SE        |
| `S`        | S (down)  |
| `A`        | SW        |
| `Q`        | NW        |

- **Numpad** mirror also works: `7 8 9` / `1 2 3` (plus `4`/`6`).
- `Space` — **Phase Shifter** (if you have it): pass through your own body for 3s.
- `Enter` — start / restart. `1` `2` `3` or **click** — pick a mutation. `P` — pause.

You can't reverse 180° into your own neck (it's ignored).

## How it plays

- **Eat essence** (teal pellets). Fill the **ESSENCE x/y** bar to open the **portal**
  (amber swirl), then reach it to descend a depth.
- Each depth is **procedurally generated** with walls (gray), toxic **slime** (amber,
  damages you), and from depth 3+, roaming **moving obstacles** (orange).
- A rare **Chamber Core** (gold) may spawn far from you — grabbing it grants a bonus
  mutation mid-floor. **Split Tongue** reveals it from further away.
- **Clear a depth** (or eat a Chamber Core) → pick **1 of 3 mutations**. Stack them
  into a build.
- Crash into a wall/obstacle/your own tail, or burn out on slime → **permadeath** and a
  run summary (depth, score, build).

### Mutations

| Mutation | Effect |
| -------- | ------ |
| **Thick Scales** | +1 max health (tanks slime) + soak one wall hit per floor. |
| **Acid Trail** | Your tail dissolves over time — stay nimble on long runs. |
| **Phase Shifter** | `Space` to phase through your own body for 3s (9s cooldown). |
| **Split Tongue** | +3 sense radius — reveals Chamber Cores from afar. |
| **Growth Hormone** | +2 length per essence and +0.25× score (cap 5×). |
| **Greedy Metabolism** | +0.4× score multiplier (cap 5×), no extra growth. |

## Architecture

```
src/
  main.ts              bootstrap (canvas + Game)
  config.ts            tunables (CONFIG) + palette (PALETTE)
  game/
    Game.ts            GameManager: fixed-timestep loop, FSM, run stats, transitions
    GameState.ts       State enum
    types.ts           Hex, Direction, Occupant, StepResult, RunSummary
  grid/
    hex.ts             pure flat-top axial math (DIRS, neighbor, pixel conv, bounds)
    GridManager.ts     playfield occupancy
  snake/
    SnakeController.ts segments, movement, ordered collision, upgrade hooks
  floor/
    FloorGenerator.ts  procedural walls/slime/essence/core + BFS connectivity + portal
    hazards.ts         moving-obstacle roaming
  upgrades/
    snapshot.ts        GameSnapshot — the single upgrade seam (config struct)
    registry.ts        data-driven MutationDef list
    UpgradeSystem.ts   roll-3, apply, stacking, active list
  input/Input.ts       key→direction map, queue, no-reverse filter
  render/
    Renderer.ts        world draw (interpolated snake, grid, entities)
    HexPainter.ts      flat-top hex primitives
  ui/
    Hud.ts             in-game HUD
    Overlays.ts        menu / upgrade-select / death screens
```

Key design notes (see also `CLAUDE.md`):

- **Hex math is pure** in `grid/hex.ts` — no state, no canvas.
- **`GameSnapshot`** is the single struct mutated by upgrades and read each tick; no
  scattered `if (hasUpgrade)` checks.
- **Fixed-timestep tick + render interpolation**: the snake advances 1 hex per tick and
  glides smoothly at 60fps.
- **BFS connectivity guarantee**: every floor is solvable — walls that would disconnect
  the playfield are rejected at generation time.

### Smoke test

A headless browser smoke test (uses `puppeteer-core` + your system Chrome) boots the
dev server, starts a run, steers, and verifies a wall death transitions cleanly with
zero console/page errors:

```bash
npm run dev          # in one terminal
node scripts/smoke.mjs   # in another
```

## Tuning

All gameplay constants (grid radius, tick rate, hazard densities, essence counts,
upgrade values) and the color palette live in `src/config.ts` and
`src/upgrades/snapshot.ts`. Add new mutations in `src/upgrades/registry.ts`.
