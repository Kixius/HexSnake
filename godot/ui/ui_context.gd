class_name UiContext
extends RefCounted
## Immediate-mode UI core for the menu (port of src/ui/menu/UiContext.ts). One instance
## is reused every frame: widgets register their rects while drawing and call interact()
## to query hover/focus/activate. Directional keyboard nav is resolved against the
## PREVIOUS frame's rects at begin(); mouse + keyboard share one focus_id (moving the
## mouse snaps focus to what's under it; idle mouse leaves keyboard focus untouched).

# Cross-frame state.
var focus_id: String = ""
var mouse_x: float = 0.0
var mouse_y: float = 0.0
var has_mouse: bool = false
var pointer_down: bool = false
var drag_id: String = ""  # active slider drag owner, or ""
var focus_from_keyboard: bool = false

# Keyboard intents set between frames (consumed in begin/end).
var nav: Dictionary = {"up": false, "down": false, "left": false, "right": false, "activate": false}

# Per-frame.
var _rects: Array = []  # of {"id": String, "rect": Rect2}
var _hover_id: String = ""
var _prev_rects: Array = []
var _click_pending: bool = false
var _click_consumed: bool = false
var _mouse_moved: bool = false


# ---- input setters (called by MenuController between frames) ----

func set_pointer(x: float, y: float, inside: bool) -> void:
	mouse_x = x
	mouse_y = y
	has_mouse = inside
	_mouse_moved = true
	focus_from_keyboard = false


func press(x: float, y: float) -> void:
	mouse_x = x
	mouse_y = y
	has_mouse = true
	pointer_down = true
	_click_pending = true
	_mouse_moved = true
	focus_from_keyboard = false


func release() -> void:
	pointer_down = false
	drag_id = ""


func clear_interaction() -> void:
	pointer_down = false
	drag_id = ""
	focus_id = ""
	_click_pending = false
	_click_consumed = false
	nav["up"] = false
	nav["down"] = false
	nav["left"] = false
	nav["right"] = false
	nav["activate"] = false
	focus_from_keyboard = false


# ---- per-frame lifecycle ----

func begin() -> void:
	_rects.clear()
	_hover_id = ""
	_click_consumed = false
	if nav["up"] or nav["down"] or nav["left"] or nav["right"] or nav["activate"]:
		focus_from_keyboard = true
	var dir: String = ""
	if nav["up"]:
		dir = "up"
	elif nav["down"]:
		dir = "down"
	elif nav["left"]:
		dir = "left"
	elif nav["right"]:
		dir = "right"
	if dir != "":
		focus_id = spatial_nav(_prev_rects, focus_id, dir)


## Register a focusable rect AND query its interaction state.
func interact(id: String, box: Rect2) -> Dictionary:
	_rects.append({"id": id, "rect": box})
	var hover: bool = has_mouse and box.has_point(Vector2(mouse_x, mouse_y))
	if hover:
		_hover_id = id
	var focused: bool = focus_from_keyboard and focus_id == id
	var clicked: bool = hover and _click_pending and not _click_consumed
	if clicked:
		_click_consumed = true
	var activated: bool = clicked or (focused and bool(nav["activate"]))
	return {"hover": hover, "focused": focused, "activated": activated}


## Slider drag: returns true while this widget owns the drag.
func drag(id: String, box: Rect2) -> bool:
	if drag_id == id:
		return true
	var hover: bool = has_mouse and box.has_point(Vector2(mouse_x, mouse_y))
	if hover and _click_pending and not _click_consumed and drag_id == "":
		drag_id = id
		_click_consumed = true
		return true
	return false


func is_dragging(id: String) -> bool:
	return drag_id == id


func end() -> void:
	if _mouse_moved and _hover_id != "":
		focus_id = _hover_id
	if focus_id != "":
		var found: bool = false
		for r in _rects:
			if r["id"] == focus_id:
				found = true
				break
		if not found:
			focus_id = ""
	if focus_id == "" and _rects.size() > 0:
		focus_id = _rects[0]["id"]
	_prev_rects = _rects.duplicate()
	_click_pending = false
	_mouse_moved = false
	nav["up"] = false
	nav["down"] = false
	nav["left"] = false
	nav["right"] = false
	nav["activate"] = false
	if not pointer_down:
		drag_id = ""


## Best focus target from `from_id` moving in `dir` across `rects` (spatial nearest,
## `forward + lateral*2` scoring; rejects backward). Port of UiContext.ts spatialNav.
static func spatial_nav(rects: Array, from_id: String, dir: String) -> String:
	if rects.is_empty():
		return ""
	var from: Dictionary = {}
	if from_id != "":
		for r in rects:
			if r["id"] == from_id:
				from = r
				break
	if from.is_empty():
		return rects[0]["id"]
	var fr: Rect2 = from["rect"]
	var fcx: float = fr.get_center().x
	var fcy: float = fr.get_center().y
	var best_id: String = ""
	var best_score: float = INF
	for c in rects:
		if c["id"] == from_id:
			continue
		var cr: Rect2 = c["rect"]
		var dx: float = cr.get_center().x - fcx
		var dy: float = cr.get_center().y - fcy
		var forward: float = 0.0
		var lateral: float = 0.0
		if dir == "down":
			if dy <= 0.0:
				continue
			forward = dy
			lateral = absf(dx)
		elif dir == "up":
			if dy >= 0.0:
				continue
			forward = -dy
			lateral = absf(dx)
		elif dir == "right":
			if dx <= 0.0:
				continue
			forward = dx
			lateral = absf(dy)
		else:  # left
			if dx >= 0.0:
				continue
			forward = -dx
			lateral = absf(dy)
		var score: float = forward + lateral * 2.0
		if score < best_score:
			best_score = score
			best_id = c["id"]
	return best_id if best_id != "" else from_id
