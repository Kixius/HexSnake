class_name GameManager
extends Node
## Owns the fixed-timestep loop, the FSM, run stats, and wires every subsystem.
## Port of src/game/Game.ts (simulation core). Pure simulation in update(); the
## World node does the rendering each frame.
##
## Time domains (kept separate, matching the TS):
##  - the tick accumulator + tick_dt are in SECONDS (delta is seconds in Godot);
##  - `now` (passed to SnakeController for Phase/Slip cooldowns) is engine MS
##    (Time.get_ticks_msec).
##
## Phase 3 scope: Menu <-> Playing <-> UpgradeSelect <-> Dead, full procedural
## floors + portal/lives (Phase 2), and the 14-card mutation draft. Card survival
## mechanics live in snake_controller.gd; this wires the draft FSM + the post-step
## consequences (Apex multiplier reset, Ouroboros hazard vaporize) + spore. Audio,
## menus, and difficulty-from-settings land in Phase 4+.

var world: Node2D = null  # render/world.gd (typed via class_name World at runtime)
var menu: Node = null  # godot/ui/menu_controller.gd (set by main.gd); null under `-s`
var input_queue := InputQueue.new()

var state: int = GameState.MENU
var depth: int = 1
var score: int = 0
# Per-run difficulty multipliers, frozen at run start (1 = normal).
var diff_speed_mult: float = 1.0
var diff_score_mult: float = 1.0
var paused: bool = false
var essence_collected: int = 0
var portal_active: bool = false

var floor: Floor = null
var snake: SnakeController = null
var snap := GameSnapshot.new()

var accumulator: float = 0.0
var render_alpha: float = 1.0

# Respawn flash + death cinematic timing (engine ms).
var respawn_flash_at: float = 0.0
const RESPAWN_FLASH_MS: float = 700.0
# Death cinematic: a slow eased zoom INTO the death point, then the summary reveal.
const DEATH_ZOOM_MS: float = 950.0
const DEATH_ZOOM_TO: float = 1.14
const DEATH_REVEAL_MS: float = 1700.0
var death_started_at: float = 0.0
# Run summary built on death / voluntary end-run (drives the death screen).
var run_summary: RunSummary = null
var run_difficulty_label: String = "NORMAL"  # frozen at start_run

# Dev slow-mo divisor (god-mode toggle lands in Phase 6; off by default).
const DEBUG_TIME_SCALE: float = 0.25
var debug_god_mode: bool = false

# Upgrade system: rolls the 3-card draft, applies picks to the snapshot (the SOLE
# GameSnapshot writer, with the documented snake-side hydra_used exception), and
# tracks the active build for the HUD / death summary.
var upgrades := UpgradeSystem.new()
var choices: Array[MutationDef] = []
# True while a floor-clear pick is pending: generate the NEXT floor AFTER the pick so
# FloorGenerator sees the updated snapshot (e.g. Nutrient Storage's essenceReduction).
var floor_advance_pending: bool = false
# Upgrade-select pick animation (engine ms). pick_index < 0 = no pick resolving.
var pick_index: int = -1
var pick_started_at: float = 0.0
const PICK_ANIM_MS: float = 240.0
# Slime-DoT SFX throttle (engine ms) so lingering on a pool doesn't machine-gun it.
var last_slime_sfx_at: float = 0.0
const SLIME_SFX_GAP_MS: float = 250.0
# AudioManager accessed by node path (not global name) so this script still compiles
# when reloaded as a `-s` test dependency, where only the first autoload resolves by
# name. null until first use / when not in a tree (headless tests -> silent, fine).
var _audio: Node = null


# ---- the loop ----

func _process(delta: float) -> void:
	var now: float = float(Time.get_ticks_msec())
	# Resolve the upgrade-pick animation on its own clock (the sim is paused here).
	if state == GameState.UPGRADE_SELECT:
		finalize_pick()
	if state == GameState.PLAYING and not paused:
		accumulator += min(delta, Config.MAX_FRAME_MS / 1000.0)
		var dt: float = tick_dt()
		var guard := 0
		while accumulator >= dt and guard < 8:
			update(now)
			accumulator -= dt
			guard += 1
			if state != GameState.PLAYING:
				break
		render_alpha = accumulator / dt if dt > 0.0 else 0.0
	else:
		render_alpha = 1.0
	if world != null:
		world.queue_redraw()


