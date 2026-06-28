class_name FloorGenerator
extends RefCounted
## Procedural floor generation with a BFS connectivity guarantee: every non-wall cell
## is reachable from spawn (the floor is always solvable). Difficulty scales with depth
## — denser walls, more slime and roaming obstacles, faster ticks (tick rate lives in
## GameManager.tick_dt). The snapshot drives card-gated generation: Nutrient Storage
## lowers essenceNeeded; Tri-Directional Fork lays essence as 3-adjacent clusters.
## Port of src/floor/FloorGenerator.ts.
##
## NOTE: every function here is static and reads ONLY Config.* CONSTANTS (never
## autoload instance state) — autoload singletons aren't accessible from static funcs.

# Sentinel "no hex" (Vector2i can't be null). Max-int coords never collide with a cell.
const _NONE: Vector2i = Vector2i(2147483647, 2147483647)
# Keep walls/hazards this many hexes from spawn so the launch body has room.
const SAFE_RADIUS: int = 3


static func generate(depth: int, snap: GameSnapshot) -> Floor:
	var fl := Floor.new()
	var grid := GridManager.new(Config.RADIUS)
	fl.grid = grid
	fl.spawn = Vector2i.ZERO
	grid.clear(fl.spawn)

	# (1) Static walls — reject any placement that would disconnect the floor.
	var wall_density: float = minf(
		Config.WALL_DENSITY_MAX,
		Config.WALL_DENSITY_BASE + Config.WALL_DENSITY_PER_DEPTH * float(depth - 1)
	)
	var wall_target: int = int(wall_density * float(grid.cells.size()))
	var walls: int = 0
	var attempts: int = 0
	while walls < wall_target and attempts < wall_target * 10:
		attempts += 1
		var c: Vector2i = _rand_cell(grid.cells)
		if Hex.distance(c, fl.spawn) <= SAFE_RADIUS:
			continue
		if grid.occupant_of(c) != Occupant.EMPTY:
			continue
		grid.set_occupant(c, Occupant.WALL)
		if _is_connected(grid, fl.spawn):
			walls += 1
		else:
			grid.clear(c)

	# (2) Toxic slime.
	var slime_count: int = int(Config.SLIME_BASE + Config.SLIME_PER_DEPTH * float(depth - 1))
	_place_random(grid, fl.spawn, slime_count, Occupant.SLIME)

	# (3) Essence pellets. Nutrient Storage lowers the requirement (min 1);
	#     Tri-Directional Fork lays them as 3-adjacent clusters (inert until Phase 3).
	fl.essence_needed = maxi(
		1,
		Config.ESSENCE_BASE + Config.ESSENCE_PER_DEPTH * (depth - 1) - snap.essence_reduction
	)
	if snap.fork_enabled:
		_place_clusters(grid, fl.spawn, fl.essence_needed, fl.clusters)
	else:
		_place_spread(grid, fl.spawn, fl.essence_needed, Occupant.ESSENCE)

	# (4) Chamber Core (rare) at the farthest reachable cell from spawn — but only on a
	#     cell with enough wall/slime-free neighbors that the snake can leave after eating
	#     it (no dead-end traps). Phase 2: generated; eating one scores + re-launches until
	#     Phase 3 wires the 3-card upgrade draft onto it.
	if randf() < Config.CHAMBER_CORE_CHANCE:
		var far: Vector2i = _farthest_empty(grid, fl.spawn, Config.CHAMBER_CORE_MIN_ESCAPE_HEXES, 2)
		if far != _NONE:
			grid.set_occupant(far, Occupant.CHAMBER_CORE)

	# (4b) Spore — a rare, beneficial slow-pickup from SPORE_START_DEPTH. Not required to
	#      advance; collecting one permanently slows the snake (a buff, via apply_spore).
	if depth >= Config.SPORE_START_DEPTH and randf() < Config.SPORE_CHANCE:
		_place_random(grid, fl.spawn, 1, Occupant.SPORE, 2)

	# (5) Moving obstacles (not grid occupants — tracked on the Floor). They avoid the
	#     snake + each other while roaming (hazards.gd), so they never insta-kill by
	#     parking on the head; the danger is steering INTO one.
	var mover_count: int = int(Config.OBSTACLE_BASE + Config.OBSTACLE_PER_DEPTH * float(depth - 1))
	var guard: int = 0
	while fl.obstacles.size() < mover_count and guard < mover_count * 25 + 50:
		guard += 1
		var c: Vector2i = _rand_cell(grid.cells)
		if Hex.distance(c, fl.spawn) <= SAFE_RADIUS + 1:
			continue
		if grid.occupant_of(c) != Occupant.EMPTY:
			continue
		if _obstacle_at(fl.obstacles, c):
			continue
		var o := MovingObstacle.new()
		o.hex = c
		o.prev_hex = c
		o.move_counter = Config.OBSTACLE_MOVE_EVERY
		fl.obstacles.append(o)

	return fl


