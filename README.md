# HexSnake

Snake on a **hexagonal grid** with **roguelike progression** — eat essence, open the
portal, descend through procedurally generated depths, and mutate your snake into a
build. Permadeath. Built with **Godot 4.7 / GDScript** (hand-drawn on a Node2D canvas —
no game framework, no Control-node UI).

The game lives entirely in [`godot/`](godot). (An earlier TypeScript + Canvas + Vite +
Tauri version was ported over and has been retired.)

## Run

Open `godot/project.godot` in the **Godot 4.7** editor and press ▶, or from a console:

```bash
godot --path godot                       # windowed run (the game)
```

## Headless tests

The port ships 8 `-s` SceneTree test suites under [`godot/core/`](godot/core) — run them
after any change:

```bash
godot --headless --path godot --import                      # compile + register autoloads
godot --headless --path godot -s res://core/parity_test.gd  # run one suite
```

Suites: `hex_test`, `play_test`, `floor_test`, `upgrade_test`, `draft_test`,
`touch_test`, `parity_test`, `keybind_test`. `parity_test` is the rules gate (death
reasons, every card-resolved survival, lives counting, collision order); `floor_test`
guards the BFS-connectivity + 2-routes-to-spawn pickup-placement invariants.

## Build / export

Export presets live in [`godot/export_presets.cfg`](godot/export_presets.cfg). Building
needs the **export templates** installed (editor → Manage Export Templates → Download),
then:

```bash
godot --headless --path godot --export-release "Windows Desktop"   # -> godot/build/HexSnake.exe
```

Add macOS / Linux / Android / iOS / Web presets from the editor's Export dialog (each
target needs its native toolchain). Settings (audio, theme, difficulty, keybinds, video)
persist to `user://settings.cfg`.

## Controls

The flat-top hex grid mirrors the keyboard: the top row steers into the three upper
hexes, the bottom row into the three lower hexes (rebindable in Settings → Keybinds).

```
   Q  W  E      NW  N  NE
      \ | /         \ | /
       (●)   ──►     (●)
      / | \         / | \
   A  S  D      SW  S  SE
```

`Space` — Phase Shifter · `Shift` — Diagonal Slip · `P` — pause · `Enter` — select/start ·
`Esc` — back. On touch devices an on-screen hex pad appears. You can't reverse 180° into
your own neck.

## How it plays

- **Eat essence** (blue pellets) to fill the bar and open the **portal** (amber swirl);
  reach it to descend a depth.
- Each depth is **procedurally generated** with walls, toxic **slime** (damages you), and
  from depth 3+, roaming **moving obstacles**. A rare **Chamber Core** (gold, hidden until
  you're within sense range) grants a bonus mutation mid-floor.
- **Clear a depth** (or eat a Chamber Core) → pick **1 of 3 mutations** and stack them.
- You have **lives** (default 3, max 5): a death revives you on the same floor until your
  last life — then it's **permadeath** and a run summary.

### Mutations (14 cards, 4 rarities)

| Rarity | Card | Effect |
| ------ | ---- | ------ |
| Common | **Elongated Strike** | +25% essence score (snake moves 5% faster). |
| Common | **Chitinous Shell** | +1 armor charge (max 2); striking a wall soaks the hit + shatters it. |
| Common | **Nutrient Storage** | −2 essence needed per portal. |
| Common | **Auxiliary Heart** | +1 life (max 5). |
| Rare | **Tri-Directional Fork** | Essence spawns in 3-adjacent clusters. |
| Rare | **Shedding Season** | Shed a tail segment every 15 hexes. |
| Rare | **Diagonal Slip** | `Shift` — skim along a wall instead of crashing. |
| Epic | **Phase Shifter** | `Space` — phase through your own body. |
| Epic | **Acidic Trail** | Leave an acid wake that dissolves roaming hazards. |
| Epic | **Hypertrophy** | +200% score, but +2 length per essence. |
| Epic | **Regenerative Bloom** | +2 lives. |
| Legendary | **Ouroboros Loop** | Encircle hazards + bite your tail to vaporize them and survive. |
| Legendary | **Hydra's Venom** | One-time: crash into an obstacle severs you in two, new head moves outward. |
| Legendary | **Apex Predator** | Biting your tail devours it (you survive) + resets your score multiplier. |

## Structure

```
godot/
  autoload/   Config, Palette (4 themes), AudioManager, Settings (persistence)
  core/       pure hex math, enums, + the 8 headless test suites
  floor/      FloorGenerator (BFS-connected, 2-routes pickups), Hazards (roaming obstacles)
  game/       GameManager (loop + FSM), SnakeController, Floor, StepResult, RunSummary
  grid/       GridManager
  input/      InputQueue, InputRouter (Settings-driven keybinds)
  render/     World (all hand-drawn _draw: grid, snake, pickups, HUD, menus, overlays)
  settings/   Keybinds (conflict / reserved-key logic)
  upgrades/   GameSnapshot (the tunable seam), UpgradeSystem (weighted draft), Registry (14 cards)
  ui/         TouchControls, PointerHandler (mouse+touch), MenuController + UiContext + widgets + screens
  assets/     audio (music + SFX), icon
```

Key design notes (see `CLAUDE.md` for full invariants): hex math is pure in
`core/hex.gd`; **`GameSnapshot`** is the single struct mutated by upgrades (no scattered
`if has_upgrade` checks); the snake advances 1 hex per fixed tick with render
interpolation; every floor is BFS-solvable and every pickup has ≥2 routes to spawn.
