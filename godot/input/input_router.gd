class_name InputRouter
extends Node
## Keyboard -> InputQueue, driven by the persisted keybinds (Settings). Maps the 6 hex
## directions + Phase Shifter + Diagonal Slip. Port of the keybind core of
## src/input/Input.ts. Reads Settings by node path so this stays `-s`-safe (autoloads
## don't instantiate under `-s`), and subscribes to Settings.settings_changed so a
## rebind from the menu applies live.
##
## Matches on PHYSICAL keycode (position-based, layout-independent) — the Godot
## equivalent of the TS `event.code`.

var queue: InputQueue = null
var gm: GameManager = null  # set by main.gd; used to skip routing outside PLAYING

var _dir_key_to_dir: Dictionary = {}  # Key int -> direction index 0..5
var _phase_key: int = KEY_SPACE
var _slip_key: int = KEY_SHIFT


func _ready() -> void:
	_apply_keybinds()
	var s: Node = get_node_or_null("/root/Settings") if is_inside_tree() else null
	if s != null:
		s.connect("settings_changed", _apply_keybinds)


## Rebuild the key maps from the current Settings keybinds (fall back to defaults when
## Settings is absent, e.g. under `-s`).
func _apply_keybinds() -> void:
	var kb: Dictionary = _settings_keybinds()
	_dir_key_to_dir.clear()
	for action in Keybinds.DIR_ACTIONS:
		var idx: int = Keybinds.DIR_ACTIONS.find(action)
		_dir_key_to_dir[int(kb.get(action, Keybinds.DEFAULT_KEYBINDS[action]))] = idx
	_phase_key = int(kb.get("phase", KEY_SPACE))
	_slip_key = int(kb.get("slip", KEY_SHIFT))


func _settings_keybinds() -> Dictionary:
	var s: Node = get_node_or_null("/root/Settings") if is_inside_tree() else null
	if s != null:
		var kb = s.get("keybinds")
		if kb is Dictionary:
			return kb
	return Keybinds.DEFAULT_KEYBINDS.duplicate()


func _unhandled_input(event: InputEvent) -> void:
	if queue == null:
		return
	# Only route movement/phase/slip during play. In the menu / upgrade / dead screens the
	# movement keys (WASD/QWE) must propagate to the MenuController for navigation, so we
	# do NOT consume them (no set_input_as_handled) outside PLAYING.
	if gm != null and gm.state != GameState.PLAYING:
		return
	var key_event := event as InputEventKey
	if key_event == null or not key_event.pressed or key_event.echo:
		return
	var kc: int = key_event.physical_keycode
	if _dir_key_to_dir.has(kc):
		queue.enqueue(int(_dir_key_to_dir[kc]))
		get_viewport().set_input_as_handled()
		return
	if kc == _phase_key:
		queue.request_phase()
		get_viewport().set_input_as_handled()
		return
	if kc == _slip_key:
		queue.request_slip()
		get_viewport().set_input_as_handled()
