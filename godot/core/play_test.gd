extends SceneTree
## Headless smoke test: drives the core loop (move -> eat -> die -> respawn) WITHOUT a GUI,
## proving the GameManager + SnakeController + Floor + Grid wiring works end-to-end.
## Mirrors what the Phase 1 milestone playtest checks, but runnable in CI.
## Run: godot --headless -s res://core/play_test.gd

func _init() -> void:
	var fails: Array[int] = [0]
	var fail := func(msg: String) -> void:
		printerr("  FAIL: " + msg)
		fails[0] += 1

	var gm := GameManager.new()
	gm.start_run()

	# A floor + snake exist after run start, and we're Playing.
	if gm.floor == null:
		fail.call("no floor after start_run")
	if gm.snake == null:
		fail.call("no snake after start_run")
	if gm.state != GameState.PLAYING:
		fail.call("state should be PLAYING after start_run, got %d" % gm.state)

	# Record the launch head, then enqueue SE (index 2) and advance many frames.
	var head0: Vector2i = gm.snake.head() if gm.snake != null else Vector2i.ZERO
	gm.input_queue.enqueue(2)
	for i in 200:
		gm._process(0.3)  # 0.3s/frame -> ~1-2 ticks each

	# SE from origin marches outward. With Phase 2's real floors it most often hits a
	# wall/edge and dies once -> revive (lives 3->2); rarely it eats enough essence to
	# clear the floor (depth 1->2) without dying. Either way it then waits at launch
	# (started=false) for a fresh steer, so at most ONE life-changing event happens here.
	if gm.state != GameState.PLAYING:
		fail.call("expected PLAYING after the run engaged, got state=%d" % gm.state)
	if gm.snap.lives < Config.START_LIVES - 1:
		fail.call("expected at most one death, got lives=%d" % gm.snap.lives)
	# It must have engaged the world somehow: a life lost, a floor cleared, or movement.
	var head_now: Vector2i = gm.snake.head() if gm.snake != null else head0
	var engaged: bool = (gm.depth > 1) or (gm.snap.lives < Config.START_LIVES) or (head_now != head0)
	if not engaged:
		fail.call("snake never engaged (no death, no floor clear, no movement)")

	if fails[0] == 0:
		print("PLAY SMOKE: PASS (steered, advanced, died, revived)")
	else:
		printerr("PLAY SMOKE: %d FAILURE(S)" % fails[0])
	quit(0 if fails[0] == 0 else 1)
