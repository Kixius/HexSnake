class_name World
extends Node2D
## Draws the world + simple HUD/menu/death text. Port of the Canvas2D drawing in
## src/render/Renderer.ts (subset for Phase 1: grid, walls/slime, essence, snake with
## index-aligned interpolation, eyes). Portal / obstacles / core / spore / acid / VFX
## land with their phases. UI is hand-drawn here for the milestone; Phase 4 promotes it
## to Control nodes.
##
## NOTE (perf): this redraws the whole world every frame, which is fine for the Phase 1
## desktop milestone. Phase 4 / mobile will split into ArenaView (redraw on tick) +
## SnakeView (per-frame lerp) per the architecture plan so mobile stays 60fps.

var gm: GameManager = null
var menu: Node = null  # godot/ui/menu_controller.gd (set by main.gd); null under `-s`

var radius: int = 11
var hex_size: float = 20.0
var offset_x: float = 0.0
var offset_y: float = 0.0
var font: Font = null
# Hit-rects rebuilt each frame for mouse hit-testing (PointerHandler reads these).
var _upgrade_card_rects: Array[Rect2] = []
var _end_run_rect: Rect2 = Rect2()


func _ready() -> void:
	radius = Config.RADIUS
	# Grab the engine default font without depending on the ThemeDB singleton API
	# (a transient Control resolves the project default theme for us).
	var probe := Control.new()
	add_child(probe)
	font = probe.get_theme_default_font()
	probe.queue_free()
	_update_layout()
	get_viewport().size_changed.connect(_update_layout)


func _update_layout() -> void:
	var vp: Vector2 = get_viewport_rect().size
	var cells: Array[Vector2i] = Hex.hexes_in_radius(radius)
	var min_cx: float = INF
	var max_cx: float = -INF
	var min_cy: float = INF
	var max_cy: float = -INF
	for c in cells:
		var p: Vector2 = Hex.hex_to_pixel(c, 1.0)
		min_cx = min(min_cx, p.x)
		max_cx = max(max_cx, p.x)
		min_cy = min(min_cy, p.y)
		max_cy = max(max_cy, p.y)
	var center_w: float = max_cx - min_cx
	var center_h: float = max_cy - min_cy
	var unit_w: float = center_w + 2.0  # +2 for flat-top half-widths both sides
	var unit_h: float = center_h + sqrt(3.0)  # +sqrt(3) for vertical half-extents
	var avail_w: float = vp.x - 2.0 * Config.MARGIN
	var avail_h: float = vp.y - 2.0 * Config.MARGIN
	hex_size = max(6.0, min(avail_w / unit_w, avail_h / unit_h))
	offset_x = (vp.x - center_w * hex_size) / 2.0 - min_cx * hex_size
	offset_y = (vp.y - center_h * hex_size) / 2.0 - min_cy * hex_size


func to_screen(h: Vector2i) -> Vector2:
	var p: Vector2 = Hex.hex_to_pixel(h, hex_size)
	return Vector2(offset_x + p.x, offset_y + p.y)


## Play a UI SFX (hover/click) via the AudioManager autoload (node path). Used by the
## menu widgets during _draw.
func _sfx(id: String) -> void:
	var a: Node = get_node_or_null("/root/AudioManager")
	if a != null:
		a.call("play_sfx", id)


func _draw() -> void:
	if gm == null:
		return
	var vp: Vector2 = get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, vp), Palette.color("bg"))
	match gm.state:
		GameState.MENU:
			_draw_menu(vp)
		_:
			if gm.state == GameState.DEAD and gm.run_summary != null:
				_apply_death_zoom()  # cinematic: zoom the WORLD into the death point
				_draw_world()
				draw_set_transform_matrix(Transform2D.IDENTITY)  # reset BEFORE HUD/overlay
			else:
				_draw_world()
			_draw_hud(vp)
			if gm.state == GameState.UPGRADE_SELECT:
				_draw_upgrade_select(vp)
			elif gm.state == GameState.DEAD and gm.run_summary != null:
				_draw_death(vp, gm.run_summary, gm.death_reveal_frac())
			if gm.paused:
				_draw_paused(vp)
			_draw_respawn_flash(vp)


# ---- world layers ----

func _draw_world() -> void:
	_draw_grid()
	_draw_walls_and_slime()
	_draw_core()
	_draw_acid()
	_draw_essence()
	_draw_spore()
	_draw_portal()
	_draw_obstacles()
	_draw_snake()


func _draw_grid() -> void:
	if gm.floor == null:
		return
	var grid: GridManager = gm.floor.grid
	for c in grid.cells:
		_draw_hex(to_screen(c), hex_size, Palette.color("grid"), Palette.color("grid_edge"), 1.0)
	# Arena border: bold teal edge on the outermost ring.
	for c in grid.cells:
		if _is_border(c):
			_draw_hex_outline(to_screen(c), hex_size, Palette.color("arena_edge"), 1.5)


