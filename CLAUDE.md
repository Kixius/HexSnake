# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project status

HexSnake is *Snake* on a **hexagonal grid** with **roguelike progression**. It is now a
**Godot 4.7 / GDScript** project in `godot/` (the original TypeScript + Canvas + Vite +
Tauri version has been retired and removed — the Godot port reached feature parity and is
the sole implementation). The full port history + the four Godot gotchas live in the
auto-memory (`godot-port`); the porting plan is `resilient-snacking-wadler.md`.

Run the game with the Godot editor, or headlessly for tests (see Commands).

## Commands

The Godot 4.7 console build is used headlessly. On this machine it lives at
`C:\Users\daffy\Downloads\Godot_v4.7-stable_win64.exe\Godot_v4.7-stable_win64_console.exe`
(see the `godot-cli-path` memory note).

```bash
# From the repo root (the project is in godot/):
godot --headless --path godot --import          # compile all scripts + register autoloads
godot --headless --path godot -s res://core/<test>.gd   # run a SceneTree test script
godot --path godot                               # windowed run (the actual game)
godot --headless --path godot --export-release "Windows Desktop"   # build (needs export templates)
```

The 8 headless test suites in `godot/core/`: `hex_test`, `play_test`, `floor_test`,
`upgrade_test`, `draft_test`, `touch_test`, `parity_test`, `keybind_test`. Run them all
after any change — they are the safety net.

