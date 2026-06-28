class_name GridManager
extends RefCounted
## Owns the playfield: which hex holds what. The snake's own body is NOT tracked
## here (the SnakeController owns that) — only static/collectible occupants:
## walls, slime, essence, chamber cores, portal, spore. Port of src/grid/GridManager.ts.
##
## Storage is a Dictionary keyed by Vector2i (q, r) -> int (Occupant).

var radius: int = 0
var _occ: Dictionary = {}  # Vector2i -> int (Occupant)
var cells: Array[Vector2i] = []


func _init(radius: int = -1) -> void:
	if radius < 0:
		radius = Config.RADIUS
	self.radius = radius
	cells = Hex.hexes_in_radius(radius)
	for c in cells:
		_occ[c] = Occupant.EMPTY


func has(h: Vector2i) -> bool:
	return Hex.in_bounds(h, radius)


func in_bounds(h: Vector2i) -> bool:
	return Hex.in_bounds(h, radius)


func occupant_of(h: Vector2i) -> int:
	return _occ.get(h, Occupant.EMPTY)


func set_occupant(h: Vector2i, o: int) -> void:
	_occ[h] = o


func clear(h: Vector2i) -> void:
	_occ[h] = Occupant.EMPTY


func is_passable(h: Vector2i) -> bool:
	return in_bounds(h) and occupant_of(h) != Occupant.WALL


## All empty in-bounds cells.
func empty_cells() -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for c in cells:
		if occupant_of(c) == Occupant.EMPTY:
			out.append(c)
	return out


## Count of a given occupant type across the floor.
func count(o: int) -> int:
	var n: int = 0
	for v in _occ.values():
		if v == o:
			n += 1
	return n
