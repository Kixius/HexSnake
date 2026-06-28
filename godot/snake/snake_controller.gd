class_name SnakeController
extends RefCounted
## Snake model + movement + ordered collision resolution + card-effect hooks.
## Port of src/snake/SnakeController.ts — the keystone file. Collision resolution
## order is ported VERBATIM (see CLAUDE.md); it is the highest-risk logic in the port.
##
## Invariants:
##  - self/obstacle collision is death UNLESS an active card resolves it (Phase Shifter
##    window, Apex Predator eat, Ouroboros loop capture, Hydra's Venom one-time split).
##  - `hydra_used` is the one GameSnapshot field this writes directly (via the setter).
##  - current `health` is a member here (not on the snapshot); tapped by slime DoT.
##  - exactly one hex per step; prev_segments drives render interpolation.
##
## Time domain: `now` is engine ms (Time.get_ticks_msec), used for Phase/Slip cooldown
## windows. The tick-rate accumulator (GameManager) is a SEPARATE seconds domain.

# Body segments, head at index 0. Vector2i is a value type, so duplicate() deep-copies.
var segments: Array[Vector2i] = []
var prev_segments: Array[Vector2i] = []
var heading: int = 0
# False until the player steers (floor launch). GameManager sets it true on first move.
var started: bool = false

# Current health (slime DoT taps this). max_health_seen tracks raises for full-heal-on-pick.
var health: int = 1
var max_health_seen: int = 1
var wall_charges_consumed: int = 0

var grow_pending: int = 0

# Phase Shifter / Diagonal Slip timing (engine ms).
var phase_until: float = 0.0
var phase_ready_at: float = 0.0
var slip_until: float = 0.0
var slip_ready_at: float = 0.0

# Shedding Season: hexes stepped this floor.
var hexes_traveled: int = 0

# Acidic Trail: hex -> ticks remaining before that acid pool fades. The tail tip re-seeds
# a fresh pool each step; once the tail recedes off a hex, that pool is left behind as the
# wake and just decays until it hits 0. Read by Renderer (acid_fraction) each frame and by
# hazards.gd (step_obstacles) to dissolve roaming hazards standing on a pool.
var acid_ttl: Dictionary = {}  # Vector2i -> int
# Live set of still-active pools (Vector2i -> true). Rebuilt each step from acid_ttl.
var acidic_hexes: Dictionary = {}
# Seed TTL (== snap.acidic_trail_ticks while enabled); denominates acid_fraction. 0 = off.
var acid_ttl_max: int = 0


func _init(spawn: Vector2i, heading_val: int, snap: GameSnapshot) -> void:
	heading = heading_val
	segments = build_body(spawn, heading_val, Config.START_LENGTH)
	prev_segments = segments.duplicate()
	health = snap.max_health
	max_health_seen = snap.max_health


## Reposition for a new floor; keeps run health + upgrades, refreshes per-floor resources.
func reposition(spawn: Vector2i, heading_val: int) -> void:
	heading = heading_val
	segments = build_body(spawn, heading_val, Config.START_LENGTH)
	prev_segments = segments.duplicate()
	started = false
	grow_pending = 0
	wall_charges_consumed = 0
	phase_until = 0.0
	phase_ready_at = 0.0
	slip_until = 0.0
	slip_ready_at = 0.0
	hexes_traveled = 0
	acid_ttl.clear()
	acidic_hexes = {}


## Re-enter the launch (pre-steer) state at the current position — used after a Chamber
## Core pick so the player can choose a fresh direction. Syncs the interpolation buffers
## so the snake renders stationary (the launch contract: started=false => prev==current).
func halt_for_launch() -> void:
	prev_segments = segments.duplicate()
	started = false


func head() -> Vector2i:
	if segments.is_empty():
		push_error("snake has no head")
		return Vector2i.ZERO
	return segments[0]


func wall_charges_remaining(snap: GameSnapshot) -> int:
	return maxi(0, snap.wall_charges - wall_charges_consumed)


# ---- Phase Shifter ----

func is_phasing(now: float) -> bool:
	return phase_until > 0.0 and now < phase_until


func activate_phase(snap: GameSnapshot, now: float) -> void:
	if not snap.phase_enabled:
		return
	if now < phase_ready_at:
		return
	if is_phasing(now):
		return
	phase_until = now + snap.phase_duration_ms
	phase_ready_at = now + snap.phase_duration_ms + snap.phase_cooldown_ms