func tick_dt() -> float:
	var base: float = min(
		Config.MAX_TICK_RATE,
		(Config.BASE_TICK_RATE + Config.TICK_RATE_PER_DEPTH * float(depth - 1)) * snap.speed_mult
	)
	# Spore: each consumed pellet permanently slows the snake (multiplicative).
	var slow: float = pow(1.0 - Config.SPORE_SLOW_PER_STACK, float(snap.spore_stacks))
	# Difficulty scales the whole rate (applied after the cap so HARD can exceed it).
	var rate: float = base * slow * diff_speed_mult
	if rate <= 0.0:
		rate = 1.0
	var dt: float = 1.0 / rate
	# Slow-mo: a larger dt per tick => fewer ticks fire => 0.25x real time.
	return dt / DEBUG_TIME_SCALE if debug_god_mode else dt


# ---- simulation ----

## Play a one-shot SFX via the AudioManager autoload (node-path lookup so this compiles
## even when reloaded as a `-s` test dependency; null/no-tree => silent).
func _sfx(id: String) -> void:
	if _audio == null and is_inside_tree():
		_audio = get_node_or_null("/root/AudioManager")
	if _audio != null:
		_audio.call("play_sfx", id)


## The pause key from Settings (default KEY_P); node-path for `-s` compatibility.
func _pause_key() -> int:
	var s: Node = get_node_or_null("/root/Settings") if is_inside_tree() else null
	if s == null:
		return KEY_P
	var kb = s.get("keybinds")
	if kb is Dictionary and kb.has("pause"):
		return int(kb["pause"])
	return KEY_P


func update(now: float) -> void:
	if snake == null or floor == null:
		return

	if input_queue.consume_phase():
		snake.activate_phase(snap, now)
	if input_queue.consume_slip():
		snake.activate_slip(snap, now)

	# Pull exactly one queued direction, no-reverse-validated against the current heading.
	# At floor launch we step with it on this same tick so the body realigns right away.
	var candidate: int = input_queue.consume_next(snake.heading)
	if not snake.started:
		if candidate < 0:
			return  # wait for the first steer
		snake.heading = candidate
		snake.started = true

	var prev_heading: int = snake.heading
	var res: StepResult = snake.step(floor.grid, floor.obstacles, snap, now, tick_dt(), candidate)
	if snake.heading != prev_heading:
		_sfx("move")

	if res.ate_essence:
		essence_collected += 1
		add_score(Config.SCORE_PER_ESSENCE)
		_sfx("eat_essence")
		# Tri-Directional Fork: eating one cluster member dissolves its siblings (Phase 3).
		_dissolve_cluster(floor, snake.head())
		# Open the portal once enough essence is collected.
		if not portal_active and essence_collected >= floor.essence_needed:
			FloorGenerator.spawn_portal(floor.grid, snake.head())
			portal_active = true

	# Spore: a permanent multiplicative slow for the run (a buff). Routed through
	# UpgradeSystem so it stays the sole GameSnapshot writer.
	if res.ate_spore:
		upgrades.apply_spore(snap)
		_sfx("eat_spore")

	# Chamber Core: bonus score, then the 3-card mutation draft. (A core pick does NOT
	# advance the floor — after the pick the snake re-enters the launch state here.)
	if res.ate_core:
		add_score(Config.SCORE_PER_CORE)
		_sfx("eat_core")
		open_upgrade_select()
		return

	if res.reached_portal:
		_sfx("portal")
		on_floor_cleared()
		return

	if res.died >= 0:
		if not debug_god_mode:
			on_death(res.died, now)
			return
		# Dev god-mode: swallow the death and keep ticking (steering clears wall/self bumps).

	# Apex Predator: biting the tail resets the score multiplier (the snake survives).
	if res.apex_eaten > 0:
		upgrades.reset_multiplier(snap)
		_sfx("apex")
	# Ouroboros Loop: bank the vaporized-hazard bonus and drop the enclosed obstacles.
	if res.looped_hazards > 0:
		add_score(res.looped_hazards * Config.SCORE_PER_LOOPED)
		_sfx("vaporize")
		var kill: Dictionary = {}
		for k in res.loop_inside_keys:
			kill[k] = true
		var kept: Array[MovingObstacle] = []
		for o in floor.obstacles:
			if not kill.has(o.hex):
				kept.append(o)
		floor.obstacles = kept
	# Chitinous Shell soaks + shatters; Hydra severs the front half.
	if res.wall_soaked:
		_sfx("wall_impact")
	if res.wall_broken:
		_sfx("wall_break")
	if res.hydra_split:
		_sfx("hydra")
	# Slime DoT: throttled so lingering on a pool doesn't machine-gun the sound.
	if res.on_slime and now - last_slime_sfx_at >= SLIME_SFX_GAP_MS:
		last_slime_sfx_at = now
		_sfx("slime")

	# Obstacles roam (they avoid the snake, so no post-move head kill). Acidic Trail
	# dissolves any that sit on or cross the snake's trailing acid hexes.
	var obstacle_count_before: int = floor.obstacles.size()
	var snake_cells: Dictionary = {}
	for s in snake.segments:
		snake_cells[s] = true
	Hazards.step_obstacles(floor.obstacles, floor.grid, snake_cells, snake.acidic_hexes)
	if floor.obstacles.size() < obstacle_count_before:
		_sfx("dissolve")


