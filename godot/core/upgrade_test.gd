extends SceneTree
## Headless test for the upgrade data layer (Phase 3): registry shape, the
## weighted-distinct draft, and that each card's apply lambda mutates the snapshot
## correctly. The in-game card SURVIVAL mechanics live in snake_controller.gd
## (already ported); this covers the draft + apply + seam-writer paths.
## Run: godot --headless -s res://core/upgrade_test.gd

const EXPECTED_CARDS: int = 14

func _init() -> void:
	var fails: Array[int] = [0]
	var fail := func(msg: String) -> void:
		printerr("  FAIL: " + msg)
		fails[0] += 1

	var reg: Array[MutationDef] = Registry.build_registry()

	# (1) Registry shape: right count, unique ids, valid rarity, sane max_stacks.
	if reg.size() != EXPECTED_CARDS:
		fail.call("registry has %d cards, expected %d" % [reg.size(), EXPECTED_CARDS])
	var seen: Dictionary = {}
	var valid_rarities: Dictionary = {"common": true, "rare": true, "epic": true, "legendary": true}
	for d in reg:
		if seen.has(d.id):
			fail.call("duplicate card id: %s" % d.id)
		seen[d.id] = true
		if not valid_rarities.has(d.rarity):
			fail.call("card %s has bad rarity %s" % [d.id, d.rarity])
		if d.max_stacks < 1:
			fail.call("card %s has max_stacks %d (<1)" % [d.id, d.max_stacks])
		if not d.apply.is_valid():
			fail.call("card %s apply Callable is not valid" % d.id)

	# (2) roll_three: <=3, distinct, never a maxed card.
	var sys := UpgradeSystem.new()
	for trial in range(50):
		var choices: Array[MutationDef] = sys.roll_three()
		if choices.size() < 1 or choices.size() > 3:
			fail.call("trial %d: roll_three returned %d choices" % [trial, choices.size()])
			break
		var ids: Dictionary = {}
		for c in choices:
			if ids.has(c.id):
				fail.call("trial %d: roll_three returned a duplicate (%s)" % [trial, c.id])
			ids[c.id] = true
			if sys.is_maxed(c):
				fail.call("trial %d: roll_three offered a maxed card (%s)" % [trial, c.id])

	# (3) roll distribution sanity: across many rolls, every rarity shows up.
	var rarity_seen: Dictionary = {"common": false, "rare": false, "epic": false, "legendary": false}
	var dist: Dictionary = {"common": 0, "rare": 0, "epic": 0, "legendary": 0}
	for i in range(400):
		for c in sys.roll_three():
			rarity_seen[c.rarity] = true
			dist[c.rarity] = int(dist[c.rarity]) + 1
	for r in rarity_seen:
		if not rarity_seen[r]:
			fail.call("rarity %s never appeared in 400 rolls" % r)
	# Common should dominate (weight 1.0 vs 0.05-0.45).
	if int(dist["common"]) <= int(dist["legendary"]):
		fail.call("common (%d) should outweigh legendary (%d) in the draft" % [dist["common"], dist["legendary"]])

	# (4) apply mutates the snapshot correctly for representative cards.
	var snap := GameSnapshot.new()
	sys.apply("elongated_strike", snap)
	if absf(snap.score_mult - 1.25) > 0.001 or absf(snap.speed_mult - 1.05) > 0.001:
		fail.call("elongated_strike: score_mult=%s speed_mult=%s (want 1.25 / 1.05)" % [snap.score_mult, snap.speed_mult])
	sys.apply("chitinous_shell", snap)
	if not snap.chitinous_enabled or snap.wall_charges != 1:
		fail.call("chitinous_shell: enabled=%s wall_charges=%d (want true / 1)" % [snap.chitinous_enabled, snap.wall_charges])
	sys.apply("nutrient_storage", snap)
	if snap.essence_reduction != 2:
		fail.call("nutrient_storage: essence_reduction=%d (want 2)" % snap.essence_reduction)
	sys.apply("auxiliary_heart", snap)
	if snap.lives != Config.START_LIVES + 1:
		fail.call("auxiliary_heart: lives=%d (want %d)" % [snap.lives, Config.START_LIVES + 1])
	var snap2 := GameSnapshot.new()
	sys2_apply(snap2, "hypertrophy", fail)
	if absf(snap2.score_mult - 3.0) > 0.001 or snap2.growth_per_food != 2:
		fail.call("hypertrophy: score_mult=%s growth=%d (want 3.0 / 2)" % [snap2.score_mult, snap2.growth_per_food])

	# (5) is_maxed + maxed cards stop being offered. chitinous_shell max_stacks=2.
	var sys3 := UpgradeSystem.new()
	sys3.apply("chitinous_shell", GameSnapshot.new())
	sys3.apply("chitinous_shell", GameSnapshot.new())
	var cdef: MutationDef = sys3.registry[0]
	for d in sys3.registry:
		if d.id == "chitinous_shell":
			cdef = d
	if not sys3.is_maxed(cdef):
		fail.call("chitinous_shell should be maxed after 2 applies (max_stacks=2)")
	for i in range(60):
		for c in sys3.roll_three():
			if c.id == "chitinous_shell":
				fail.call("a maxed card (chitinous_shell) was offered in roll_three")

	# (6) seam writers.
	var snap3 := GameSnapshot.new()
	snap3.score_mult = 4.0
	sys3.reset_multiplier(snap3)
	if snap3.score_mult != 1.0:
		fail.call("reset_multiplier: score_mult=%s (want 1.0)" % snap3.score_mult)
	sys3.apply_spore(snap3)
	if snap3.spore_stacks != 1:
		fail.call("apply_spore: spore_stacks=%d (want 1)" % snap3.spore_stacks)

	# (7) build_summary reflects the active build.
	var summary: Array = sys3.build_summary()
	var found_chit: bool = false
	for m in summary:
		if m["name"] == "Chitinous Shell" and m["stacks"] == 2:
			found_chit = true
	if not found_chit:
		fail.call("build_summary missing Chitinous Shell x2 (got %s)" % str(summary))

	if fails[0] == 0:
		print("UPGRADE TESTS: PASS")
	else:
		printerr("UPGRADE TESTS: %d FAILURE(S)" % fails[0])
	quit(0 if fails[0] == 0 else 1)


# Helper so the hypertrophy check gets its own fresh system + snapshot inline.
func sys2_apply(snap: GameSnapshot, id: String, fail: Callable) -> void:
	var sys := UpgradeSystem.new()
	sys.apply(id, snap)
