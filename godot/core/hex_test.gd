## Deterministic regression test for the pure hex math, ported from scripts/hex.test.ts.
## Run headless from the project dir:
##   godot --headless -s res://core/hex_test.gd
## (Mirrors the TS: `node --experimental-strip-types scripts/hex.test.ts`.)
extends SceneTree


func _init() -> void:
	# Failure count in a 1-element array so lambdas can mutate it (ints are captured by value).
	var fails: Array[int] = [0]
	var fail := func(msg: String) -> void:
		printerr("  FAIL: " + msg)
		fails[0] += 1

	# opposite(): the bug that caused reversals into the neck.
	for i in range(Hex.NUM_DIRS):
		var o: int = Hex.opposite(i)
		var d: Vector2i = Hex.DIRS[i]
		var od: Vector2i = Hex.DIRS[o]
		if o != posmod(i + 3, Hex.NUM_DIRS):
			fail.call("opposite(%d)=%d, expected %d" % [i, o, posmod(i + 3, Hex.NUM_DIRS)])
		if od.x != -d.x or od.y != -d.y:
			fail.call("opposite(%d) is not the negated vector" % i)
		if Hex.opposite(o) != i:
			fail.call("opposite(opposite(%d)) != %d" % [i, i])

	# The three opposite pairs reported by the player: W/S, E/A, D/Q  <=>  N/S, NE/SW, SE/NW.
	var is_reverse := func(heading: int, dir_index: int) -> bool:
		return dir_index == Hex.opposite(heading)
	if not is_reverse.call(0, 3):
		fail.call("N vs S should be a reverse (W/S)")
	if not is_reverse.call(1, 4):
		fail.call("NE vs SW should be a reverse (E/A)")
	if not is_reverse.call(2, 5):
		fail.call("SE vs NW should be a reverse (D/Q)")
	if is_reverse.call(0, 1):
		fail.call("N vs NE should NOT be a reverse")
	if is_reverse.call(0, 0):
		fail.call("N vs N should NOT be a reverse")

	# neighbor then back returns to the start.
	var start := Vector2i(3, -2)
	for i in range(Hex.NUM_DIRS):
		var n: Vector2i = Hex.neighbor(start, i)
		if Hex.distance(start, n) != 1:
			fail.call("neighbor %d not distance 1" % i)
		var back: Vector2i = Hex.neighbor(n, Hex.opposite(i))
		if back.x != start.x or back.y != start.y:
			fail.call("step %d then opposite did not return" % i)

	# inBounds sanity.
	if not Hex.in_bounds(Vector2i(0, 0), 11):
		fail.call("origin should be in bounds")
	if Hex.in_bounds(Vector2i(12, 0), 11):
		fail.call("q=12 should be out of bounds")

	if fails[0] == 0:
		print("HEX TESTS: PASS")
	else:
		printerr("HEX TESTS: %d FAILURE(S)" % fails[0])
	quit(0 if fails[0] == 0 else 1)