# ---- transitions ----

func add_score(base_val: int) -> void:
	score += int(round(base_val * snap.score_mult * diff_score_mult))


func start_run() -> void:
	depth = 1
	score = 0
	# Difficulty: read the chosen preset from saved settings (frozen for the run).
	# Settings is fetched by node path (see _sfx) for `-s` test compatibility.
	var settings_node: Node = get_node_or_null("/root/Settings") if is_inside_tree() else null
	var diff_key: String = settings_node.get("difficulty") if settings_node != null else "normal"
	var diff: Dictionary = Config.DIFFICULTIES[diff_key]
	diff_speed_mult = diff.speed_mult
	diff_score_mult = diff.score_mult
	run_difficulty_label = diff.label  # frozen for the death/end-run summary
	snap.reset()
	upgrades = UpgradeSystem.new()  # fresh draft pool + empty build
	choices = []
	floor_advance_pending = false
	pick_index = -1
	death_started_at = 0.0
	run_summary = null
	respawn_flash_at = 0.0
	paused = false
	accumulator = 0.0
	begin_floor()
	state = GameState.PLAYING


func begin_floor() -> void:
	if depth > 1:
		_sfx("next_level")
	floor = FloorGenerator.generate(depth, snap)
	var heading: int = 2  # SE — matches the TS launch heading
	if snake != null:
		snake.reposition(floor.spawn, heading)
	else:
		snake = SnakeController.new(floor.spawn, heading, snap)
	_clear_body_cells(floor.grid, snake.segments)
	essence_collected = 0
	portal_active = false
	input_queue.reset_floor()
	accumulator = 0.0


func _clear_body_cells(grid: GridManager, segs: Array[Vector2i]) -> void:
	# Only walls could block the spawn; the generator keeps others away. Defensive.
	for s in segs:
		if grid.occupant_of(s) == Occupant.WALL:
			grid.clear(s)


## Portal reached: bank the clear bonus, descend, and open the mutation draft. The
## next floor is generated AFTER the pick (floor generation reads the updated snapshot,
## e.g. Nutrient Storage's essenceReduction), so begin_floor() is deferred.
func on_floor_cleared() -> void:
	add_score(Config.SCORE_PER_DEPTH_CLEARED)
	depth += 1
	floor_advance_pending = true
	open_upgrade_select()


## Tri-Directional Fork: clear the siblings of a just-eaten cluster member (1 cluster
## counts as 1 toward the portal, so the other two members vanish). No-op when the
## eaten hex isn't a cluster member (the common, non-Fork case).
func _dissolve_cluster(fl: Floor, head_hex: Vector2i) -> void:
	if not fl.clusters.has(head_hex):
		return
	var siblings: Array = fl.clusters[head_hex]
	for s in siblings:
		var sv: Vector2i = s
		if sv != head_hex and fl.grid.occupant_of(sv) == Occupant.ESSENCE:
			fl.grid.clear(sv)