## Open the portal at the passable empty cell farthest from `from` (the snake head).
## Returns the portal hex (or _NONE if the arena had no empty cell — impossible in
## practice since spawn is always empty).
static func spawn_portal(grid: GridManager, from: Vector2i) -> Vector2i:
	var target: Vector2i = _farthest_empty(grid, from, 0)
	if target == _NONE:
		var empties: Array[Vector2i] = grid.empty_cells()
		if empties.is_empty():
			return _NONE
		target = empties[0]
	grid.set_occupant(target, Occupant.PORTAL)
	return target


# ---------------- generation helpers ----------------

static func _rand_cell(cells: Array[Vector2i]) -> Vector2i:
	return cells[randi() % cells.size()]


## BFS flood from `start` over passable cells. Dictionary[Vector2i] -> true.
static func _reachable_set(grid: GridManager, start: Vector2i) -> Dictionary:
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


## True iff every non-wall cell is reachable from `start` (the solvability guarantee).
static func _is_connected(grid: GridManager, start: Vector2i) -> bool:
	var reach: Dictionary = _reachable_set(grid, start)
	var passable: int = grid.cells.size() - grid.count(Occupant.WALL)
	return reach.size() == passable


## BFS distance from `start` to every reachable passable cell. Dictionary[Vector2i] -> int.
static func _bfs_distances(grid: GridManager, start: Vector2i) -> Dictionary:
	var dist: Dictionary = {start: 0}
	var queue: Array[Vector2i] = [start]
	while queue.size() > 0:
		var cur: Vector2i = queue.pop_front()
		var d: int = int(dist[cur])
		for n in Hex.neighbors(cur):
			if dist.has(n):
				continue
			if not grid.is_passable(n):
				continue
			dist[n] = d + 1
			queue.append(n)
	return dist


## Count in-bounds neighbors of `c` that are passable (not wall, not slime).
static func _free_neighbor_count(grid: GridManager, c: Vector2i) -> int:
	var n: int = 0
	for nb in Hex.neighbors(c):
		if not grid.in_bounds(nb):
			continue
		var occ: int = grid.occupant_of(nb)
		if occ != Occupant.WALL and occ != Occupant.SLIME:
			n += 1
	return n


## True iff there are >=2 vertex-disjoint paths from `c` to `spawn` — i.e. `c` is NOT on a
## dead-end branch: find one spawn->c path, block its interior, and a second path still
## reaches `c`. Guarantees a pickup can always be left via a route the snake's incoming
## body isn't occupying (the "2 unique paths to the middle" rule).
static func _has_two_routes(grid: GridManager, spawn: Vector2i, c: Vector2i) -> bool:
	if c == spawn:
		return false
	# 1) BFS from spawn to c with parent tracking.
	var parent: Dictionary = {spawn: spawn}
	var queue: Array[Vector2i] = [spawn]
	var found: bool = false
	while queue.size() > 0 and not found:
		var cur: Vector2i = queue.pop_front()
		if cur == c:
			found = true
			break
		for n in Hex.neighbors(cur):
			if parent.has(n) or not grid.is_passable(n):
				continue
			parent[n] = cur
			queue.append(n)
	if not found:
		return false
	# 2) Block the first path's interior (cells strictly between spawn and c).
	var blocked: Dictionary = {}
	var node: Vector2i = c
	while node != spawn:
		node = parent[node]
		if node != spawn:
			blocked[node] = true
	# 3) BFS again; c still reachable despite the first interior blocked -> a 2nd
	# vertex-disjoint path exists.
	var seen: Dictionary = {spawn: true}
	var q2: Array[Vector2i] = [spawn]
	while q2.size() > 0:
		var cur: Vector2i = q2.pop_front()
		if cur == c:
			return true
		for n in Hex.neighbors(cur):
			if seen.has(n) or blocked.has(n) or not grid.is_passable(n):
				continue
			seen[n] = true
			q2.append(n)
	return false