func _draw_walls_and_slime() -> void:
	if gm.floor == null:
		return
	var grid: GridManager = gm.floor.grid
	for c in grid.cells:
		var occ: int = grid.occupant_of(c)
		var p: Vector2 = to_screen(c)
		if occ == Occupant.WALL:
			_draw_hex(p, hex_size * 0.96, Palette.color("wall"), Palette.color("wall_edge"), 1.5)
		elif occ == Occupant.SLIME:
			_draw_hex(p, hex_size * 0.92, Palette.color("slime"), Palette.color("slime_edge"), 1.5)


func _draw_essence() -> void:
	if gm.floor == null:
		return
	var grid: GridManager = gm.floor.grid
	var now: float = float(Time.get_ticks_msec())
	var pulse: float = 0.5 + 0.5 * sin(now / 300.0)
	var r: float = hex_size * (0.3 + 0.05 * pulse)
	for c in grid.cells:
		if grid.occupant_of(c) == Occupant.ESSENCE:
			var p: Vector2 = to_screen(c)
			_draw_soft_glow(p, hex_size * 0.42, Palette.color("essence"), pulse)
			_draw_circle(p, r + hex_size * 0.18, _alpha(Palette.color("essence"), 0.25))
			_draw_circle(p, r, Palette.color("essence"))


# Acidic Trail wake: lingering acid pools left on vacated hexes. Intensity fades as
# each pool decays (snake.acid_fraction). Empty unless the Acidic Trail card is active.
func _draw_acid() -> void:
	if gm.snake == null or gm.snake.acidic_hexes.is_empty():
		return
	var snake: SnakeController = gm.snake
	var tmax: float = float(snake.acid_ttl_max) if snake.acid_ttl_max > 0 else 8.0
	# Interpolate the decay across the current tick via render_alpha so the fade is
	# continuous (not a per-tick step): the pool ages from ttl toward ttl-1 each tick.
	var frac_offset: float = gm.render_alpha
	for hex in snake.acidic_hexes:
		var ttl: float = float(snake.acid_ttl.get(hex, 0))
		var frac: float = clampf((ttl - frac_offset) / tmax, 0.0, 1.0)
		if frac <= 0.0:
			continue
		var p: Vector2 = to_screen(hex)
		var fill: Color = Palette.color("acid")
		fill.a = 0.5 * frac
		var edge: Color = Palette.color("acid")
		edge.a = 0.65 * frac
		# Shrink + fade as the pool decays -> a smooth fade-away.
		_draw_hex(p, hex_size * (0.82 + 0.18 * frac), fill, edge, 1.0)


# Spore pellet: a beneficial slow-pickup. A pulsing green downward triangle + soft glow.
func _draw_spore() -> void:
	if gm.floor == null:
		return
	var grid: GridManager = gm.floor.grid
	var pulse: float = 0.5 + 0.5 * sin(float(Time.get_ticks_msec()) / 350.0)
	for c in grid.cells:
		if grid.occupant_of(c) != Occupant.SPORE:
			continue
		var p: Vector2 = to_screen(c)
		_draw_soft_glow(p, hex_size * 0.50, Palette.color("spore"), pulse)
		_draw_triangle(p, hex_size * 0.30, Palette.color("spore"))


func _draw_triangle(center: Vector2, half: float, color: Color) -> void:
	# Pointing down (the spore pellet silhouette).
	var pts := PackedVector2Array()
	pts.append(center + Vector2(0.0, half))
	pts.append(center + Vector2(half * 0.866, -half * 0.5))
	pts.append(center + Vector2(-half * 0.866, -half * 0.5))
	draw_colored_polygon(pts, color)


# Chamber Core: hidden until the snake is within reveal range (max(4, radar_radius)),
# then shown as a gold rotating 4-point star (port of Renderer.drawCore). Radar cards
# extend the range; default reveals within 4 hexes.
func _draw_core() -> void:
	if gm.floor == null or gm.snake == null:
		return
	var grid: GridManager = gm.floor.grid
	var core: Vector2i = Vector2i.ZERO
	var found: bool = false
	for c in grid.cells:
		if grid.occupant_of(c) == Occupant.CHAMBER_CORE:
			core = c
			found = true
			break
	if not found:
		return
	if Hex.distance(core, gm.snake.head()) > maxi(4, gm.snap.radar_radius):
		return  # hidden until sensed
	var p: Vector2 = to_screen(core)
	var spin: float = float(Time.get_ticks_msec()) / 220.0
	var rad: float = hex_size * 0.42
	_draw_soft_glow(p, rad * 0.85, Palette.color("gold"), 0.5 + 0.5 * sin(float(Time.get_ticks_msec()) / 300.0))
	# 4-point star: outer + inner points alternating.
	var pts := PackedVector2Array()
	for k in range(4):
		var ang_out: float = spin + float(k) * (TAU / 4.0)
		var ang_in: float = spin + (float(k) + 0.5) * (TAU / 4.0)
		pts.append(p + Vector2(cos(ang_out), sin(ang_out)) * rad)
		pts.append(p + Vector2(cos(ang_in), sin(ang_in)) * (rad * 0.4))
	draw_colored_polygon(pts, Palette.color("gold"))