func phase_state(snap: GameSnapshot, now: float) -> Dictionary:
	if not snap.phase_enabled:
		return {"enabled": false, "active": false, "active_frac": 0.0, "cooldown_frac": 0.0, "ready": false}
	var active: bool = is_phasing(now)
	var active_frac: float = maxf(0.0, (phase_until - now) / snap.phase_duration_ms) if active else 0.0
	var cooling: bool = not active and now < phase_ready_at
	var cooldown_frac: float = maxf(0.0, (phase_ready_at - now) / snap.phase_cooldown_ms) if cooling else 0.0
	return {
		"enabled": true,
		"active": active,
		"active_frac": active_frac,
		"cooldown_frac": cooldown_frac,
		"ready": not active and now >= phase_ready_at,
	}


# ---- Diagonal Slip ----

func is_slipping(now: float) -> bool:
	return slip_until > 0.0 and now < slip_until


func activate_slip(snap: GameSnapshot, now: float) -> void:
	if not snap.slip_enabled:
		return
	if now < slip_ready_at:
		return
	if is_slipping(now):
		return
	slip_until = now + snap.slip_duration_ms
	slip_ready_at = now + snap.slip_duration_ms + snap.slip_cooldown_ms


func slip_state(snap: GameSnapshot, now: float) -> Dictionary:
	if not snap.slip_enabled:
		return {"enabled": false, "active": false, "active_frac": 0.0, "cooldown_frac": 0.0, "ready": false}
	var active: bool = is_slipping(now)
	var active_frac: float = maxf(0.0, (slip_until - now) / snap.slip_duration_ms) if active else 0.0
	var cooling: bool = not active and now < slip_ready_at
	var cooldown_frac: float = maxf(0.0, (slip_ready_at - now) / snap.slip_cooldown_ms) if cooling else 0.0
	return {
		"enabled": true,
		"active": active,
		"active_frac": active_frac,
		"cooldown_frac": cooldown_frac,
		"ready": not active and now >= slip_ready_at,
	}


## Try the two directions adjacent to `heading`; return the first that skims along the
## wall into open space, or -1 if both are blocked.
func _pick_slip_direction(grid: GridManager, heading_val: int) -> int:
	var cands: Array[int] = [posmod(heading_val + 1, Hex.NUM_DIRS), posmod(heading_val + Hex.NUM_DIRS - 1, Hex.NUM_DIRS)]
	for c in cands:
		var cell: Vector2i = Hex.neighbor(head(), c)
		if grid.in_bounds(cell) and grid.occupant_of(cell) != Occupant.WALL:
			return c
	return -1


# ---- Upgrades changed between floors / on core ----

func on_upgrades_changed(snap: GameSnapshot) -> void:
	if snap.max_health > max_health_seen:
		# A max-health raise full-heals on the pick.
		health = snap.max_health
		max_health_seen = snap.max_health
	elif health > snap.max_health:
		health = snap.max_health


# ---- The core step ----

