extends SceneTree
## Headless test for the touch-pad wedge -> direction mapping (Phase 5). Pure static
## math — no autoload, no instance. Run: godot --headless -s res://core/touch_test.gd

func _init() -> void:
	var fails: Array[int] = [0]
	var fail := func(msg: String) -> void:
		printerr("  FAIL: " + msg)
		fails[0] += 1

	# The 6 wedge centers (screen unit vectors, y-down) -> their control indices.
	var cases: Array = [
		[Vector2(0.0, -1.0), 0],          # N  (-90deg)
		[Vector2(0.866, -0.5), 1],        # NE (-30deg)
		[Vector2(0.866, 0.5), 2],         # SE ( +30deg)
		[Vector2(0.0, 1.0), 3],           # S  ( +90deg)
		[Vector2(-0.866, 0.5), 4],        # SW ( +150deg)
		[Vector2(-0.866, -0.5), 5],       # NW ( +210deg)
	]
	for c in cases:
		var rel: Vector2 = c[0]
		var want: int = c[1]
		var got: int = TouchControls.wedge_index(rel)
		if got != want:
			fail.call("wedge_index(%s)=%d want %d" % [rel, got, want])

	# Scale-invariant: same direction at any radius.
	if TouchControls.wedge_index(Vector2(0.0, -150.0)) != 0:
		fail.call("wedge_index should be scale-invariant (N at r=150)")
	# Boundary midpoint lands in a valid wedge 0..5.
	var mid: int = TouchControls.wedge_index(Vector2(0.5, -0.866))  # -60deg, N|NE edge
	if mid < 0 or mid > 5:
		fail.call("boundary wedge out of range: %d" % mid)
	# A fine sweep around the circle always maps to a valid index 0..5. (Sampling every
	# 60deg would straddle wedge edges and collide; the 6-center cases above already
	# prove each index is reachable.)
	var a: float = 0.0
	while a < 360.0:
		var idx: int = TouchControls.wedge_index(Vector2(cos(deg_to_rad(a)), sin(deg_to_rad(a))))
		if idx < 0 or idx > 5:
			fail.call("angle %d -> index %d out of range" % [a, idx])
		a += 13.0

	if fails[0] == 0:
		print("TOUCH TESTS: PASS")
	else:
		printerr("TOUCH TESTS: %d FAILURE(S)" % fails[0])
	quit(0 if fails[0] == 0 else 1)
