extends SceneTree
## Headless test for the keybind helpers (Phase 3). Pure statics, no autoloads.
## Run: godot --headless -s res://core/keybind_test.gd

func _init() -> void:
	var fails: Array[int] = [0]
	var fail := func(msg: String) -> void:
		printerr("  FAIL: " + msg)
		fails[0] += 1

	var kb: Dictionary = Keybinds.DEFAULT_KEYBINDS.duplicate()

	# find_conflict: dir0 is KEY_W by default; binding dir1 to KEY_W conflicts with dir0.
	var c: String = Keybinds.find_conflict(kb, "dir1", KEY_W)
	if c != "dir0":
		fail.call("find_conflict(dir1, KEY_W) = '%s', want 'dir0'" % c)
	# A free key (KEY_Z) -> no conflict.
	c = Keybinds.find_conflict(kb, "dir0", KEY_Z)
	if c != "":
		fail.call("find_conflict(dir0, KEY_Z) should be '' (got '%s')" % c)
	# Binding an action to its OWN current key is not a conflict.
	c = Keybinds.find_conflict(kb, "dir0", KEY_W)
	if c != "":
		fail.call("find_conflict(dir0, its own KEY_W) should be '' (got '%s')" % c)

	# is_reserved_key.
	if not Keybinds.is_reserved_key(KEY_ESCAPE):
		fail.call("is_reserved_key(ESCAPE) should be true")
	if not Keybinds.is_reserved_key(KEY_ENTER):
		fail.call("is_reserved_key(ENTER) should be true")
	if not Keybinds.is_reserved_key(KEY_TAB):
		fail.call("is_reserved_key(TAB) should be true")
	if Keybinds.is_reserved_key(KEY_W):
		fail.call("is_reserved_key(W) should be false")

	# Action registry.
	if not Keybinds.is_valid_action("phase"):
		fail.call("is_valid_action('phase') should be true")
	if Keybinds.is_valid_action("bogus"):
		fail.call("is_valid_action('bogus') should be false")
	if Keybinds.ALL_ACTIONS.size() != 9:
		fail.call("ALL_ACTIONS should have 9 entries (got %d)" % Keybinds.ALL_ACTIONS.size())

	# DEFAULT_KEYBINDS has an int Key for every action.
	for action in Keybinds.ALL_ACTIONS:
		if not Keybinds.DEFAULT_KEYBINDS.has(action):
			fail.call("DEFAULT_KEYBINDS missing '%s'" % action)
		elif not (Keybinds.DEFAULT_KEYBINDS[action] is int):
			fail.call("DEFAULT_KEYBINDS['%s'] not an int" % action)

	# key_label produces a sensible label for a known key.
	if Keybinds.key_label(KEY_W) != "W":
		fail.call("key_label(KEY_W) = '%s', want 'W'" % Keybinds.key_label(KEY_W))
	if Keybinds.key_label(KEY_SPACE) == "":
		fail.call("key_label(KEY_SPACE) should be non-empty")
	if Keybinds.key_label(KEY_NONE) != "—":
		fail.call("key_label(KEY_NONE) should be the em-dash placeholder")

	if fails[0] == 0:
		print("KEYBIND TESTS: PASS")
	else:
		printerr("KEYBIND TESTS: %d FAILURE(S)" % fails[0])
	quit(0 if fails[0] == 0 else 1)
