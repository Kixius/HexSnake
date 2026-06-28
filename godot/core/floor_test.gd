extends SceneTree
## Headless regression test for procedural floor generation (Phase 2). Verifies the
## guarantees the rest of the game relies on: the BFS connectivity invariant (every
## floor is solvable), the spawn clearance, the essence count, the obstacle spawn
## distance, and that spawn_portal places exactly one portal.
## Run: godot --headless -s res://core/floor_test.gd

func _init() -> void:
	var fails: Array[int] = [0]
	var fail := func(msg: String) -> void:
		printerr("  FAIL: " + msg)
		fails[0] += 1

	var snap := GameSnapshot.new()  # fresh run: no upgrades -> fork off, essence full.
	for depth in [1, 3, 5, 8]:
		for trial in range(8):
			var fl: Floor = FloorGenerator.generate(depth, snap)
			var tag: String = "depth %d trial %d" % [depth, trial]

			# (1) Connectivity: every non-wall cell is reachable from spawn.
			if not _is_connected(fl.grid, fl.spawn):
				fail.call("%s: floor not fully connected from spawn" % tag)

			# (2) Spawn is empty (the snake launches here; the generator clears it).
			if fl.grid.occupant_of(fl.spawn) != Occupant.EMPTY:
				fail.call("%s: spawn occupied (%d)" % [tag, fl.grid.occupant_of(fl.spawn)])

			# (3) Essence count matches the portal requirement (no Fork in Phase 2).
			var ess: int = fl.grid.count(Occupant.ESSENCE)
			if ess != fl.essence_needed:
				fail.call("%s: essence %d != needed %d" % [tag, ess, fl.essence_needed])

			# (4) No obstacle parked within safe+1 of spawn (gives the launch room).
			for o in fl.obstacles:
				var d: int = Hex.distance(o.hex, fl.spawn)
				if d <= 4:
					fail.call("%s: obstacle %d from spawn (need >4)" % [tag, d])

			# (5) Obstacles start stationary (prev == hex) so they don't stutter at launch.
			for o in fl.obstacles:
				if o.prev_hex != o.hex:
					fail.call("%s: obstacle launched mid-glide" % tag)

			# (6) spawn_portal adds exactly one portal onto an empty cell.
			var before: int = fl.grid.count(Occupant.PORTAL)
			FloorGenerator.spawn_portal(fl.grid, fl.spawn)
			var after: int = fl.grid.count(Occupant.PORTAL)
			if after != before + 1:
				fail.call("%s: spawn_portal did not add one portal (%d->%d)" % [tag, before, after])
			# Placing a portal must not break connectivity (it's passable, not a wall).
			if not _is_connected(fl.grid, fl.spawn):
				fail.call("%s: floor disconnected after portal placement" % tag)

			# (7) Pickups (essence / spore / chamber core) each have >=2 vertex-disjoint
			# routes to spawn — never on a dead-end branch the snake can't leave after
			# grabbing (its incoming body would block the only way out).
			for cc in fl.grid.cells:
				var occ7: int = fl.grid.occupant_of(cc)
				if occ7 != Occupant.ESSENCE and occ7 != Occupant.SPORE and occ7 != Occupant.CHAMBER_CORE:
					continue
				if not FloorGenerator._has_two_routes(fl.grid, fl.spawn, cc):
					fail.call("%s: pickup at %s lacks 2 vertex-disjoint routes to spawn" % tag)

	if fails[0] == 0:
		print("FLOOR TESTS: PASS")
	else:
		printerr("FLOOR TESTS: %d FAILURE(S)" % fails[0])
	quit(0 if fails[0] == 0 else 1)


# ---- BFS mirrors of the generator's connectivity check (independent re-implementation) ----

func _reachable_set(grid: GridManager, start: Vector2i) -> Dictionary:
	var seen: Dictionary = {start: true}
	var queue: Array[Vector2i] = [start]
	while queue.size() > 0:
		var cur: Vector2i = queue.pop_front()
		for n in Hex.neighbors(cur):
			if seen.has(n):
				continue
			if not grid.is_passable(n):
				continue
			seen[n] = true
			queue.append(n)
	return seen


func _is_connected(grid: GridManager, start: Vector2i) -> bool:
	var reach: Dictionary = _reachable_set(grid, start)
	var passable: int = grid.cells.size() - grid.count(Occupant.WALL)
	return reach.size() == passable