# The portal: three rings expanding outward + a bright core. Drawn only once the snake
# has collected enough essence (gm.portal_active). Port of Renderer.drawPortal.
func _draw_portal() -> void:
	if gm.floor == null or not gm.portal_active:
		return
	var grid: GridManager = gm.floor.grid
	var portal: Vector2i = Vector2i.ZERO
	var found: bool = false
	for c in grid.cells:
		if grid.occupant_of(c) == Occupant.PORTAL:
			portal = c
			found = true
			break
	if not found:
		return
	var p: Vector2 = to_screen(portal)
	var t: float = float(Time.get_ticks_msec()) / 500.0
	_draw_soft_glow(p, hex_size * 0.42, Palette.color("portal"), 0.5 + 0.5 * sin(t * TAU))
	for ring in range(3):
		var phase: float = fposmod(t + float(ring) * 0.33, 1.0)
		var rad: float = hex_size * (0.25 + 0.55 * phase)
		var lw: float = 3.0 * (1.0 - phase) + 1.0
		var col: Color = Palette.color("portal_bright") if ring == 1 else Palette.color("portal")
		col.a = 1.0 - phase
		_draw_ring(p, rad, col, lw)
	_draw_circle(p, hex_size * 0.18, Palette.color("portal_bright"))


# Roaming obstacles: a hex plus a spinning warning square. They glide one hex over
# OBSTACLE_MOVE_EVERY ticks, so the lerp spans that period (not the per-tick alpha the
# snake uses) — `move_counter` counts down across exactly one hex-to-hex glide. Port of
# Renderer.drawObstacles.
func _draw_obstacles() -> void:
	if gm.floor == null:
		return
	var period: int = Config.OBSTACLE_MOVE_EVERY
	var now: float = float(Time.get_ticks_msec())
	for o in gm.floor.obstacles:
		var phase: float
		if period > 0:
			phase = minf(1.0, (float(period) - float(o.move_counter) + gm.render_alpha) / float(period))
		else:
			phase = gm.render_alpha
		var pos: Vector2 = to_screen(o.prev_hex).lerp(to_screen(o.hex), phase)
		_draw_hex(pos, hex_size * 0.9, Palette.color("obstacle"), Palette.color("obstacle_edge"), 2.0)
		_draw_rotated_square(pos, hex_size * 0.16, now / 400.0, Palette.color("portal_bright"))


func _draw_snake() -> void:
	if gm.snake == null:
		return
	var snake: SnakeController = gm.snake
	var segs: Array[Vector2i] = snake.segments
	var prev: Array[Vector2i] = snake.prev_segments
	var n: int = segs.size()
	var alpha: float = gm.render_alpha
	# Phase Shifter: ghost the snake while phasing through its own body.
	var phase_a: float = 0.5 if snake.is_phasing(float(Time.get_ticks_msec())) else 1.0

	# Body (tail to neck) so the head draws on top. Index-aligned lerp prev[i] -> segs[i];
	# `prev[i] ?? cur` handles growth (a brand-new trailing segment has no prev => stationary).
	for i in range(n - 1, 0, -1):
		var cur: Vector2i = segs[i]
		var pv: Vector2i = prev[i] if i < prev.size() else cur
		var pos: Vector2 = to_screen(pv).lerp(to_screen(cur), alpha)
		var t: float = float(i) / float(maxi(1, n - 1))
		var fill: Color = Palette.color("snake_body_bright").lerp(Palette.color("snake_body"), t)
		fill.a *= phase_a
		var edge: Color = Palette.color("snake_outline")
		edge.a *= phase_a
		_draw_hex(pos, hex_size * 0.84, fill, edge, 1.5)

	# Head.
	var head: Vector2i = segs[0]
	var hpv: Vector2i = prev[0] if prev.size() > 0 else head
	var hpos: Vector2 = to_screen(hpv).lerp(to_screen(head), alpha)
	var head_fill: Color = Palette.color("snake_head")
	head_fill.a *= phase_a
	var head_edge: Color = Palette.color("snake_outline")
	head_edge.a *= phase_a
	_draw_hex(hpos, hex_size * 0.92, head_fill, head_edge, 2.0)
	_draw_eyes(hpos, snake.heading)


