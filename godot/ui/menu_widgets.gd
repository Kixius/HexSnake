class_name MenuWidgets
extends RefCounted
## Hand-drawn menu widget primitives (port of src/ui/menu/widgets.ts). Each is a static
## function that DRAWS via the `world` reference (during its _draw) AND queries the
## `UiContext` for hover/focus/activate, returning its result. Hover/click SFX play on
## widget-enter / activate. Loaded only via MenuController (windowed) -> may reference
## the Palette autoload by name.
##
## NOTE: Godot's draw_string `pos` is the text BASELINE, so vertical centering uses
## font ascent/descent via _vcenter (not a top-left formula).

# Tracks the last hovered widget id so hover SFX fires once per enter (not every frame).
static var _hovered_id: String = ""


static func _play_hover(world: World, id: String) -> void:
	if id != _hovered_id:
		_hovered_id = id
		world._sfx("hover")


# ---- primitives ----

static func button(world: World, ui: UiContext, id: String, rect: Rect2, label: String) -> bool:
	var r: Dictionary = ui.interact(id, rect)
	# Only one widget highlights at a time: when keyboard nav is active, ignore the
	# (idle) mouse hover so the focused widget is the sole highlight.
	var kb: bool = ui.focus_from_keyboard
	var hot: bool = bool(r["focused"]) or (bool(r["hover"]) and not kb)
	if r["hover"] and not kb:
		_play_hover(world, id)
	var fill: Color = Palette.color("snake_body") if hot else Palette.color("grid")
	var edge: Color = Palette.color("teal") if hot else Palette.color("grid_edge")
	world.draw_rect(rect, fill, true)
	world.draw_rect(rect, edge, false, 2.0)
	_centered(world, rect, label, 22, Palette.color("text"))
	if r["activated"]:
		world._sfx("click")
	return bool(r["activated"])


static func list_row(world: World, ui: UiContext, id: String, rect: Rect2, label: String, value_text: String, selected: bool) -> bool:
	var r: Dictionary = ui.interact(id, rect)
	var kb: bool = ui.focus_from_keyboard
	if r["hover"] and not kb:
		_play_hover(world, id)
	var hot: bool = bool(r["focused"]) or (bool(r["hover"]) and not kb) or selected
	var fill: Color = Palette.color("snake_body") if hot else Palette.color("grid")
	world.draw_rect(rect, fill, true)
	world.draw_rect(rect, Palette.color("teal") if (selected or hot) else Palette.color("grid_edge"), false, 2.0)
	var pad: float = 18.0
	_text_left(world, Vector2(rect.position.x + pad, _vcenter(world, rect, 20)), label, 20, Palette.color("text"))
	if value_text != "":
		var vcol: Color = Palette.color("gold") if selected else Palette.color("text_dim")
		_text_left(world, Vector2(rect.position.x + rect.size.x - pad - _text_width(world, value_text, 18), _vcenter(world, rect, 18)), value_text, 18, vcol)
	if r["activated"]:
		world._sfx("click")
	return bool(r["activated"])


## Horizontal slider. Returns the (possibly changed) value. Caller persists it.
static func slider(world: World, ui: UiContext, id: String, x: float, y: float, w: float, value: float, vmin: float, vmax: float) -> float:
	var hit: Rect2 = Rect2(x, y - 22.0, w, 44.0)
	var dragging: bool = ui.drag(id, hit) or ui.is_dragging(id)
	var out: float = value
	if dragging:
		var t: float = clampf((ui.mouse_x - x) / w, 0.0, 1.0)
		out = lerpf(vmin, vmax, t)
	var track: Rect2 = Rect2(x, y - 4.0, w, 8.0)
	world.draw_rect(track, Palette.color("grid_edge"), true)
	var span: float = vmax - vmin
	var frac: float = 0.0 if span == 0.0 else (out - vmin) / span
	world.draw_rect(Rect2(x, y - 4.0, w * frac, 8.0), Palette.color("teal"), true)
	# Knob (small diamond).
	var kx: float = x + w * frac
	var kp: Vector2 = Vector2(kx, y)
	var half: float = 9.0
	world.draw_colored_polygon(PackedVector2Array([kp + Vector2(half, 0), kp + Vector2(0, -half), kp + Vector2(-half, 0), kp + Vector2(0, half)]), Palette.color("text"))
	return out