## Farthest empty cell from `from` (BFS). If `min_free_neighbors > 0`, the cell must
## also have at least that many wall/slime-free neighbors. _NONE if no cell qualifies.
static func _farthest_empty(grid: GridManager, from: Vector2i, min_free_neighbors: int = 0, min_routes: int = 0) -> Vector2i:
	var dist: Dictionary = _bfs_distances(grid, from)
	var best: Vector2i = _NONE
	var best_d: int = -1
	for c in grid.cells:
		if grid.occupant_of(c) != Occupant.EMPTY:
			continue
		if min_free_neighbors > 0 and _free_neighbor_count(grid, c) < min_free_neighbors:
			continue
		if min_routes > 0 and not _has_two_routes(grid, from, c):
			continue
		var d: int = int(dist[c]) if dist.has(c) else -1
		if d > best_d:
			best_d = d
			best = c
	return best


static func _place_random(grid: GridManager, spawn: Vector2i, count: int, occ: int, min_routes: int = 0) -> void:
	var placed: int = 0
	var guard: int = 0
	while placed < count and guard < count * 30 + 50:
		guard += 1
		var c: Vector2i = _rand_cell(grid.cells)
		if Hex.distance(c, spawn) <= SAFE_RADIUS:
			continue
		if grid.occupant_of(c) != Occupant.EMPTY:
			continue
		if min_routes > 0 and not _has_two_routes(grid, spawn, c):
			continue
		grid.set_occupant(c, occ)
		placed += 1


## Scatter `count` occupants so no two sit within 2 hexes of each other.
static func _place_spread(grid: GridManager, spawn: Vector2i, count: int, occ: int) -> void:
	var placed: Array[Vector2i] = []
	var guard: int = 0
	while placed.size() < count and guard < count * 80 + 100:
		guard += 1
		var c: Vector2i = _rand_cell(grid.cells)
		if Hex.distance(c, spawn) <= SAFE_RADIUS:
			continue
		if grid.occupant_of(c) != Occupant.EMPTY:
			continue
		# Require >=2 free (non-wall, non-slime) neighbors so essence isn't a dead-end
		# death-trap, AND >=2 vertex-disjoint routes to spawn so the snake can always
		# leave via a path its body isn't occupying.
		if _free_neighbor_count(grid, c) < 2:
			continue
		if not _has_two_routes(grid, spawn, c):
			continue
		var too_close: bool = false
		for p in placed:
			if Hex.distance(p, c) < 2:
				too_close = true
				break
		if too_close:
			continue
		grid.set_occupant(c, occ)
		placed.append(c)


## Tri-Directional Fork: lay `count` essence clusters, each an anchor plus two adjacent
## empty hexes. Every member maps to the SAME sibling list in `clusters` so eating one
## member clears the rest (1 cluster = 1 toward the portal). Inert until a card sets
## snap.fork_enabled (Phase 3).
static func _place_clusters(grid: GridManager, spawn: Vector2i, count: int, clusters: Dictionary) -> void:
	var anchors: Array[Vector2i] = []
	var guard: int = 0
	while anchors.size() < count and guard < count * 80 + 100:
		guard += 1
		var anchor: Vector2i = _rand_cell(grid.cells)
		if Hex.distance(anchor, spawn) <= SAFE_RADIUS:
			continue
		if grid.occupant_of(anchor) != Occupant.EMPTY:
			continue
		var too_close: bool = false
		for p in anchors:
			if Hex.distance(p, anchor) < 3:
				too_close = true
				break
		if too_close:
			continue
		var adj: Array[Vector2i] = []
		for n in Hex.neighbors(anchor):
			if grid.in_bounds(n) and grid.occupant_of(n) == Occupant.EMPTY:
				adj.append(n)
		if adj.size() < 2:
			continue  # need a trio
		var members: Array[Vector2i] = [anchor, adj[0], adj[1]]
		for m in members:
			grid.set_occupant(m, Occupant.ESSENCE)
		# All members share one sibling list (a read from any member yields the whole trio).
		for m in members:
			clusters[m] = members
		anchors.append(anchor)


static func _obstacle_at(obstacles: Array[MovingObstacle], h: Vector2i) -> bool:
	for o in obstacles:
		if o.hex == h:
			return true
	return false
