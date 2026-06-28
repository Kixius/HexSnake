extends Node
## Central tunables (port of src/config.ts CONFIG). Adjust freely for playtesting.
## Accessed globally as `Config`. Read-only constants.

# Playfield radius in hexes (hexagonal arena). R=11 -> 397 cells.
const RADIUS: int = 11

# Snake / movement.
const START_LENGTH: int = 3
# Hard floor on snake length (Shedding Season never drops below this).
const MIN_SNAKE_LENGTH: int = 2
const BASE_TICK_RATE: float = 5.0  # ticks per second at depth 1 (lower = slower)
const TICK_RATE_PER_DEPTH: float = 0.3
const MAX_TICK_RATE: float = 14.0

# Essence (food) -> portal.
const ESSENCE_BASE: int = 5
const ESSENCE_PER_DEPTH: int = 1
const GROWTH_PER_FOOD_BASE: int = 1
const SCORE_PER_ESSENCE: int = 10
const SCORE_PER_CORE: int = 75
const SCORE_PER_DEPTH_CLEARED: int = 50
const SCORE_PER_LOOPED: int = 25

# Hazards (scale with depth).
const WALL_DENSITY_BASE: float = 0.05
const WALL_DENSITY_PER_DEPTH: float = 0.012
const WALL_DENSITY_MAX: float = 0.15
const SLIME_BASE: float = 2.0
const SLIME_PER_DEPTH: float = 0.5
const OBSTACLE_BASE: float = 0.0
const OBSTACLE_PER_DEPTH: float = 0.6
const OBSTACLE_MOVE_EVERY: int = 2  # obstacle moves once every N ticks
const CHAMBER_CORE_CHANCE: float = 0.3
const CHAMBER_CORE_MIN_ESCAPE_HEXES: int = 2

# Spore: permanent 5% slow per collect (a buff — the snake speeds up each floor,
# so slowing buys reaction time). First appears on floor SPORE_START_DEPTH.
const SPORE_START_DEPTH: int = 3
const SPORE_CHANCE: float = 0.4
const SPORE_SLOW_PER_STACK: float = 0.05

# Health / damage / lives.
const START_HEALTH: int = 1
const SLIME_DAMAGE: int = 1
# Lives per run. Each death (while you have a spare) respawns on the current floor
# with essence progress kept; running out ends the run. lives counts the life you're on.
const START_LIVES: int = 3
# Hard cap on lives (the +life cards stop here). The HUD sizes its life-slot row to
# the peak lives reached this run, so empty slots = lives actually lost.
const MAX_LIVES: int = 5

# Loop safety.
const MAX_FRAME_MS: float = 250.0

# Rendering.
const MARGIN: float = 28.0

# Difficulty presets (port of DIFFICULTY). Chosen on the difficulty screen, applied
# once at run start (frozen for the whole run). speed_mult scales the tick rate
# (higher = faster snake = harder); score_mult scales all points (risk/reward).
const DIFFICULTIES: Dictionary = {
	"easy": {"speed_mult": 0.75, "score_mult": 0.75, "label": "EASY"},
	"normal": {"speed_mult": 1.0, "score_mult": 1.0, "label": "NORMAL"},
	"hard": {"speed_mult": 1.3, "score_mult": 1.5, "label": "HARD"},
}
const DIFFICULTY_ORDER: Array = ["easy", "normal", "hard"]