func step(
		grid: GridManager,
		obstacles: Array[MovingObstacle],
		snap: GameSnapshot,
		now: float,
		_dt_ms: float,
		candidate: int
) -> StepResult:
	var result := StepResult.new()
	# candidate < 0 means "no input this tick".
	var cur_head: Vector2i = head()
	var new_heading: int = candidate if candidate >= 0 else heading
	var new_head: Vector2i = Hex.neighbor(cur_head, new_heading)

	# (1) Bounds / static wall — Slip can deflect, Chitinous can soak.
	var in_b: bool = grid.in_bounds(new_head)
	var occ: int = grid.occupant_of(new_head) if in_b else Occupant.EMPTY
	if not in_b or occ == Occupant.WALL:
		# Slip only skims a placed (in-bounds) wall, not the arena perimeter.
		if in_b and occ == Occupant.WALL and snap.slip_enabled and is_slipping(now):
			var slip_dir: int = _pick_slip_direction(grid, new_heading)
			if slip_dir >= 0:
				new_heading = slip_dir
				new_head = Hex.neighbor(cur_head, slip_dir)
				in_b = grid.in_bounds(new_head)
				occ = grid.occupant_of(new_head) if in_b else Occupant.EMPTY
				# fall through — a slip into an obstacle still dies below.
			else:
				result.died = DeathReason.WALL  # slip attempted, nowhere to skim
				return result
		elif wall_charges_remaining(snap) > 0:
			wall_charges_consumed += 1
			# Chitinous Shell: shatter the struck placed wall into open space.
			if snap.chitinous_enabled and in_b and occ == Occupant.WALL:
				grid.clear(new_head)
				result.wall_broken = true
			result.wall_soaked = true
			return result  # keep old heading, do not move
		else:
			result.died = DeathReason.WALL
			return result

	# (2) Moving obstacle at the target cell — Hydra's Venom can sever & survive once.
	# Walls, slime, and the arena edge are NOT "obstacles": they're handled above/below
	# and Hydra never covers them. Length gate is the true minimum for a valid split.
	if obstacles.any(func(o: MovingObstacle) -> bool: return o.hex == new_head):
		if snap.hydra_enabled and not snap.hydra_used and segments.size() >= 3:
			_hydra_split(snap, result)
			return result
		result.died = DeathReason.OBSTACLE
		return result

	# Commit the turn + advance.
	heading = new_heading
	prev_segments = segments.duplicate()
	var len_before: int = segments.size()
	segments.insert(0, new_head)
	hexes_traveled += 1

	var growing: bool = occ == Occupant.ESSENCE

	# (4) Self collision — Apex / Ouroboros can resolve it; otherwise death.
	if not is_phasing(now):
		var k: int = _self_collide_index(growing)
		if k >= 0:
			if snap.apex_enabled:
				# Apex Predator: devour from the bite onward; survive.
				var eaten: int = segments.size() - k
				segments = segments.slice(0, k)
				prev_segments = segments.duplicate()
				grow_pending = 0
				result.apex_eaten = eaten
				_refresh_acidic_hexes(snap)
				return result
			if snap.ouroboros_enabled:
				# Ouroboros Loop: vaporize enclosed hazards, then truncate to clear the overlap.
				result.looped_hazards = _resolve_loop(grid, obstacles, k, result)
				segments = segments.slice(0, k)
				prev_segments = segments.duplicate()
				grow_pending = 0
				_refresh_acidic_hexes(snap)
				return result
			result.died = DeathReason.SELF
			return result

	# (3/5/6/7) Resolve occupant.
	if growing:
		result.ate_essence = true
		grid.clear(new_head)
		grow_pending += snap.growth_per_food
	elif occ == Occupant.CHAMBER_CORE:
		result.ate_core = true
		grid.clear(new_head)
	elif occ == Occupant.SPORE:
		# Spore: collected on contact (no growth, no score). GameManager applies the slow buff.
		result.ate_spore = true
		grid.clear(new_head)
	elif occ == Occupant.PORTAL:
		result.reached_portal = true
		# portal stays put until transition.
	elif occ == Occupant.SLIME:
		result.on_slime = true
		health -= Config.SLIME_DAMAGE

	# Tail: grow vs recede. Shedding Season drops an extra segment on a cadence, but never
	# below the minimum length. Regrowing up from the minimum resets the cadence so the
	# player gets a full sheddingInterval-hex runway before the next shed.
	if grow_pending > 0:
		grow_pending -= 1
		if snap.shedding_enabled and len_before <= Config.MIN_SNAKE_LENGTH:
			hexes_traveled = 0
	else:
		segments.pop_back()
		if snap.shedding_enabled and segments.size() > Config.MIN_SNAKE_LENGTH and hexes_traveled % snap.shedding_interval == 0:
			segments.pop_back()

	# Slime death check (after movement committed).
	if result.on_slime and health <= 0:
		result.died = DeathReason.SLIME

	_refresh_acidic_hexes(snap)
	return result


## Index of the body segment the new head (segments[0]) overlaps, or -1.
## The vacating tail is excluded unless we are growing this step.
func _self_collide_index(growing: bool) -> int:
	var last: int = segments.size() - 1
	var check_up_to: int = last if growing else last - 1
	var h: Vector2i = head()
	for i in range(1, check_up_to + 1):
		if segments[i] == h:
			return i
	return -1


## Hydra's Venom: sever the front half; the tail half reverses to become the new head
## moving outward (away from its own body). New heading is derived from the neck->head
## segment pair so it stays correct on curved bodies.
func _hydra_split(snap: GameSnapshot, result: StepResult) -> void:
	var k: int = int(segments.size() / 2)
	var tail: Array[Vector2i] = segments.slice(k)
	tail.reverse()
	if tail.size() < 2:
		result.died = DeathReason.OBSTACLE  # degenerate; don't consume the one-time use
		return
	var new_head_seg: Vector2i = tail[0]
	var neck_seg: Vector2i = tail[1]
	var nh: int = Hex.direction_of(neck_seg, new_head_seg)  # outward (neck -> head), never inward
	if nh < 0:
		result.died = DeathReason.OBSTACLE
		return
	segments = tail
	heading = nh
	prev_segments = segments.duplicate()
	grow_pending = 0
	snap.set_hydra_used(true)  # documented GameSnapshot write from step()
	result.hydra_split = true