# ---- upgrade draft (Phase 3) ----

## Open the 3-card mutation draft (on floor-clear and on chamber-core eat).
func open_upgrade_select() -> void:
	choices = upgrades.roll_three()
	pick_index = -1
	if choices.is_empty():
		# Everything is maxed (extreme late game): skip the screen and resume.
		_resume_after_pick()
		return
	state = GameState.UPGRADE_SELECT


## Begin the pick animation for `index`. The upgrade applies once it elapses
## (finalize_pick); repeated calls while animating are ignored.
func request_pick(index: int) -> void:
	if state != GameState.UPGRADE_SELECT or pick_index >= 0:
		return
	if index < 0 or index >= choices.size():
		return
	pick_index = index
	pick_started_at = float(Time.get_ticks_msec())


## Apply the animated pick once its timer is up. Called from _process each frame.
func finalize_pick() -> void:
	if pick_index < 0:
		return
	if float(Time.get_ticks_msec()) - pick_started_at < PICK_ANIM_MS:
		return
	var idx: int = pick_index
	pick_index = -1
	pick_upgrade(idx)


## Apply the chosen card, then resume play (next floor for a clear pick, re-launch
## on this floor for a core pick).
func pick_upgrade(index: int) -> void:
	if index < 0 or index >= choices.size():
		_resume_after_pick()
		return
	var def: MutationDef = choices[index]
	upgrades.apply(def.id, snap)
	_sfx("upgrade")
	if snake != null:
		snake.on_upgrades_changed(snap)
	choices = []
	input_queue.clear_queue()  # discard directions mashed during the card screen
	_resume_after_pick()


## Pick animation progress 0..1 (0 = none resolving). Drives the card glow/fade.
func pick_frac() -> float:
	if pick_index < 0:
		return 0.0
	return clampf((float(Time.get_ticks_msec()) - pick_started_at) / PICK_ANIM_MS, 0.0, 1.0)


## Resume play after a pick (or when the draft was empty). A floor-clear pick generates
## the next floor with the updated snapshot; a core pick halts for a fresh launch here.
func _resume_after_pick() -> void:
	if floor_advance_pending:
		floor_advance_pending = false
		begin_floor()  # reposition() resets the snake to launch (started=false)
	elif snake != null:
		snake.halt_for_launch()
	state = GameState.PLAYING


func on_death(reason: int, now: float) -> void:
	# `lives` counts the life you're currently on, so 1 = last life. A death with more
	# than your last life revives you on the current floor (essence progress kept);
	# a death on your last life ends the run.
	if snap.lives > 1:
		snap.lives -= 1
		_sfx("respawn")
		respawn(now)
		return
	_sfx("death")
	run_summary = _build_run_summary(false, reason)
	death_started_at = now
	state = GameState.DEAD


## End the run voluntarily (pause -> END RUN): show the summary framed as a voluntary
## end ("RUN ENDED"), reusing the death cinematic + screen.
func end_run() -> void:
	paused = false
	run_summary = _build_run_summary(true, -1)
	death_started_at = float(Time.get_ticks_msec())
	state = GameState.DEAD


## Return to the title menu (from the death / end-run screen). Matches the TS
## death-ENTER -> State.Menu flow: the player goes back to the menu and starts a fresh
## run from there.
func go_to_menu() -> void:
	state = GameState.MENU
	paused = false
	accumulator = 0.0
	run_summary = null
	if menu != null:
		menu.call("reset")


## Build the run summary shown on the death / end-run screen.
func _build_run_summary(ended_flag: bool, reason: int) -> RunSummary:
	var s := RunSummary.new()
	s.ended = ended_flag
	s.difficulty = run_difficulty_label
	s.depth = depth
	s.score = score
	s.length = snake.segments.size() if snake != null else 0
	s.mutations = upgrades.build_summary()
	s.reason = reason
	return s