static func toggle(world: World, ui: UiContext, id: String, rect: Rect2, label: String, value: bool) -> bool:
	var r: Dictionary = ui.interact(id, rect)
	if r["hover"] and not ui.focus_from_keyboard:
		_play_hover(world, id)
	var out: bool = value
	if r["activated"]:
		out = not value
		world._sfx("click")
	var pad: float = 18.0
	_text_left(world, Vector2(rect.position.x + pad, _vcenter(world, rect, 20)), label, 20, Palette.color("text"))
	# Switch on the right.
	var sw_w: float = 54.0
	var sw_h: float = 24.0
	var sw: Rect2 = Rect2(rect.position.x + rect.size.x - pad - sw_w, rect.position.y + (rect.size.y - sw_h) * 0.5, sw_w, sw_h)
	world.draw_rect(sw, Palette.color("teal") if out else Palette.color("grid_edge"), true)
	world.draw_rect(sw, Palette.color("teal") if out else Palette.color("grid_edge"), false, 2.0)
	var knob_x: float = sw.position.x + (sw_w - sw_h) if out else sw.position.x
	world.draw_rect(Rect2(knob_x, sw.position.y, sw_h, sw_h), Palette.color("text"), true)
	# ON/OFF right-aligned just left of the switch (was overlapping it).
	var state_text: String = "ON" if out else "OFF"
	var stw: float = _text_width(world, state_text, 16)
	_text_left(world, Vector2(sw.position.x - 10.0 - stw, _vcenter(world, rect, 16)), state_text, 16, Palette.color("text_dim"))
	return out


static func label(world: World, pos: Vector2, text: String, size: int, color: Color, align: int = HORIZONTAL_ALIGNMENT_LEFT, width: float = -1.0) -> void:
	world._text(text, pos, size, color, align, width)


static func panel(world: World, rect: Rect2) -> void:
	var fill: Color = Palette.color("grid")
	fill.a = 0.5
	world.draw_rect(rect, fill, true)
	world.draw_rect(rect, Palette.color("grid_edge"), false, 1.5)


static func screen_title(world: World, w: float, y: float, title: String, subtitle: String) -> void:
	world._text(title, Vector2(0, y), 34, Palette.color("gold"), HORIZONTAL_ALIGNMENT_CENTER, w)
	if subtitle != "":
		world._text(subtitle, Vector2(0, y + 40.0), 15, Palette.color("text_dim"), HORIZONTAL_ALIGNMENT_CENTER, w)


static func back_button(world: World, ui: UiContext, w: float, h: float) -> bool:
	var bw: float = 160.0
	var bh: float = 44.0
	return button(world, ui, "back", Rect2((w - bw) * 0.5, h - bh - 30.0, bw, bh), "BACK")


# ---- text helpers (via world.font) ----

## Vertical-center baseline y for `size` text inside `rect`. Godot draw_string pos is
## the text baseline, so center via ascent/descent.
static func _vcenter(world: World, rect: Rect2, size: int) -> float:
	return rect.position.y + rect.size.y * 0.5 + (world.font.get_ascent(size) - world.font.get_descent(size)) * 0.5


static func _centered(world: World, rect: Rect2, text: String, size: int, color: Color) -> void:
	var tw: float = _text_width(world, text, size)
	world.draw_string(world.font, Vector2(rect.position.x + (rect.size.x - tw) * 0.5, _vcenter(world, rect, size)), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)


static func _text_left(world: World, pos: Vector2, text: String, size: int, color: Color) -> void:
	world.draw_string(world.font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)


static func _text_width(world: World, text: String, size: int) -> float:
	return world.font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
