class_name TouchControls
extends Control
## On-screen controls for touch devices (Phase 5). A 6-wedge hex direction pad maps
## taps to the same control indices the keyboard uses, so steering funnels through
## input_queue.enqueue() — one input path, mobile reuses the queue for free. Phase +
## Slip buttons cover the active-cd abilities. Menu / upgrade-select / dead are also
## touch-driven (tap to start; tap a screen third to pick a card).
##
## Auto-shown on touch devices; F2 force-toggles it on desktop for testing. The wedge
## math is a pure public static func (wedge_index) so it's headlessly testable. Uses
## neutral white/grey colors (not the Palette autoload) so this script stays -s-safe.

var queue: InputQueue = null  # gameplay directions (set by main.gd)
var gm: GameManager = null  # menu / upgrade / dead actions (set by main.gd)

var _pad_center: Vector2 = Vector2.ZERO
var _pad_radius: float = 120.0
var _phase_rect: Rect2 = Rect2()
var _slip_rect: Rect2 = Rect2()
var _font_cache: Font = null


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE  # input handled in _unhandled_input
	_update_layout()
	get_viewport().size_changed.connect(_update_layout)
	visible = _is_touch_device()


func _is_touch_device() -> bool:
	return OS.has_feature("mobile") or DisplayServer.is_touchscreen_available()


func _update_layout() -> void:
	var vp: Vector2 = get_viewport_rect().size
	_pad_radius = clampf(minf(vp.x, vp.y) * 0.16, 70.0, 150.0)
	_pad_center = Vector2(vp.x * 0.5, vp.y - _pad_radius - 28.0)
	var bw: float = _pad_radius * 0.95
	var bh: float = _pad_radius * 0.7
	var gap: float = 26.0
	_phase_rect = Rect2(Vector2(_pad_center.x - _pad_radius - bw - gap, _pad_center.y - bh * 0.5), Vector2(bw, bh))
	_slip_rect = Rect2(Vector2(_pad_center.x + _pad_radius + gap, _pad_center.y - bh * 0.5), Vector2(bw, bh))
	queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
	# F2 force-toggles the overlay on desktop for testing (works even when hidden).
	var k := event as InputEventKey
	if k != null and k.pressed and not k.echo and k.keycode == KEY_F2:
		visible = not visible
		get_viewport().set_input_as_handled()
		return
	if not visible or queue == null or gm == null:
		return
	# Only the gameplay hex pad + Phase/Slip buttons live here (touch devices). Menu,
	# upgrade cards, pause END RUN, and dead-retry are handled by PointerHandler
	# (always active, so desktop mouse works for those everywhere).
	if gm.state != GameState.PLAYING:
		return
	var pos = _press_pos(event)
	if pos == null:
		return
	if _phase_rect.has_point(pos):
		queue.request_phase()
		get_viewport().set_input_as_handled()
	elif _slip_rect.has_point(pos):
		queue.request_slip()
		get_viewport().set_input_as_handled()
	else:
		var rel: Vector2 = pos - _pad_center
		if rel.length() <= _pad_radius:
			queue.enqueue(wedge_index(rel))
			get_viewport().set_input_as_handled()


## Press position from a touch / left-mouse press event, else null.
func _press_pos(event: InputEvent) -> Variant:
	var st := event as InputEventScreenTouch
	if st != null and st.pressed:
		return st.position
	var mb := event as InputEventMouseButton
	if mb != null and mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
		return mb.position
	return null


## Map a pad-relative offset to a direction index 0..5 (clockwise from N). Screen
## coords (y-down): 0=east, +90=south. The 6 wedge centers sit at -90+60*i degrees.
static func wedge_index(rel: Vector2) -> int:
	var angle: float = posmod(rad_to_deg(atan2(rel.y, rel.x)), 360.0)
	return posmod(roundi((angle - 270.0) / 60.0), 6)


func _draw() -> void:
	if not visible or gm == null:
		return
	if gm.state == GameState.PLAYING:
		_draw_pad()
	elif gm.state == GameState.MENU:
		_draw_hint("TAP TO START")


func _draw_pad() -> void:
	var fill: Color = Color(1, 1, 1, 0.07)
	var edge: Color = Color(1, 1, 1, 0.30)
	var letter: Color = Color(1, 1, 1, 0.75)
	# 6 wedges (a 60deg fan clockwise from up).
	for i in range(6):
		var a0: float = deg_to_rad(-90.0 + 60.0 * i - 30.0)
		var a1: float = deg_to_rad(-90.0 + 60.0 * i + 30.0)
		var p0: Vector2 = _pad_center + Vector2(cos(a0), sin(a0)) * _pad_radius
		var p1: Vector2 = _pad_center + Vector2(cos(a1), sin(a1)) * _pad_radius
		draw_colored_polygon(PackedVector2Array([_pad_center, p0, p1]), fill)
		draw_polyline(PackedVector2Array([p0, _pad_center, p1]), edge, 1.5, true)
	# Direction letters at each wedge center.
	var letters: Array = ["W", "E", "D", "S", "A", "Q"]  # N, NE, SE, S, SW, NW
	for i in range(6):
		var ang: float = deg_to_rad(-90.0 + 60.0 * i)
		var lp: Vector2 = _pad_center + Vector2(cos(ang), sin(ang)) * (_pad_radius * 0.6)
		draw_string(_font(), lp - Vector2(6, -6), letters[i], HORIZONTAL_ALIGNMENT_LEFT, -1, 18, letter)
	_draw_button(_phase_rect, "PHASE")
	_draw_button(_slip_rect, "SLIP")


func _draw_button(rect: Rect2, label: String) -> void:
	draw_rect(rect, Color(1, 1, 1, 0.07), true)
	draw_rect(rect, Color(1, 1, 1, 0.30), false, 1.5)
	var ts: Vector2 = _font().get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 16)
	draw_string(_font(), rect.position + (rect.size - ts) * 0.5, label, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(1, 1, 1, 0.8))


func _draw_hint(text: String) -> void:
	var ts: Vector2 = _font().get_string_size(text, HORIZONTAL_ALIGNMENT_CENTER, -1, 26)
	draw_string(_font(), Vector2(get_viewport_rect().size.x * 0.5 - ts.x * 0.5, get_viewport_rect().size.y * 0.62), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 26, Color(1, 1, 1, 0.55))


func _font() -> Font:
	if _font_cache == null:
		var probe := Control.new()
		add_child(probe)
		_font_cache = probe.get_theme_default_font()
		probe.queue_free()
	return _font_cache