func respawn(now: float) -> void:
	if floor == null or snake == null:
		return
	snake.reposition(floor.spawn, 2)  # SE heading, same as floor launch
	# Snap obstacle prev->hex so a mid-glide obstacle honors the "stationary => prev==current"
	# contract while the snake waits for its first post-death steer.
	for o in floor.obstacles:
		o.prev_hex = o.hex
	snake.health = snap.max_health  # death (often slime) tapped this; restore
	input_queue.reset_floor()  # drop any direction mashed into the death
	accumulator = 0.0  # don't burst-catch-up across the respawn
	respawn_flash_at = now
	# state stays Playing; snake.started is false so it waits for a fresh steer.


## Fading red flash after a life-loss revive (0..1 intensity, 0 = none). Drives the overlay.
func respawn_flash_frac() -> float:
	if respawn_flash_at == 0.0:
		return 0.0
	var elapsed: float = float(Time.get_ticks_msec()) - respawn_flash_at
	if elapsed < 0.0 or elapsed >= RESPAWN_FLASH_MS:
		return 0.0
	return 1.0 - elapsed / RESPAWN_FLASH_MS


## Death-cinematic zoom progress 0..1 (eased over DEATH_ZOOM_MS). Drives the
## world zoom-into-the-death-point; 0 outside the DEAD state.
func death_zoom_frac() -> float:
	if state != GameState.DEAD or death_started_at == 0.0:
		return 0.0
	return clampf((float(Time.get_ticks_msec()) - death_started_at) / DEATH_ZOOM_MS, 0.0, 1.0)


## Death-summary reveal progress 0..1 (over DEATH_REVEAL_MS). Drives the staggered
## title/stats/build/prompt reveal on the death screen; 0 outside DEAD.
func death_reveal_frac() -> float:
	if state != GameState.DEAD or death_started_at == 0.0:
		return 0.0
	return clampf((float(Time.get_ticks_msec()) - death_started_at) / DEATH_REVEAL_MS, 0.0, 1.0)


# ---- meta input (direction keys come through InputRouter -> input_queue) ----

func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key == null or not key.pressed or key.echo:
		return
	# Dev cheat: `]` fast-forwards the run — in play it instantly clears the floor
	# (-> draft -> next depth); on the draft screen it auto-picks the first card so you
	# can blow through floors. Dev-only (the branch is dead in exported builds).
	if OS.is_debug_build() and key.physical_keycode == KEY_BRACKETRIGHT:
		match state:
			GameState.PLAYING:
				on_floor_cleared()
			GameState.UPGRADE_SELECT:
				pick_upgrade(0)
			_:
				return
		get_viewport().set_input_as_handled()
		return
	# Dev cheat: Backslash toggles invulnerable + 0.25x slow-mo during play (god-mode
	# for inspecting collisions). Dev-only (dead in exported builds).
	if OS.is_debug_build() and state == GameState.PLAYING and key.physical_keycode == KEY_BACKSLASH:
		debug_god_mode = not debug_god_mode
		accumulator = 0.0  # drop pending ms so the rate change doesn't burst-catch-up
		if debug_god_mode and snake != null:
			snake.health = snap.max_health
		get_viewport().set_input_as_handled()
		return
	match state:
		GameState.MENU:
			if menu != null:
				menu.call("on_key", key)
				get_viewport().set_input_as_handled()
			elif key.physical_keycode == KEY_ENTER:
				start_run()
				get_viewport().set_input_as_handled()
		GameState.DEAD:
			if key.physical_keycode == KEY_ENTER:
				go_to_menu()
				get_viewport().set_input_as_handled()
		GameState.UPGRADE_SELECT:
			if key.physical_keycode == KEY_1:
				request_pick(0)
				get_viewport().set_input_as_handled()
			elif key.physical_keycode == KEY_2:
				request_pick(1)
				get_viewport().set_input_as_handled()
			elif key.physical_keycode == KEY_3:
				request_pick(2)
				get_viewport().set_input_as_handled()
		GameState.PLAYING:
			if key.physical_keycode == _pause_key():
				paused = not paused
				accumulator = 0.0
				get_viewport().set_input_as_handled()
			elif paused and key.physical_keycode == KEY_BACKSPACE:
				end_run()  # keyboard END RUN (the button is also mouse-clickable)
				get_viewport().set_input_as_handled()
