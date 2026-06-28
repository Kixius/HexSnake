class_name Keybinds
extends RefCounted
## Keybind helpers (port of src/settings/Keybinds.ts). Keybinds are stored as Godot `Key`
## int constants (physical_keycode values) — the Godot equivalent of the TS `e.code`
## strings, avoiding a fragile string<->keycode bridge. Pure statics; `-s`-safe.

const DIR_ACTIONS: Array = ["dir0", "dir1", "dir2", "dir3", "dir4", "dir5"]

const ALL_ACTIONS: Array = [
	"dir0", "dir1", "dir2", "dir3", "dir4", "dir5",
	"phase", "slip", "pause",
]

const ACTION_LABELS: Dictionary = {
	"dir0": "North",
	"dir1": "North-East",
	"dir2": "South-East",
	"dir3": "South",
	"dir4": "South-West",
	"dir5": "North-West",
	"phase": "Phase Shifter",
	"slip": "Diagonal Slip",
	"pause": "Pause",
}

# Default binds (port of src/settings/defaults.ts DEFAULT_KEYBINDS), as Godot Key
# physical-keycode constants. Godot's KEY_SHIFT covers both L/R shift for slip.
const DEFAULT_KEYBINDS: Dictionary = {
	"dir0": KEY_W,
	"dir1": KEY_E,
	"dir2": KEY_D,
	"dir3": KEY_S,
	"dir4": KEY_A,
	"dir5": KEY_Q,
	"phase": KEY_SPACE,
	"slip": KEY_SHIFT,
	"pause": KEY_P,
}


static func is_valid_action(action: String) -> bool:
	return ALL_ACTIONS.has(action)


## The OTHER action already bound to `key` (excluding `action`), or "" if free. Used to
## reject conflicting rebinds.
static func find_conflict(kb: Dictionary, action: String, key: int) -> String:
	for other in ALL_ACTIONS:
		if other == action:
			continue
		if int(kb.get(other, KEY_NONE)) == key:
			return other
	return ""


## Keys reserved for menu/UI use (can't be bound to an action).
static func is_reserved_key(key: int) -> bool:
	return key == KEY_ESCAPE or key == KEY_ENTER or key == KEY_TAB


## Human-readable label for a Key (KEY_W -> "W"), via the engine's built-in lookup.
static func key_label(key: int) -> String:
	if key == KEY_NONE:
		return "—"
	var s: String = OS.get_keycode_string(key)
	return s if s != "" else "Key %d" % key
