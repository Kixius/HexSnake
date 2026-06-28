extends SceneTree
## Headless integration test for the upgrade-draft FSM (Phase 3 GameManager wiring):
## the floor-clear -> UpgradeSelect -> pick -> next-floor flow, the chamber-core pick
## (stay on the same floor), request_pick arming/ignoring, and Nutrient Storage
## reducing the next floor's essence requirement. The data layer is covered by
## upgrade_test.gd; this covers the GameManager transitions.
## Run: godot --headless -s res://core/draft_test.gd

func _init() -> void:
	var fails: Array[int] = [0]
	var fail := func(msg: String) -> void:
		printerr("  FAIL: " + msg)
		fails[0] += 1

	var gm := GameManager.new()
	gm.start_run()
	if gm.state != GameState.PLAYING:
		fail.call("start_run: state=%d (want PLAYING)" % gm.state)

	# (A) Floor-clear path: on_floor_cleared -> UPGRADE_SELECT, 3 choices, depth+1.
	var depth0: int = gm.depth
	var floor0: Floor = gm.floor
	gm.on_floor_cleared()
	if gm.state != GameState.UPGRADE_SELECT:
		fail.call("on_floor_cleared: state=%d (want UPGRADE_SELECT)" % gm.state)
	if gm.choices.size() != 3:
		fail.call("on_floor_cleared: %d choices (want 3)" % gm.choices.size())
	if gm.depth != depth0 + 1:
		fail.call("on_floor_cleared: depth=%d (want %d)" % [gm.depth, depth0 + 1])

	# request_pick arms the animation; a second request while animating is ignored.
	gm.request_pick(1)
	if gm.pick_index != 1:
		fail.call("request_pick(1): pick_index=%d (want 1)" % gm.pick_index)
	gm.request_pick(0)
	if gm.pick_index != 1:
		fail.call("request_pick during anim changed pick_index to %d (want 1)" % gm.pick_index)

	# pick_upgrade applies the chosen card and advances to a NEW floor.
	var picked_id: String = gm.choices[1].id
	gm.pick_upgrade(1)
	if gm.state != GameState.PLAYING:
		fail.call("pick_upgrade: state=%d (want PLAYING)" % gm.state)
	if gm.choices.size() != 0:
		fail.call("pick_upgrade: choices not cleared (%d)" % gm.choices.size())
	if gm.upgrades.active.size() != 1:
		fail.call("pick_upgrade: %d active (want 1)" % gm.upgrades.active.size())
	if gm.upgrades.active[0].def.id != picked_id:
		fail.call("pick_upgrade: applied %s (want %s)" % [gm.upgrades.active[0].def.id, picked_id])
	if gm.floor == floor0:
		fail.call("pick_upgrade: floor unchanged (floor-clear pick should advance)")

	# (B) Chamber-core path: open_upgrade_select with no pending advance -> pick stays
	# on the SAME floor (halt_for_launch, not begin_floor).
	var floor_before_core: Floor = gm.floor
	gm.open_upgrade_select()
	if gm.state != GameState.UPGRADE_SELECT:
		fail.call("core open_upgrade_select: state=%d (want UPGRADE_SELECT)" % gm.state)
	var core_picked_id: String = gm.choices[0].id
	gm.pick_upgrade(0)
	if gm.state != GameState.PLAYING:
		fail.call("core pick: state=%d (want PLAYING)" % gm.state)
	if gm.floor != floor_before_core:
		fail.call("core pick: floor changed (should stay on the same floor)")
	# The picked card is now active (a new entry, OR an existing entry's stacks grew if
	# the core pick re-rolled the same card as the floor-clear pick).
	var core_applied: bool = false
	for a in gm.upgrades.active:
		if a.def.id == core_picked_id:
			core_applied = true
	if not core_applied:
		fail.call("core pick: %s not in active build" % core_picked_id)

	# (C) Nutrient Storage reduces the next floor's essence requirement by 2.
	var snap := GameSnapshot.new()
	var base_needed: int = FloorGenerator.generate(5, snap).essence_needed
	snap.essence_reduction = 2
	var reduced_needed: int = FloorGenerator.generate(5, snap).essence_needed
	if reduced_needed != maxi(1, base_needed - 2):
		fail.call("nutrient: essence_needed %d -> %d (want %d)" % [base_needed, reduced_needed, maxi(1, base_needed - 2)])

	if fails[0] == 0:
		print("DRAFT TESTS: PASS")
	else:
		printerr("DRAFT TESTS: %d FAILURE(S)" % fails[0])
	quit(0 if fails[0] == 0 else 1)