func _draw_eyes(pos: Vector2, heading: int) -> void:
	# Facing: heading 0 = North = straight up (-PI/2), rotating PI/3 clockwise per direction.
	var ang: float = (PI / 3.0) * heading - PI / 2.0
	var f: Vector2 = Vector2(cos(ang), sin(ang))  # unit forward
	var perp: Vector2 = Vector2(-f.y, f.x)  # unit perpendicular
	var fwd: float = hex_size * 0.28
	var side: float = hex_size * 0.26
	for s in [-1, 1]:
		var e: Vector2 = pos + f * fwd + perp * (side * s)
		_draw_circle(e, hex_size * 0.12, Palette.color("bg"))
		_draw_circle(e + f * (hex_size * 0.04), hex_size * 0.05, Palette.color("text"))


# ---- overlays ----

func _draw_hud(vp: Vector2) -> void:
	var needed: int = gm.floor.essence_needed if gm.floor != null else 0
	_text("SCORE %d   DEPTH %d" % [gm.score, gm.depth], Vector2(16, 24), 20, Palette.color("text"), HORIZONTAL_ALIGNMENT_LEFT)
	if gm.portal_active:
		_text("PORTAL OPEN — reach the gate", Vector2(16, 48), 16, Palette.color("portal"), HORIZONTAL_ALIGNMENT_LEFT)
	else:
		_text("ESSENCE %d/%d" % [gm.essence_collected, needed], Vector2(16, 48), 16, Palette.color("text_dim"), HORIZONTAL_ALIGNMENT_LEFT)
	# Lives (filled dots) + empty slots, top-right. Always shows MAX_LIVES slots: at the
	# 3-life start that's 3 filled + 2 empty; gaining/losing fills/empties them; on death
	# all go empty (you lose every heart).
	var slots: int = Config.MAX_LIVES
	var filled: int = 0 if gm.state == GameState.DEAD else gm.snap.lives
	filled = clampi(filled, 0, slots)
	var hsize: float = 14.0
	var hgap: float = 8.0
	var hy: float = 30.0
	for i in range(slots):
		var cx: float = vp.x - 22.0 - hsize * 0.5 - float(slots - 1 - i) * (hsize + hgap)
		if i < filled:
			_draw_life_dot(Vector2(cx, hy), hsize, Palette.color("danger"))
		else:
			_draw_ring(Vector2(cx, hy), hsize * 0.42, _alpha(Palette.color("danger"), 0.3), 1.5)
	# Armor (Chitinous Shell) on its own line below the lives so they don't overlap.
	if gm.snap.wall_charges > 0 and gm.snake != null:
		var remaining: int = gm.snake.wall_charges_remaining(gm.snap)
		var ay: float = 54.0
		var rem_txt: String = "x%d" % remaining
		var rtw: float = font.get_string_size(rem_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
		var shield_cx: float = vp.x - 26.0
		_draw_shield(Vector2(shield_cx, ay), 12.0, Color("#3b82f6"))
		var acy: float = _vcenter(Rect2(Vector2(0.0, ay - 12.0), Vector2(40.0, 24.0)), 16)
		_text(rem_txt, Vector2(shield_cx - 10.0 - rtw, acy), 16, Palette.color("text"), HORIZONTAL_ALIGNMENT_LEFT)
	# Active mutations (the build), down the left margin.
	var mut_y: float = 76.0
	for m in gm.upgrades.active:
		var label: String = m.def.name
		if m.stacks > 1:
			label += " x%d" % m.stacks
		_text(label, Vector2(16, mut_y), 13, Registry.rarity_fixed_color(m.def.rarity), HORIZONTAL_ALIGNMENT_LEFT)
		mut_y += 16.0
		if mut_y > 220.0:
			break
	# Active-ability cooldown bars (Phase Shifter / Diagonal Slip), bottom-left, only
	# when the card is owned. Reads the live phase/slip state from the snake.
	if gm.snake != null:
		var now_ab: float = float(Time.get_ticks_msec())
		var pk: String = Keybinds.key_label(int(Settings.keybinds.get("phase", KEY_SPACE)))
		var sk: String = Keybinds.key_label(int(Settings.keybinds.get("slip", KEY_SHIFT)))
		if bool(gm.snake.phase_state(gm.snap, now_ab).get("enabled", false)):
			_draw_ability_bar(Vector2(16.0, vp.y - 84.0), "PHASE", pk, gm.snake.phase_state(gm.snap, now_ab), Palette.color("acid"))
		if bool(gm.snake.slip_state(gm.snap, now_ab).get("enabled", false)):
			_draw_ability_bar(Vector2(16.0, vp.y - 48.0), "SLIP", sk, gm.snake.slip_state(gm.snap, now_ab), Palette.color("gold"))


# ---- upgrade select (Phase 3) ----

# Dim the world, show 3 cards, glow the chosen one + fade the rest as the pick
# animation runs. Port of Overlays.drawUpgradeSelect (hand-drawn; Phase 4 will
# promote this to Control nodes).
func _draw_upgrade_select(vp: Vector2) -> void:
	draw_rect(Rect2(Vector2.ZERO, vp), Color(0.03, 0.04, 0.055, 0.82))
	var choices: Array[MutationDef] = gm.choices
	var n: int = choices.size()
	if n == 0:
		return
	var card_w: float = minf(260.0, vp.x * 0.26)
	var card_h: float = minf(320.0, vp.y * 0.46)
	var gap: float = 24.0
	var total_w: float = float(n) * card_w + float(n - 1) * gap
	var start_x: float = (vp.x - total_w) / 2.0
	var y: float = (vp.y - card_h) / 2.0 + 10.0
	_text("MUTATION", Vector2(0, vp.y * 0.16), 34, Palette.color("gold"), HORIZONTAL_ALIGNMENT_CENTER, vp.x)
	_text("choose one - press 1 / 2 / 3", Vector2(0, vp.y * 0.16 + 40.0), 15, Palette.color("text_dim"), HORIZONTAL_ALIGNMENT_CENTER, vp.x)
	var pick_i: int = gm.pick_index
	var frac: float = gm.pick_frac()
	var mp: Vector2 = get_viewport().get_mouse_position()
	_upgrade_card_rects.clear()
	for i in range(n):
		var def: MutationDef = choices[i]
		var x: float = start_x + float(i) * (card_w + gap)
		var box := Rect2(Vector2(x, y), Vector2(card_w, card_h))
		_upgrade_card_rects.append(box)  # base box for click hit-testing
		var glow: float = 0.0
		var alpha: float = 1.0
		var draw_box: Rect2 = box
		if pick_i >= 0:
			if i == pick_i:
				glow = 16.0 + 26.0 * frac
			else:
				alpha = 1.0 - 0.8 * frac
		elif box.has_point(mp):
			# Hover: subtle scale-up + glow (mirrors the TS 1.04 + halo).
			glow = 18.0
			draw_box = box.grow(card_w * 0.03)
		_draw_card(def, draw_box, i, glow, alpha)


func _draw_card(def: MutationDef, box: Rect2, index: int, glow: float, alpha: float) -> void:
	var col: Color = Registry.rarity_fixed_color(def.rarity)
	if glow > 0.0:
		# Rarity-colored halo behind the card, growing with the pick animation.
		var halo_a: float = minf(1.0, 0.35 + glow * 0.012)
		draw_rect(box.grow(2.0 + glow * 0.5), Color(col.r, col.g, col.b, halo_a), true)
	if alpha < 1.0:
		col.a *= alpha
	var bg: Color = Color(0.07, 0.09, 0.13, 0.6 * alpha)
	draw_rect(box, bg, true)  # body
	draw_rect(Rect2(box.position.x, box.position.y, box.size.x, 6.0), col, true)  # rarity band
	draw_rect(box, col, false, 2.0)  # border
	var pad: float = 18.0
	var text_col: Color = Palette.color("text")
	var dim_col: Color = Palette.color("text_dim")
	var flav_col: Color = col
	if alpha < 1.0:
		text_col.a *= alpha
		dim_col.a *= alpha
		flav_col.a *= alpha
	flav_col.a *= 0.75
	# Rarity label.
	draw_string(font, Vector2(box.position.x + pad, box.position.y + 22.0), def.rarity.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, col)
	# Name (wrapped).
	_wrap_text(def.name, Vector2(box.position.x + pad, box.position.y + 52.0), box.size.x - pad * 2.0, 26.0, 22, text_col)
	# Flavor (dimmed rarity color).
	if def.flavor != "":
		_wrap_text(def.flavor, Vector2(box.position.x + pad, box.position.y + 100.0), box.size.x - pad * 2.0, 16.0, 13, flav_col)
	# Description.
	_wrap_text(def.description, Vector2(box.position.x + pad, box.position.y + 140.0), box.size.x - pad * 2.0, 22.0, 15, dim_col)
	# Pick badge (upgrade-select only; index < 0 = none, e.g. the card gallery).
	if index >= 0:
		var badge: Color = Palette.color("gold")
		if alpha < 1.0:
			badge.a *= alpha
		draw_string(font, Vector2(box.position.x + pad, box.position.y + box.size.y - 34.0), "[ %d ]" % (index + 1), HORIZONTAL_ALIGNMENT_LEFT, -1, 16, badge)


## Greedy word-wrap: draws `text` left-aligned within `max_w`, returns the last y used.
func _wrap_text(text: String, pos: Vector2, max_w: float, line_h: float, size: int, color: Color) -> float:
	var words: PackedStringArray = text.split(" ", false)
	var line: String = ""
	var y: float = pos.y
	for word in words:
		var test: String = line + (" " if line != "" else "") + word
		if line != "" and font.get_string_size(test, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x > max_w:
			draw_string(font, Vector2(pos.x, y), line, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)
			line = word
			y += line_h
		else:
			line = test
	if line != "":
		draw_string(font, Vector2(pos.x, y), line, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)
		y += line_h
	return y


func _draw_menu(vp: Vector2) -> void:
	if menu != null:
		menu.call("render", self, vp)
		return
	# Fallback (no MenuController, e.g. a stray headless render): bare title.
	var w := vp.x
	_text("HEXSNAKE", Vector2(0, vp.y * 0.4), 64, Palette.color("teal"), HORIZONTAL_ALIGNMENT_CENTER, w)
	_text("press ENTER to start", Vector2(0, vp.y * 0.5), 22, Palette.color("text"), HORIZONTAL_ALIGNMENT_CENTER, w)


## Cinematic: zoom the world into the snake head (death point) over DEATH_ZOOM_MS.
## Applied via draw_set_transform_matrix; caller MUST reset to identity before HUD/overlay.
func _apply_death_zoom() -> void:
	if gm == null or gm.snake == null:
		return
	var t: float = gm.death_zoom_frac()
	var eased: float = 1.0 - pow(1.0 - t, 3.0)  # easeOutCubic
	var s: float = 1.0 + (gm.DEATH_ZOOM_TO - 1.0) * eased
	var hp: Vector2 = to_screen(gm.snake.head())
	# p' = s*p + origin with origin = hp*(1-s) => hp is the fixed focal point.
	draw_set_transform_matrix(Transform2D(Vector2(s, 0.0), Vector2(0.0, s), hp * (1.0 - s)))


func _death_reason_name(reason: int) -> String:
	match reason:
		DeathReason.WALL:
			return "WALL"
		DeathReason.OBSTACLE:
			return "OBSTACLE"
		DeathReason.SLIME:
			return "SLIME"
		DeathReason.SELF:
			return "SELF"
		_:
			return "UNKNOWN"


## Death / end-run summary. Port of Overlays.drawDeath: staggered smoothstep reveal
## driven by `reveal` (0..1). YOU DIED (red) vs RUN ENDED (gold); slain-by reason only
## on a real death; DIFFICULTY/DEPTH/SCORE/LENGTH stats; BUILD list; pulsing retry.
func _draw_death(vp: Vector2, summary: RunSummary, reveal: float) -> void:
	var w := vp.x
	var _stage := func(a: float, b: float) -> float:
		var t: float = clampf((reveal - a) / (b - a), 0.0, 1.0)
		return t * t * (3.0 - 2.0 * t)  # smoothstep

	# Backdrop dims in first.
	draw_rect(Rect2(Vector2.ZERO, vp), Color(0.04, 0.05, 0.08, 0.85 * _stage.call(0.0, 0.32)))

	# Title: fades in + slides down ~30px.
	var t_title: float = _stage.call(0.18, 0.6)
	if t_title > 0.0:
		var ty: float = vp.y * 0.22 + (1.0 - t_title) * -30.0
		var title: String = "RUN ENDED" if summary.ended else "YOU DIED"
		var col: Color = Palette.color("gold") if summary.ended else Palette.color("danger")
		col.a = t_title
		_text(title, Vector2(0, ty), 56, col, HORIZONTAL_ALIGNMENT_CENTER, w)

	# Slain-by reason (skipped for a voluntary end).
	var t_reason: float = _stage.call(0.42, 0.68)
	if t_reason > 0.0 and not summary.ended and summary.reason >= 0:
		var rcol: Color = Palette.color("text_dim")
		rcol.a = t_reason
		_text("slain by: %s" % _death_reason_name(summary.reason), Vector2(0, vp.y * 0.22 + 48.0), 16, rcol, HORIZONTAL_ALIGNMENT_CENTER, w)

	# Stat lines (staggered): label left of center, value right of center.
	var lines: Array = [
		["DIFFICULTY", summary.difficulty],
		["DEPTH REACHED", str(summary.depth)],
		["FINAL SCORE", str(summary.score)],
		["LENGTH", str(summary.length)],
	]
	var y: float = vp.y * 0.38
	for i in range(lines.size()):
		var t_line: float = _stage.call(0.55 + float(i) * 0.05, 0.72 + float(i) * 0.05)
		if t_line > 0.0:
			var kcol: Color = Palette.color("text_dim")
			kcol.a = t_line
			var vcol: Color = Palette.color("teal")
			vcol.a = t_line
			_text(lines[i][0], Vector2(w * 0.5 - 60.0, y), 16, kcol, HORIZONTAL_ALIGNMENT_LEFT)
			_text(lines[i][1], Vector2(w * 0.5 + 80.0, y), 20, vcol, HORIZONTAL_ALIGNMENT_LEFT)
		y += 34.0

	# Build (active mutations).
	var t_build: float = _stage.call(0.74, 0.92)
	y += 14.0
	if t_build > 0.0:
		var gcol: Color = Palette.color("gold")
		gcol.a = t_build
		_text("BUILD", Vector2(0, y), 16, gcol, HORIZONTAL_ALIGNMENT_CENTER, w)
		y += 28.0
		if summary.mutations.is_empty():
			var dcol: Color = Palette.color("text_dim")
			dcol.a = t_build
			_text("(no mutations)", Vector2(0, y), 14, dcol, HORIZONTAL_ALIGNMENT_CENTER, w)
		else:
			for m in summary.mutations:
				var mcol: Color = Palette.color("text")
				mcol.a = t_build
				var label: String = m["name"]
				if int(m["stacks"]) > 1:
					label += " x%d" % int(m["stacks"])
				_text(label, Vector2(0, y), 14, mcol, HORIZONTAL_ALIGNMENT_CENTER, w)
				y += 22.0

	# Retry prompt — appears last, keeps its pulse.
	var t_enter: float = _stage.call(0.9, 1.0)
	if t_enter > 0.0:
		var pulse: float = 0.5 + 0.5 * sin(float(Time.get_ticks_msec()) / 400.0)
		var pcol: Color = Palette.color("gold")
		pcol.a = t_enter * (0.5 + 0.5 * pulse)
		var prompt: String = "PRESS ENTER TO CONTINUE" if summary.ended else "PRESS ENTER TO TRY AGAIN"
		_text(prompt, Vector2(0, vp.y - 50.0), 18, pcol, HORIZONTAL_ALIGNMENT_CENTER, w)


func _draw_paused(vp: Vector2) -> void:
	var w := vp.x
	draw_rect(Rect2(Vector2.ZERO, vp), Color(0.03, 0.04, 0.05, 0.6))
	_text("PAUSED", Vector2(0, vp.y * 0.5), 40, Palette.color("text"), HORIZONTAL_ALIGNMENT_CENTER, w)
	_text("press P to resume", Vector2(0, vp.y * 0.5 + 36.0), 16, Palette.color("text_dim"), HORIZONTAL_ALIGNMENT_CENTER, w)
	# END RUN button — abandon the run -> RUN ENDED summary (mouse-clickable via _end_run_rect).
	var bw: float = 200.0
	var bh: float = 46.0
	var bx: float = (w - bw) / 2.0
	var by: float = vp.y * 0.5 + 78.0
	_end_run_rect = Rect2(Vector2(bx, by), Vector2(bw, bh))
	var hover: bool = _end_run_rect.has_point(get_viewport().get_mouse_position())
	draw_rect(_end_run_rect, Palette.color("grid"), true)
	if hover:
		draw_rect(_end_run_rect, _alpha(Palette.color("danger"), 0.2), true)
	draw_rect(_end_run_rect, Palette.color("danger"), false, 2.0)
	_text("END RUN", Vector2(bx, _vcenter(_end_run_rect, 18)), 18, Palette.color("danger") if hover else Palette.color("text"), HORIZONTAL_ALIGNMENT_CENTER, bw)
	_text("click or press BACKSPACE to end the run", Vector2(0, by + bh + 16.0), 13, Palette.color("text_dim"), HORIZONTAL_ALIGNMENT_CENTER, w)


func _draw_respawn_flash(vp: Vector2) -> void:
	var frac: float = gm.respawn_flash_frac()
	if frac <= 0.0:
		return
	draw_rect(Rect2(Vector2.ZERO, vp), _alpha(Palette.color("danger"), 0.30 * frac))


# ---- drawing primitives ----

func _hex_corners(center: Vector2, sz: float) -> PackedVector2Array:
	# Flat-top: corners at 0°, 60°, ... (60°*i). Corner 0 points right; flat edges top/bottom.
	var pts := PackedVector2Array()
	for i in 6:
		var a: float = deg_to_rad(60.0 * i)
		pts.append(center + Vector2(cos(a), sin(a)) * sz)
	return pts


func _draw_hex(center: Vector2, sz: float, fill: Color, edge: Color, edge_width: float) -> void:
	var pts := _hex_corners(center, sz)
	draw_colored_polygon(pts, fill)
	_draw_hex_outline(center, sz, edge, edge_width)


func _draw_hex_outline(center: Vector2, sz: float, edge: Color, edge_width: float) -> void:
	var pts := _hex_corners(center, sz)
	var closed := PackedVector2Array()
	for p in pts:
		closed.append(p)
	closed.append(pts[0])
	draw_polyline(closed, edge, edge_width, true)


func _draw_circle(center: Vector2, r: float, color: Color) -> void:
	var pts := PackedVector2Array()
	var n: int = 20
	for i in n:
		var a: float = TAU * float(i) / float(n)
		pts.append(center + Vector2(cos(a), sin(a)) * r)
	draw_colored_polygon(pts, color)


## Soft colored glow: a few concentric low-alpha circles. `pulse` (0..1) modulates the
## intensity so pickups breathe gently in their own color.
func _draw_soft_glow(center: Vector2, r: float, color: Color, pulse: float, intensity: float = 1.0) -> void:
	for k in range(5):
		var f: float = float(k) / 4.0  # 0..1 across the rings
		var ring_r: float = r * (0.6 + f * 0.9)  # 0.6r .. 1.5r
		var a: float = 0.16 * (1.0 - f) * (0.7 + 0.3 * pulse) * intensity  # smooth falloff
		_draw_circle(center, ring_r, Color(color.r, color.g, color.b, a))


## A pretty life "dot": a glossy red orb — soft glow + filled dot + a highlight speck.
func _draw_life_dot(center: Vector2, s: float, color: Color) -> void:
	_draw_soft_glow(center, s * 0.55, color, 0.5)
	_draw_circle(center, s * 0.42, color)
	_draw_circle(center + Vector2(-s * 0.13, -s * 0.13), s * 0.15, Color(1.0, 1.0, 1.0, 0.6))


## A shield icon for the armor (Chitinous Shell) counter.
func _draw_shield(center: Vector2, s: float, color: Color) -> void:
	var pts := PackedVector2Array([
		center + Vector2(-s * 0.5, -s * 0.45),
		center + Vector2(s * 0.5, -s * 0.45),
		center + Vector2(s * 0.5, s * 0.1),
		center + Vector2(0.0, s * 0.6),
		center + Vector2(-s * 0.5, s * 0.1),
	])
	draw_colored_polygon(pts, color)


## An active-ability cooldown bar (Phase Shifter / Diagonal Slip). `pos` is the block's
## top-left; the label + bound key + status sit on one line, the fill bar below. The
## bar reads ACTIVE (depleting, bright), cooling (depleting, dim), or READY (full).
func _draw_ability_bar(pos: Vector2, label: String, hint: String, state: Dictionary, color: Color) -> void:
	var bar_w: float = 180.0
	var bar_h: float = 12.0
	var line_rect: Rect2 = Rect2(pos, Vector2(bar_w, 18.0))
	_text(label, Vector2(pos.x, _vcenter(line_rect, 14)), 14, color, HORIZONTAL_ALIGNMENT_LEFT)
	_text(hint, Vector2(pos.x + 62.0, _vcenter(line_rect, 12)), 12, Palette.color("text_dim"), HORIZONTAL_ALIGNMENT_LEFT)
	# Resolve the fill fraction + status from the state.
	var frac: float = 1.0
	var fill_col: Color = color
	var status: String = "READY"
	if bool(state.get("active", false)):
		frac = float(state.get("active_frac", 0.0))
		status = "ACTIVE"
	elif not bool(state.get("ready", true)):
		frac = float(state.get("cooldown_frac", 0.0))
		fill_col = _alpha(color, 0.45)
		status = ""
	if status != "":
		var stw: float = font.get_string_size(status, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
		_text(status, Vector2(pos.x + bar_w - stw, _vcenter(line_rect, 12)), 12, color, HORIZONTAL_ALIGNMENT_LEFT)
	# The bar.
	var bar_rect: Rect2 = Rect2(pos.x, pos.y + 20.0, bar_w, bar_h)
	draw_rect(bar_rect, Palette.color("grid_edge"), true)
	if frac > 0.0:
		draw_rect(Rect2(bar_rect.position, Vector2(bar_w * frac, bar_h)), fill_col, true)
	draw_rect(bar_rect, color if bool(state.get("ready", true)) else Palette.color("grid_edge"), false, 1.5)


func _draw_ring(center: Vector2, r: float, color: Color, width: float) -> void:
	var pts := PackedVector2Array()
	var n: int = 24
	for i in n:
		var a: float = TAU * float(i) / float(n)
		pts.append(center + Vector2(cos(a), sin(a)) * r)
	pts.append(pts[0])  # close the loop
	draw_polyline(pts, color, width, true)


# A square centered on `center`, rotated `rot` radians — the obstacle warning marker.
func _draw_rotated_square(center: Vector2, half: float, rot: float, color: Color) -> void:
	var c: float = cos(rot)
	var s: float = sin(rot)
	var locals: Array[Vector2] = [
		Vector2(-half, -half),
		Vector2(half, -half),
		Vector2(half, half),
		Vector2(-half, half),
	]
	var pts := PackedVector2Array()
	for lc in locals:
		var rx: float = lc.x * c - lc.y * s
		var ry: float = lc.x * s + lc.y * c
		pts.append(center + Vector2(rx, ry))
	draw_colored_polygon(pts, color)


func _text(t: String, pos: Vector2, size: int, color: Color, align: int, width: float = -1.0) -> void:
	if font == null:
		return
	draw_string(font, pos, t, align, width, size, color)


func _alpha(col: Color, a: float) -> Color:
	return Color(col.r, col.g, col.b, a)


## Vertical-center baseline y for `size` text inside `rect`. Godot draw_string pos is
## the text baseline, so center via ascent/descent.
func _vcenter(rect: Rect2, size: int) -> float:
	return rect.position.y + rect.size.y * 0.5 + (font.get_ascent(size) - font.get_descent(size)) * 0.5


func _is_border(c: Vector2i) -> bool:
	return max(max(absi(c.x), absi(c.y)), absi(c.x + c.y)) == radius
