class_name EmissiveCanvas
extends Node2D
## Selective-bloom mask: paints ONLY the bloomable elements (snake head, essence, chamber
## core, portal, spore, menu title) as bright blobs on black. The bloom pipeline blurs
## THIS layer (not the full game), so only these elements get a glow. Uses the same
## coordinate system as World (reads world.to_screen + world.hex_size, which match since
## this viewport is the same size as GameView).

var gm: GameManager = null
var world: World = null


func _process(_delta: float) -> void:
	queue_redraw()  # redraw every frame so the emissive layer tracks the live game state


func _draw() -> void:
	var vp: Vector2 = get_viewport_rect().size
	# Clear to black — non-bloomable elements (walls, body, grid, obstacles) don't appear.
	draw_rect(Rect2(Vector2.ZERO, vp), Color.BLACK)
	if gm == null or world == null:
		return
	var hs: float = world.hex_size

	# Death cinematic: apply the same zoom-into-death-point as World._draw so the glow
	# zooms with the world (not frozen while the game zooms).
	if gm.state == GameState.DEAD and gm.run_summary != null and gm.snake != null:
		var t: float = gm.death_zoom_frac()
		var eased: float = 1.0 - pow(1.0 - t, 3.0)
		var s: float = 1.0 + (gm.DEATH_ZOOM_TO - 1.0) * eased
		var hp: Vector2 = world.to_screen(gm.snake.segments[0])
		draw_set_transform_matrix(Transform2D(Vector2(s, 0.0), Vector2(0.0, s), hp * (1.0 - s)))

	# Menu: bloom the title ONLY on the main title screen (not settings/keybinds/etc).
	if gm.state == GameState.MENU:
		var top_screen: String = ""
		if gm.menu != null:
			top_screen = String(gm.menu.call("top"))
		if top_screen == "main" and world.font != null:
			draw_string(world.font, Vector2(0, vp.y * 0.20), "HEXSNAKE", HORIZONTAL_ALIGNMENT_CENTER, vp.x, 34, Palette.color("gold"))
		draw_set_transform_matrix(Transform2D.IDENTITY)
		return
	if gm.floor == null:
		draw_set_transform_matrix(Transform2D.IDENTITY)
		return
	# Snake head — INTERPOLATED to match the visual head (World lerps by render_alpha too),
	# so the glow glides smoothly instead of stepping per hex.
	if gm.snake != null:
		var head_hex: Vector2i = gm.snake.segments[0]
		var prev_hex: Vector2i = gm.snake.prev_segments[0] if gm.snake.prev_segments.size() > 0 else head_hex
		var hpos: Vector2 = world.to_screen(prev_hex).lerp(world.to_screen(head_hex), gm.render_alpha)
		_blob(hpos, hs * 0.50, Palette.color("snake_head"))
	# Pickups + portal.
	var grid: GridManager = gm.floor.grid
	for c in grid.cells:
		var occ: int = grid.occupant_of(c)
		if occ == Occupant.EMPTY:
			continue
		var pos: Vector2 = world.to_screen(c)
		match occ:
			Occupant.ESSENCE:
				_blob(pos, hs * 0.40, Palette.color("essence"))
			Occupant.PORTAL:
				if gm.portal_active:
					_blob(pos, hs * 0.50, Palette.color("portal_bright"))
			Occupant.SPORE:
				_blob(pos, hs * 0.35, Palette.color("spore"))
			Occupant.CHAMBER_CORE:
				# Only if revealed (within radar range of the head).
				if gm.snake != null and Hex.distance(c, gm.snake.head()) <= maxi(4, gm.snap.radar_radius):
					_blob(pos, hs * 0.45, Palette.color("gold"))

	draw_set_transform_matrix(Transform2D.IDENTITY)  # reset after the death zoom


## A bright filled circle — the bloom source for one element.
func _blob(pos: Vector2, r: float, color: Color) -> void:
	draw_circle(pos, r, color)
