extends SceneTree
## Parity gate (Phase 6): systematically confirms the port honors the CLAUDE.md
## invariants — collision/death reasons, that every card-resolved survival does NOT
## kill (and by extension does not touch lives), lives counting, the no-reverse input
## rule, obstacle avoidance, and the Acidic Trail wake. Drives snake_controller +
## GameManager directly (pure simulation; GameManager uses node-path autoload access
## so it stays -s-safe).
## Run: godot --headless -s res://core/parity_test.gd

class _S:
	extends RefCounted
	var grid: GridManager
	var snake: SnakeController
	var snap: GameSnapshot


func _init() -> void:
	var fails: Array[int] = [0]
	# (A) Death reasons — each true death maps to its reason, no false deaths.
	var a := _fresh()
	_a_death(a, Hex.neighbor(a.snake.head(), 2), DeathReason.WALL, Occupant.WALL, "wall", fails)
	# Obstacle death.
	var a2 := _fresh()
	var ob := MovingObstacle.new()
	ob.hex = Hex.neighbor(a2.snake.head(), 2)
	ob.prev_hex = ob.hex
	ob.move_counter = Config.OBSTACLE_MOVE_EVERY
	var r2 := a2.snake.step(a2.grid, [ob], a2.snap, 0.0, 0.1, 2)
	_check(r2.died == DeathReason.OBSTACLE, "obstacle death (got %d)" % r2.died, fails)
	# Self death: a curl where the head's forward cell is a non-tail body segment.
	var a3 := _fresh()
	a3.snake.segments = [Vector2i(0, 0), Vector2i(-1, 0), Vector2i(-1, 1), Vector2i(0, 1), Vector2i(1, 1)]
	a3.snake.heading = 3  # S
	a3.snake.prev_segments = a3.snake.segments.duplicate()
	var r3 := a3.snake.step(a3.grid, [], a3.snap, 0.0, 0.1, 3)
	_check(r3.died == DeathReason.SELF, "self death (got %d)" % r3.died, fails)
	# Slime death: step onto slime, health 1 -> 0.
	var a4 := _fresh()
	a4.snap.max_health = 1
	a4.snake.health = 1
	a4.grid.set_occupant(Hex.neighbor(a4.snake.head(), 2), Occupant.SLIME)
	var r4 := a4.snake.step(a4.grid, [], a4.snap, 0.0, 0.1, 2)
	_check(r4.died == DeathReason.SLIME, "slime death (got %d)" % r4.died, fails)

	# (B) Card-resolved survivals never kill.
	# Chitinous Shell soaks a placed wall (no death, charge spent, wall shattered).
	var b := _fresh()
	b.snap.chitinous_enabled = true
	b.snap.wall_charges = 2
	var wall_hex := Hex.neighbor(b.snake.head(), 2)
	b.grid.set_occupant(wall_hex, Occupant.WALL)
	var rb := b.snake.step(b.grid, [], b.snap, 0.0, 0.1, 2)
	_check(rb.died == -1 and rb.wall_soaked, "chitinous: soaks the wall + survives", fails)
	_check(rb.wall_broken and b.grid.occupant_of(wall_hex) == Occupant.EMPTY, "chitinous: shatters the wall", fails)
	_check(b.snake.wall_charges_remaining(b.snap) == 1, "chitinous: spent one charge", fails)
	# Phase Shifter passes through own body.
	var bp := _fresh()
	bp.snap.phase_enabled = true
	bp.snake.segments = [Vector2i(0, 0), Vector2i(-1, 0), Vector2i(-1, 1), Vector2i(0, 1), Vector2i(1, 1)]
	bp.snake.heading = 3
	bp.snake.prev_segments = bp.snake.segments.duplicate()
	bp.snake.activate_phase(bp.snap, 0.0)
	var rbp := bp.snake.step(bp.grid, [], bp.snap, 100.0, 0.1, 3)  # now=100 within the 4s window
	_check(rbp.died == -1, "phase: passes through self", fails)
	# Apex Predator eats the bitten tail + survives + shortens.
	var ba := _fresh()
	ba.snap.apex_enabled = true
	ba.snake.segments = [Vector2i(0, 0), Vector2i(-1, 0), Vector2i(-1, 1), Vector2i(0, 1), Vector2i(1, 1)]
	ba.snake.heading = 3
	ba.snake.prev_segments = ba.snake.segments.duplicate()
	var len_before := ba.snake.segments.size()
	var rba := ba.snake.step(ba.grid, [], ba.snap, 0.0, 0.1, 3)
	_check(rba.died == -1 and rba.apex_eaten > 0, "apex: eats tail + survives", fails)
	_check(ba.snake.segments.size() < len_before, "apex: snake shortened", fails)
	# Hydra's Venom: obstacle hit severs + survives (one-time); a 2nd hit then kills.
	var bh := _fresh()
	bh.snap.hydra_enabled = true
	bh.snap.hydra_used = false
	var obh := MovingObstacle.new()
	obh.hex = Hex.neighbor(bh.snake.head(), 2)
	obh.prev_hex = obh.hex
	obh.move_counter = Config.OBSTACLE_MOVE_EVERY
	var rbh := bh.snake.step(bh.grid, [obh], bh.snap, 0.0, 0.1, 2)
	_check(rbh.died == -1 and rbh.hydra_split, "hydra: splits + survives obstacle", fails)
	_check(bh.snap.hydra_used == true, "hydra: one-time use consumed", fails)
	# 2nd hit with hydra_used already true -> dies (Hydra is one-time per run).
	var bh2 := _fresh_with(bh.snap)  # fresh snake, SAME snap (hydra_used=true)
	var obh2 := MovingObstacle.new()
	obh2.hex = Hex.neighbor(bh2.snake.head(), 2)
	obh2.prev_hex = obh2.hex
	obh2.move_counter = Config.OBSTACLE_MOVE_EVERY
	var rbh2 := bh2.snake.step(bh2.grid, [obh2], bh2.snap, 0.0, 0.1, 2)
	_check(rbh2.died == DeathReason.OBSTACLE, "hydra: 2nd hit kills (one-time)", fails)

	# (C) Lives counting: 3 lives = 3 deaths, last one ends the run.
	var gm := GameManager.new()
	gm.start_run()
	var lives0 := gm.snap.lives
	gm.on_death(DeathReason.WALL, 0.0)
	_check(gm.snap.lives == lives0 - 1 and gm.state == GameState.PLAYING, "lives: 1st death revives (3->2)", fails)
	gm.on_death(DeathReason.SELF, 0.0)
	_check(gm.snap.lives == lives0 - 2 and gm.state == GameState.PLAYING, "lives: 2nd death revives (2->1)", fails)
	gm.on_death(DeathReason.SLIME, 0.0)
	_check(gm.state == GameState.DEAD, "lives: 3rd death ends the run", fails)

	# Run summary built on the final death (ended=false, reason set).
	_check(gm.run_summary != null and not gm.run_summary.ended, "death summary: ended=false", fails)
	_check(gm.run_summary != null and gm.run_summary.reason == DeathReason.SLIME, "death summary: reason=SLIME", fails)
	# end_run (voluntary, e.g. pause -> END RUN) -> ended=true, reason=-1.
	var ge := GameManager.new()
	ge.start_run()
	ge.end_run()
	_check(ge.state == GameState.DEAD, "end_run: state -> DEAD", fails)
	_check(ge.run_summary != null and ge.run_summary.ended, "end_run: summary.ended=true", fails)
	_check(ge.run_summary != null and ge.run_summary.reason == -1, "end_run: reason=-1", fails)

	# (D) Input queue: no-reverse, FIFO cap 3, consume-one-per-call.
	var q := InputQueue.new()
	q.enqueue(0)  # N
	_check(q.consume_next(3) == -1, "input: 180 reverse (N vs heading S) dropped", fails)
	q.enqueue(2)  # SE
	_check(q.consume_next(0) == 2, "input: legal direction returned", fails)  # heading N, opposite S(3); 2 ok
	q.reset_floor()
	q.enqueue(0); q.enqueue(1); q.enqueue(2); q.enqueue(3)  # 4th dropped by cap 3
	_check(q.consume_next(4) == 0, "input: FIFO order (first in first out)", fails)  # heading SW(4), opposite NE(1); 0 ok

	# (E) Moving obstacles never move onto a snake-occupied cell.
	var e := _fresh()
	var snake_cells: Dictionary = {}
	for seg in e.snake.segments:
		snake_cells[seg] = true
	var e_obs: Array[MovingObstacle] = []
	for c in e.grid.empty_cells():
		if e_obs.size() >= 6:
			break
		if Hex.distance(c, e.snake.head()) > 3 and not snake_cells.has(c):
			var eo := MovingObstacle.new()
			eo.hex = c
			eo.prev_hex = c
			eo.move_counter = 0
			e_obs.append(eo)
	for trial in range(30):
		Hazards.step_obstacles(e_obs, e.grid, snake_cells, {})
		for eo in e_obs:
			_check(not snake_cells.has(eo.hex), "obstacle entered a snake cell (trial %d)" % trial, fails)

	# (F) Acidic Trail: a step drips a wake pool; an obstacle on an acid hex dissolves.
	var f := _fresh()
	f.snap.acidic_enabled = true
	f.snap.acidic_trail_ticks = 8
	f.snake.step(f.grid, [], f.snap, 0.0, 0.1, 2)  # advance -> drip
	_check(f.snake.acidic_hexes.size() > 0, "acid: wake dripped after a step", fails)
	var acid_hex: Vector2i = f.snake.acidic_hexes.keys()[0]
	var fo := MovingObstacle.new()
	fo.hex = acid_hex
	fo.prev_hex = acid_hex
	fo.move_counter = Config.OBSTACLE_MOVE_EVERY
	var f_obs: Array[MovingObstacle] = [fo]
	Hazards.step_obstacles(f_obs, f.grid, {}, f.snake.acidic_hexes)
	_check(f_obs.is_empty(), "acid: obstacle on an acid hex dissolved", fails)

	if fails[0] == 0:
		print("PARITY TESTS: PASS")
	else:
		printerr("PARITY TESTS: %d FAILURE(S)" % fails[0])
	quit(0 if fails[0] == 0 else 1)


# ---- helpers ----

func _fresh() -> _S:
	var o := _S.new()
	o.snap = GameSnapshot.new()
	o.grid = GridManager.new(Config.RADIUS)
	o.snake = SnakeController.new(Vector2i.ZERO, 2, o.snap)  # heading SE, body behind
	return o


func _fresh_with(snap: GameSnapshot) -> _S:
	var o := _S.new()
	o.snap = snap
	o.grid = GridManager.new(Config.RADIUS)
	o.snake = SnakeController.new(Vector2i.ZERO, 2, snap)
	return o


## Drive the snake into `hex` (holding `occ`) and assert it dies of `want_reason`.
func _a_death(s: _S, hex: Vector2i, want_reason: int, occ: int, label: String, fails: Array[int]) -> void:
	s.grid.set_occupant(hex, occ)
	var r := s.snake.step(s.grid, [], s.snap, 0.0, 0.1, 2)
	_check(r.died == want_reason, "%s death (got %d)" % [label, r.died], fails)


func _check(cond: bool, msg: String, fails: Array[int]) -> void:
	if not cond:
		printerr("  FAIL: " + msg)
		fails[0] += 1
