## Pure flat-top axial hex math. No state, no drawing, no I/O.
## Ported 1:1 from src/grid/hex.ts (Red Blob Games flat-top axial system).
##
## A hex is a Vector2i where .x = q, .y = r (axial coords), with derived s = -q - r
## (cube constraint q + r + s = 0).
##
## Direction ordering is CLOCKWISE from North and doubles as the control index
## used everywhere (see input/input_router.gd for the QWE/ASD key map):
##
##   index  name  (dq, dr)   key
##     0    N     ( 0, -1)   W
##     1    NE    (+1, -1)   E
##     2    SE    (+1,  0)   D
##     3    S     ( 0, +1)   S
##     4    SW    (-1, +1)   A
##     5    NW    (-1,  0)   Q
##
## Opposite direction = (index + 3) % 6.
class_name Hex
extends RefCounted

const NUM_DIRS: int = 6
const SQRT3: float = 1.7320508075688772

## Clockwise from North. Index IS the control index.
const DIRS: Array[Vector2i] = [
	Vector2i(0, -1),  # 0 N
	Vector2i(1, -1),  # 1 NE
	Vector2i(1, 0),   # 2 SE
	Vector2i(0, 1),   # 3 S
	Vector2i(-1, 1),  # 4 SW
	Vector2i(-1, 0),  # 5 NW
]

const DIR_NAMES: Array = ["N", "NE", "SE", "S", "SW", "NW"]


## A Hex is a Vector2i(q, r). Helper constructor for clarity.
static func make(q: int, r: int) -> Vector2i:
	return Vector2i(q, r)


## Safe direction lookup; errors on out-of-range so index bugs fail loudly.
static func dir(i: int) -> Vector2i:
	if i < 0 or i >= NUM_DIRS:
		push_error("Invalid direction index: %d" % i)
		return Vector2i.ZERO
	return DIRS[i]


## The opposite direction is 3 steps away (180 deg) on a 6-direction hex.
static func opposite(i: int) -> int:
	return posmod(i + 3, NUM_DIRS)


static func add(a: Vector2i, b: Vector2i) -> Vector2i:
	return Vector2i(a.x + b.x, a.y + b.y)


static func neighbor(h: Vector2i, i: int) -> Vector2i:
	return add(h, dir(i))


## All 6 neighbors (in-bounds-ness is the caller's concern).
static func neighbors(h: Vector2i) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for d in DIRS:
		out.append(add(h, d))
	return out


## Direction index from `from` to an adjacent `to`, or -1 if not a direct neighbor.
## Used to derive headings from segment pairs (e.g. Hydra split).
static func direction_of(from: Vector2i, to: Vector2i) -> int:
	for i in range(NUM_DIRS):
		var d: Vector2i = DIRS[i]
		if from.x + d.x == to.x and from.y + d.y == to.y:
			return i
	return -1


## Hex distance in steps.
static func distance(a: Vector2i, b: Vector2i) -> int:
	var dq: int = a.x - b.x
	var dr: int = a.y - b.y
	return (absi(dq) + absi(dq + dr) + absi(dr)) / 2


## In a hexagonal arena of `radius` centered at origin.
static func in_bounds(h: Vector2i, radius: int) -> bool:
	return max(max(absi(h.x), absi(h.y)), absi(h.x + h.y)) <= radius


## Flat-top axial -> pixel. `size` = center-to-corner distance.
static func hex_to_pixel(h: Vector2i, size: float) -> Vector2:
	var x: float = size * 1.5 * h.x
	var y: float = size * (SQRT3 / 2.0 * h.x + SQRT3 * h.y)
	return Vector2(x, y)


## Pixel -> axial with cube rounding (re-enforces q + r + s = 0).
static func pixel_to_hex(x: float, y: float, size: float) -> Vector2i:
	var q_frac: float = ((2.0 / 3.0) * x) / size
	var r_frac: float = ((-1.0 / 3.0) * x + (SQRT3 / 3.0) * y) / size
	return _cube_round(q_frac, r_frac)


static func _cube_round(q_frac: float, r_frac: float) -> Vector2i:
	var s_frac: float = -q_frac - r_frac
	var q: int = roundi(q_frac)
	var r: int = roundi(r_frac)
	var s: int = roundi(s_frac)
	var q_diff: float = abs(q - q_frac)
	var r_diff: float = abs(r - r_frac)
	var s_diff: float = abs(s - s_frac)
	# Reset the axis with the largest rounding error so q + r + s = 0 holds.
	if q_diff > r_diff and q_diff > s_diff:
		q = -r - s
	elif r_diff > s_diff:
		r = -q - s
	return Vector2i(q, r)


## Every hex in a hexagonal arena of `radius` centered at the origin.
static func hexes_in_radius(radius: int) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	var q: int = -radius
	while q <= radius:
		var r_min: int = max(-radius, -q - radius)
		var r_max: int = min(radius, -q + radius)
		var r: int = r_min
		while r <= r_max:
			out.append(Vector2i(q, r))
			r += 1
		q += 1
	return out
