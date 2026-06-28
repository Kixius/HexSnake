class_name GameSnapshot
extends Resource
## The upgrade seam (port of src/upgrades/snapshot.ts). A single shared struct of
## tunables owned by GameManager.
##
## - ONLY UpgradeSystem (apply / reset_multiplier / apply_spore) mutates these — with
##   ONE documented runtime exception where SnakeController writes directly:
##   `hydra_used` (the one-time Hydra split). (The CLAUDE.md/comment also name `health`,
##   but in the real TS code `health` is a SnakeController member, not a snapshot field —
##   current health has nowhere else to live, so it rides on the snake.)
## - SnakeController / Renderer / HUD READ these fields every tick.
##
## Do NOT scatter `if has_acidic_trail` checks around the codebase: add a field here,
## have the relevant card set it, and read it where needed.
##
## Member defaults are neutral placeholders; _init() calls reset() to apply the real
## Config-derived values (avoids referencing the autoload in compile-time defaults).

# Max health pool (tapped by slime DoT only). Current health lives on SnakeController.
var max_health: int = 1
# Wall/bounds soak charges (Chitinous Shell) — separate from health.
var wall_charges: int = 0
# Lives remaining, counting the life you're currently on. >1 on death revives on the
# current floor (essence progress kept); 1 = last life. Life cards add to this.
var lives: int = 3

# Score multiplier. Apex Predator resets this to 1 via UpgradeSystem.reset_multiplier.
var score_mult: float = 1.0
# Body segments added per essence eaten (Hypertrophy raises this).
var growth_per_food: int = 1
# Multiplier on the snake's tick rate (Elongated Strike raises this = faster snake).
var speed_mult: float = 1.0
# Essence subtracted from each floor's portal requirement (Nutrient Storage).
var essence_reduction: int = 0

# Phase Shifter: active-cd ability to pass through own body.
var phase_enabled: bool = false
var phase_duration_ms: float = 4000.0
var phase_cooldown_ms: float = 8000.0

# Diagonal Slip: active-cd ability to deflect along a wall instead of crashing.
var slip_enabled: bool = false
var slip_duration_ms: float = 2000.0
var slip_cooldown_ms: float = 15000.0

# Acidic Trail: the snake leaves a decaying acid wake that dissolves roaming hazards.
var acidic_enabled: bool = false
# Ticks an acid pool lingers on a vacated hex before it fades.
var acidic_trail_ticks: int = 8

# Chitinous Shell: soak also shatters the struck in-bounds wall hex.
var chitinous_enabled: bool = false
var chitin_cap: int = 2

# Shedding Season: drop a tail segment every N hexes traveled.
var shedding_enabled: bool = false
var shedding_interval: int = 15

# Tri-Directional Fork: essence spawns as 3-adjacent clusters.
var fork_enabled: bool = false

# Ouroboros Loop: self-collision captures enclosed hazards for score.
var ouroboros_enabled: bool = false
# Hydra's Venom: one-time obstacle-hit survival via body split.
var hydra_enabled: bool = false
var hydra_used: bool = false
# Apex Predator: self-collision eats the bitten tail + resets score multiplier.
var apex_enabled: bool = false

# Sense radius for revealing Chamber Cores from afar (no card sets this now; default 0).
var radar_radius: int = 0

# Spore pellets consumed this run. Each adds a permanent multiplicative slow
# (pow(1 - sporeSlowPerStack, sporeStacks)) applied in tick_dt.
var spore_stacks: int = 0


func _init() -> void:
	reset()


## Reset to a fresh run's defaults (mirrors createSnapshot()).
func reset() -> void:
	max_health = Config.START_HEALTH
	wall_charges = 0
	lives = Config.START_LIVES
	score_mult = 1.0
	growth_per_food = Config.GROWTH_PER_FOOD_BASE
	speed_mult = 1.0
	essence_reduction = 0
	phase_enabled = false
	phase_duration_ms = 4000.0
	phase_cooldown_ms = 8000.0
	slip_enabled = false
	slip_duration_ms = 2000.0
	slip_cooldown_ms = 15000.0
	acidic_enabled = false
	acidic_trail_ticks = 8
	chitinous_enabled = false
	chitin_cap = 2
	shedding_enabled = false
	shedding_interval = 15
	fork_enabled = false
	ouroboros_enabled = false
	hydra_enabled = false
	hydra_used = false
	apex_enabled = false
	radar_radius = 0
	spore_stacks = 0


# --- The one snake-side snapshot writer exception (routed through a setter) ---

func set_hydra_used(v: bool) -> void:
	hydra_used = v
