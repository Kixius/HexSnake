class_name Hazards
extends RefCounted
## Roaming obstacle movement + acid dissolution. Port of src/floor/hazards.ts.
##
## Moving obstacles roam the floor one hex at a time. They AVOID the snake's occupied
## cells and each other, so they never insta-kill by parking on the head — the danger
## is the snake steering INTO one (handled in SnakeController step #2). Obstacles live
## on the Floor, not in GridManager occupancy.
##
## Acidic Trail: any obstacle sitting on, or moving onto, an acid hex is dissolved
## (spliced out of the array here, since GameManager passes the live floor.obstacles).
##
## snake_cells / acid_hexes are Dictionary[Vector2i] -> anything (membership sets);
## Vector2i hashes correctly as a Dictionary key, so no string keys are needed (unlike
## the TS, which used hexKey strings).

## Roam every obstacle one step; dissolve any touching acid. Mutates `obstacles` in
## place (the caller's floor.obstacles). Returns how many were dissolved (SFX hook).
static func step_obstacles(
		obstacles: Array[MovingObstacle],
		grid: GridManager,
		snake_cells: Dictionary,
		acid_hexes: Dictionary
) -> int:
	# Current obstacle positions (for mutual non-stacking).
	var occ: Dictionary = {}  # Vector2i -> true
	for o in obstacles:
		occ[o.hex] = true
	var dead: Array[int] = []
	var acid_active: bool = acid_hexes.size() > 0

	for i in range(obstacles.size()):
		var o: MovingObstacle = obstacles[i]

		# Dissolved by acid it is already standing on.
		if acid_active and acid_hexes.has(o.hex):
			dead.append(i)
			occ.erase(o.hex)
			continue

		o.move_counter -= 1
		if o.move_counter > 0:
			continue
		o.move_counter = Config.OBSTACLE_MOVE_EVERY

		# Candidate moves: passable, not under the snake, not under another obstacle.
		var opts: Array[Vector2i] = []
		for n in Hex.neighbors(o.hex):
			if not grid.is_passable(n):
				continue
			if snake_cells.has(n):
				continue
			if occ.has(n):
				continue
			opts.append(n)
		if opts.is_empty():
			continue
		var pick: Vector2i = opts[randi() % opts.size()]

		# Dissolved by acid it tries to cross into.
		if acid_active and acid_hexes.has(pick):
			dead.append(i)
			occ.erase(o.hex)
			continue

		occ.erase(o.hex)
		o.prev_hex = o.hex
		o.hex = pick
		occ[pick] = true

	# Sweep dissolved obstacles back-to-front so indices stay valid.
	dead.reverse()
	for i in dead:
		obstacles.remove_at(i)
	return dead.size()


static func obstacle_at(obstacles: Array[MovingObstacle], h: Vector2i) -> bool:
	for o in obstacles:
		if o.hex == h:
			return true
	return false
