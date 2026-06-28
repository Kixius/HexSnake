class_name MenuController
extends Node
## Hand-drawn menu system (port of src/ui/menu/MenuController.ts). Owns a screen stack
## + one UiContext (immediate-mode). `render()` is called from world._draw during the
## MENU state; keyboard nav is fed by game_manager; pointer press/hover/release by
## PointerHandler. Reads the Settings autoload directly (loaded only via main.gd ->
## windowed context, never under `-s`).

var stack: Array[String] = ["main"]
var ui := UiContext.new()
var world: World = null  # set by main.gd (used for SFX/_draw access)
var start_run_cb: Callable = Callable()  # Callable(gm, "start_run"), set by main.gd
# For keyboard-nav hover SFX: _nav_pressed is set by on_key, consumed by render.
var _last_focus_id: String = ""
var _nav_pressed: bool = false


func _ready() -> void:
	reset()


func reset() -> void:
	stack = ["main"]
	ui.clear_interaction()


func top() -> String:
	return stack[stack.size() - 1]


func push(screen_id: String) -> void:
	stack.append(screen_id)
	ui.clear_interaction()
	MenuScreens.reset_capture()
	MenuScreens.reset_video()


func pop() -> void:
	if stack.size() > 1:
		stack.remove_at(stack.size() - 1)
		ui.clear_interaction()


func start_run() -> void:
	if start_run_cb.is_valid():
		start_run_cb.call()


## Draw the top screen (called from world._draw during MENU). Each frame: begin the
## immediate-mode pass, dispatch the screen render, end.
func render(w: World, vp: Vector2) -> void:
	ui.begin()
	MenuScreens.render(w, ui, self, top(), vp.x, vp.y)
	ui.end()
	# Keyboard-nav hover SFX: beep when focus moves via keyboard (mouse hover is handled
	# per-widget). Only fires when nav was pressed AND the focus actually changed.
	if _nav_pressed and ui.focus_id != _last_focus_id and ui.focus_id != "":
		w._sfx("hover")
	_last_focus_id = ui.focus_id
	_nav_pressed = false


# ---- input (pointer) ----

func set_pointer(x: float, y: float, inside: bool) -> void:
	ui.set_pointer(x, y, inside)


func press(x: float, y: float) -> void:
	ui.press(x, y)


func release() -> void:
	ui.release()


# ---- input (keyboard) ----

## Translate a key press into nav/activate/back. Arrow keys + the player's movement
## binds navigate; Enter activates; Escape pops.
func on_key(key_event: InputEventKey) -> void:
	if not key_event.pressed or key_event.echo:
		return
	# Keybinds capture mode: the next key rebinds the selected action (Escape cancels).
	if MenuScreens.is_capturing():
		MenuScreens.capture_key(key_event.physical_keycode)
		return
	var kc: int = key_event.physical_keycode
	if kc == KEY_ESCAPE:
		pop()
		return
	if kc == KEY_ENTER or kc == KEY_KP_ENTER:
		ui.nav["activate"] = true
		return
	# Everything below is directional nav — flag it so render can beep on focus change.
	_nav_pressed = true
	if kc == KEY_UP:
		ui.nav["up"] = true
		return
	if kc == KEY_DOWN:
		ui.nav["down"] = true
		return
	if kc == KEY_LEFT:
		ui.nav["left"] = true
		return
	if kc == KEY_RIGHT:
		ui.nav["right"] = true
		return
	# Movement binds -> nav (N=up, S=down, NW/SW=left, NE/SE=right).
	var kb: Dictionary = Settings.keybinds
	if kc == int(kb.get("dir0", KEY_W)):
		ui.nav["up"] = true
	elif kc == int(kb.get("dir3", KEY_S)):
		ui.nav["down"] = true
	elif kc == int(kb.get("dir4", KEY_A)) or kc == int(kb.get("dir5", KEY_Q)):
		ui.nav["left"] = true
	elif kc == int(kb.get("dir1", KEY_E)) or kc == int(kb.get("dir2", KEY_D)):
		ui.nav["right"] = true