**Debug cheats (dev only):** both gated on `OS.is_debug_build()` (dead code in exports).
In `GameManager._unhandled_input`: `]` fast-forwards (clears the floor → draft → next
depth, or auto-picks the first card on the draft screen); `\` toggles invulnerable +
0.25× slow-mo (`debug_god_mode`). Mash `]` to fast-forward through floors/drafts.

**Godot gotchas (recurring — see the `godot-port` memory for full detail):**
1. Don't name an autoload `Theme` (collides with the built-in) — ours is `Palette`.
2. Autoload singletons are NOT accessible from GDScript `static func` *except* their
   constants — static helpers (e.g. `FloorGenerator`, `Hazards`, `Keybinds`) may read
   `Config.*` consts but must not call autoload instance methods.
3. `-s` SceneTree test scripts only resolve the FIRST autoload (`Config`) by name.
4. Autoloads don't instantiate under `-s` at all. So any script that loads as a `-s`
   dependency (e.g. `GameManager`) must reach other autoloads by **node path**
   (`get_node_or_null("/root/Settings")` + `.call(...)`) and null-guard when not in a
   tree; `world.gd` can use autoloads by name directly (tests never load it).

## Hex grid system (the foundation)

**Flat-top hexes, axial coordinates `Hex = { q, r }`** with derived `s = -q - r` (cube
constraint `q + r + s = 0`). All math follows Red Blob Games' flat-top axial conventions
and lives in **`godot/core/hex.gd`**, which is pure (no state, no canvas) — keep it that way.

The 6 directions are ordered clockwise from North; this index **is** the control index
used everywhere (`godot/input/input_router.gd` maps keys to it via `Settings.keybinds`):

| Key | Dir | (dq, dr) |    | Key | Dir | (dq, dr) |
|-----|-----|----------|----|-----|-----|----------|
| W   | N   | ( 0, -1) |    | S   | S   | ( 0, +1) |
| E   | NE  | (+1, -1) |    | A   | SW  | (-1, +1) |
| D   | SE  | (+1,  0) |    | Q   | NW  | (-1,  0) |

- **Opposite direction** (no-reverse rule) = `(index + 3) % 6` (`Hex.opposite`).
- Playfield is a **hexagonal arena of radius R** (`Config.RADIUS`, default 11 → 397
  cells); `in_bounds(h) = max(|q|, |r|, |q+r|) <= R`. No wraparound — out-of-bounds is a wall.

## Architecture

`godot/game/game_manager.gd` (**GameManager**) owns the fixed-timestep loop, the FSM
(`Menu → Playing → UpgradeSelect → Dead`), run stats, and wires every subsystem. Module
layout under `godot/`: `core/` (pure hex + enums + the test suites), `grid/`
(GridManager), `snake/` (SnakeController), `upgrades/` (GameSnapshot + UpgradeSystem +
registry), `floor/` (FloorGenerator + Hazards), `input/` (InputQueue + InputRouter),
`render/` (World — all hand-drawn `_draw`), `ui/` (touch controls + pointer handler +
the menu system: UiContext/MenuWidgets/MenuScreens/MenuController), `game/` (Floor,
MovingObstacle, StepResult, RunSummary), `settings/` (Keybinds), `autoload/` (Config,
Palette, AudioManager, Settings), `scenes/main.tscn` + `main.gd` (builds the tree).

**Game loop — fixed tick + render interpolation.** The snake advances exactly 1 hex per
logic tick; `World._draw` lerps each segment between `prev_segments` and `segments` using
`render_alpha` (accumulator/dt). `update()` is pure simulation; `_draw` never mutates
state. Frame deltas are clamped (`Config.MAX_FRAME_MS`); sim pauses when not `Playing`.

**Upgrade seam — `GameSnapshot`** (`godot/upgrades/game_snapshot.gd`): a single shared
struct of tunables owned by GameManager. `UpgradeSystem.apply()` (and `reset_multiplier()`
for Apex Predator, `apply_spore()` for Spore) are the *only* writers. Card `apply` logic
is data-driven as GDScript lambdas in `godot/upgrades/registry.gd::build_registry()` —
add a card there (one spot). **Never** scatter `if acidic_enabled` checks — add a field
to `GameSnapshot`, set it in `registry.gd`, and read it where needed.

## Critical invariants (don't break these)

- **Self/obstacle collision = death, unless a card resolves it.** Health
  (`GameSnapshot.max_health`, default 1) is tapped only by slime DoT. **Chitinous Shell**
  soaks a wall hit via a separate `wall_charges` counter (per-floor refill, cap 2) and
  shatters the struck wall, not HP. Self-collision is death *unless* one of these is
  active: the **Phase Shifter** window (Space), **Apex Predator** (devours the bitten
  tail and resets the score multiplier), or **Ouroboros Loop** (vaporizes enclosed
  hazards, then truncates the body). **Hydra's Venom** (1×/run) survives an obstacle hit
  by severing the front half — the tail half becomes the new head, moving outward.
- **Death isn't always run-end — `GameSnapshot.lives` (default `Config.START_LIVES` = 3)
  counts the life you're currently on, so 1 = last life; hard cap `Config.MAX_LIVES` = 5.**
  A true death with `lives > 1` *revives*: `on_death` decrements a life and `respawn()`
  repositions the snake to the floor spawn in launch state, refills health/armor/phase/slip
  — but **keeps the same floor** and essence/portal progress. Only a death at `lives == 1`
  ends the run. **Auxiliary Heart** (+1) / **Regenerative Bloom** (+2) add lives (capped
  at 5). Card-resolved survivals never touch lives.
- **Collision resolution order in `SnakeController.step`** is fixed, first-match-wins:
  bounds/wall (→ **Diagonal Slip** deflect, else Chitinous soak+shatter, else die) →
  moving obstacle (→ **Hydra** split or die) → commit move → own body (→ **Apex** eat /
  **Ouroboros** capture / die, unless phasing) → essence → chamber core → portal → slime
  (DoT, death check last). The `parity_test.gd` suite locks these in.
- **Moving obstacles avoid the snake** (and each other) when roaming (`Hazards.step_obstacles`)
  — they never insta-kill by parking on the head.
- **Input queue:** FIFO capped at 3 (`InputQueue`); consume exactly one queued direction
  per tick via `consume_next`, re-validating no-reverse against the post-turn heading.
- **Real-time timers are framerate-independent:** Phase Shifter / Diagonal Slip cooldowns
  use `Time.get_ticks_msec()` (advanced via the `now` passed into `update()`).
- **Acidic Trail** leaves a lingering acid wake: the rearmost segment drips a pool each
  step (`snake.acid_ttl`, a hex→ticks map), decaying over `snap.acidic_trail_ticks`
  (default 8). `snake.acidic_hexes` is the live set; `World._draw_acid` renders it (alpha
  interpolated across each tick via `render_alpha` for a smooth fade) and
  `Hazards.step_obstacles` dissolves any obstacle on/crossing a pool.
- **Spore is a beneficial pickup** — a permanent multiplicative slow is a *buff* (the
  snake speeds up every floor). A green pellet spawns rarely from `Config.SPORE_START_DEPTH`
  (3); collecting one adds a permanent slow stack (`snap.spore_stacks`); `tick_dt` folds
  it in as `rate *= pow(1 - SPORE_SLOW_PER_STACK, spore_stacks)`.

## Procedural floors

`FloorGenerator.generate(depth, snap)` returns a `Floor` (grid + obstacles + spawn +
`essence_needed` + `clusters`). Difficulty scales with depth (tick rate, wall density,
slime/obstacle counts). **Nutrient Storage** lowers `essence_needed` (min 1); **Tri-
Directional Fork** lays essence as 3-adjacent-hex clusters. **BFS connectivity is
guaranteed**: every wall placement is checked — if it would disconnect any passable cell
from spawn, it is rejected. The portal is placed at the farthest reachable cell from the
snake head; the Chamber Core at the farthest from spawn.

**Pickup placement (essence / spore / chamber core):** each requires **≥2 free adjacent
hexes** AND **≥2 vertex-disjoint routes to spawn** (`FloorGenerator._has_two_routes` —
find one path, block its interior, confirm a second reaches the cell). This guarantees a
pickup is never on a dead-end branch that would trap the snake against its own body after
grabbing. `floor_test.gd` asserts this.

## Tuning

All gameplay constants live in `godot/autoload/config.gd`; per-upgrade runtime values
default in `godot/upgrades/game_snapshot.gd`; card definitions are data-driven in
`godot/upgrades/registry.gd`. The 4 palette themes + audio/display/keybind settings
persist via `godot/autoload/settings.gd` (`user://settings.cfg`).