## Ouroboros Loop: flood-fill from the arena border treating the closed body ring
## (segments[0..k]) as a wall; any enclosed Slime / obstacle is vaporized. Obstacle hexes
## are collected into result.loop_inside_keys for GameManager to filter out.
func _resolve_loop(grid: GridManager, obstacles: Array[MovingObstacle], k: int, result: StepResult) -> int:
	var ring_set: Dictionary = {}  # Vector2i -> true
	for i in range(0, k + 1):
		ring_set[segments[i]] = true

	# Flood-fill the outside from every border cell not on the ring.
	var outside: Dictionary = {}
	var queue: Array[Vector2i] = []
	for c in grid.cells:
		if _is_border(c, grid.radius) and not ring_set.has(c):
			if not outside.has(c):
				outside[c] = true
				queue.append(c)
	while queue.size() > 0:
		var cur: Vector2i = queue.pop_front()
		for n in Hex.neighbors(cur):
			if not grid.in_bounds(n):
				continue
			if ring_set.has(n) or outside.has(n):
				continue
			outside[n] = true
			queue.append(n)

	# Inside = in-bounds, not ring, not outside. Vaporize hazards there.
	var count: int = 0
	for c in grid.cells:
		if ring_set.has(c) or outside.has(c):
			continue
		if grid.occupant_of(c) == Occupant.SLIME:
			grid.clear(c)
			count += 1
	for o in obstacles:
		if ring_set.has(o.hex) or outside.has(o.hex):
			continue
		result.loop_inside_keys.append(o.hex)
		count += 1
	return count


func _is_border(c: Vector2i, radius: int) -> bool:
	return max(max(absi(c.x), absi(c.y)), absi(c.x + c.y)) == radius


func _refresh_acidic_hexes(snap: GameSnapshot) -> void:
	if not snap.acidic_enabled or segments.is_empty():
		if acid_ttl.size() > 0:
			acid_ttl.clear()
		acid_ttl_max = 0
		acidic_hexes = {}
		return
	acid_ttl_max = snap.acidic_trail_ticks
	# Age every pool by one tick; drop the ones that have faded. (Only called on steps
	# where the head actually advances, so a paused snake keeps its wake.)
	var keys: Array = acid_ttl.keys()
	for key in keys:
		var next_val: int = int(acid_ttl[key]) - 1
		if next_val <= 0:
			acid_ttl.erase(key)
		else:
			acid_ttl[key] = next_val
	# The rearmost segment drips a fresh pool. Next step the tail recedes off it, leaving
	# it behind as the wake — that lingering acid is what dissolves roaming hazards
	# (which never step onto the snake's own occupied cells).
	var tip: Vector2i = segments[segments.size() - 1]
	acid_ttl[tip] = snap.acidic_trail_ticks
	acidic_hexes = {}
	for key in acid_ttl.keys():
		acidic_hexes[key] = true


## Acidic Trail: 0..1 intensity of the pool on `key` (0 = none). A freshly dripped pool is
## 1; a pool about to fade approaches 0 — drives the Renderer's wake fade.
func acid_fraction(key: Vector2i) -> float:
	if not acid_ttl.has(key) or acid_ttl_max <= 0:
		return 0.0
	return float(acid_ttl[key]) / float(acid_ttl_max)


## Resolve a death reason into a palette KEY for the death flash. Returns a key (not a
## Color) so this static helper doesn't reference the Palette autoload — autoload
## singletons aren't accessible from static functions (they're runtime instances, not
## compile-time globals). The caller looks it up via Palette.color(key).
static func death_color_key(reason: int) -> String:
	match reason:
		DeathReason.WALL:
			return "wall"
		DeathReason.OBSTACLE:
			return "obstacle"
		DeathReason.SLIME:
			return "slime"
		DeathReason.SELF:
			return "danger"
		_:
			return "text"


## Build a straight tail behind `spawn` along the opposite of `heading`. (Static helper;
## mirrors the module-level buildBody() in the TS.)
static func build_body(spawn: Vector2i, heading_val: int, length: int) -> Array[Vector2i]:
	var back: int = Hex.opposite(heading_val)
	var segs: Array[Vector2i] = [spawn]
	var cur: Vector2i = spawn
	for i in range(1, length):
		cur = Hex.neighbor(cur, back)
		segs.append(cur)
	return segs
