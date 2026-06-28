class_name StepResult
extends RefCounted
## Result of one snake step (port of StepResult from src/game/types.ts).
## `died` is a DeathReason int, or -1 for "no death this step".

var died: int = -1
var ate_essence: bool = false
var ate_core: bool = false
var reached_portal: bool = false
var on_slime: bool = false
var ate_spore: bool = false
# A wall/bounds charge was consumed this step (move cancelled).
var wall_soaked: bool = false
# Chitinous Shell shattered the struck wall hex into open space (VFX hook).
var wall_broken: bool = false
# Hydra's Venom triggered: front half severed, tail half now leads (VFX hook).
var hydra_split: bool = false
# Ouroboros Loop: number of hazards vaporized inside the closed body loop.
var looped_hazards: int = 0
# Vector2i hexes of obstacles destroyed by Ouroboros (GameManager filters floor.obstacles).
var loop_inside_keys: Array[Vector2i] = []
# Apex Predator: tail segments devoured (>0 -> GameManager resets score multiplier).
var apex_eaten: int = 0
