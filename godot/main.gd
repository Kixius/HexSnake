extends Node
## Entry point. The game (World) renders into a SubViewport so the bloom pipeline can
## sample it in isolated passes. Pipeline: World -> GameView (full-res SubViewport) ->
## BloomH (half-res: bright-pass + horizontal Gaussian) -> BloomV (half-res: vertical
## Gaussian) -> root canvas composite (TextureRect of the game + additive bloom).

var _bloom: Dictionary = {}  # {game_view, bloom_h, bloom_v} for resize


func _ready() -> void:
	var gm := GameManager.new()
	gm.name = "GameManager"
	add_child(gm)

	# The game renders into this SubViewport (sampled by the bloom passes below).
	var sz: Vector2i = Vector2i(get_viewport().get_visible_rect().size)
	var game_view := SubViewport.new()
	game_view.name = "GameView"
	game_view.size = sz
	game_view.disable_3d = true
	game_view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	game_view.gui_disable_input = true
	add_child(game_view)

	var world := World.new()
	world.name = "World"
	game_view.add_child(world)  # World draws into GameView
	gm.world = world
	world.gm = gm

	var router := InputRouter.new()
	router.name = "InputRouter"
	add_child(router)
	router.queue = gm.input_queue
	router.gm = gm

	# On-screen touch controls (Phase 5). Re-ordered to the top below so the pad draws
	# over the composited game + bloom.
	var touch := TouchControls.new()
	touch.name = "TouchControls"
	add_child(touch)
	touch.queue = gm.input_queue
	touch.gm = gm

	var pointer := PointerHandler.new()
	pointer.name = "PointerHandler"
	add_child(pointer)
	pointer.gm = gm
	pointer.world = world

	var menu := MenuController.new()
	menu.name = "MenuController"
	add_child(menu)
	menu.world = world
	menu.start_run_cb = Callable(gm, "start_run")
	gm.menu = menu
	world.menu = menu
	pointer.menu = menu

	# ---- Bloom pipeline (downsampled separable Gaussian -> smooth + wide + cheap). ----
	# SELECTIVE bloom: the emissive layer paints ONLY the bloomable elements (head,
	# essence, core, portal, spore, title) on black. The pipeline blurs THIS layer, not
	# the full game, so only those elements glow.
	var half: Vector2i = Vector2i(maxi(2, sz.x / 2), maxi(2, sz.y / 2))

	var emissive_view := SubViewport.new()
	emissive_view.name = "EmissiveView"
	emissive_view.size = sz
	emissive_view.disable_3d = true
	emissive_view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	emissive_view.gui_disable_input = true
	add_child(emissive_view)
	var emissive := EmissiveCanvas.new()
	emissive.name = "EmissiveCanvas"
	emissive.gm = gm
	emissive.world = world
	emissive_view.add_child(emissive)

	# Pass 1: bright-pass + horizontal blur (half-res) of the EMISSIVE layer.
	var bloom_h := _bloom_viewport("BloomH", half, "res://assets/bright_blur_h.gdshader")
	(bloom_h.get_child(0).material as ShaderMaterial).set_shader_parameter("emissive_tex", emissive_view.get_texture())

	# Pass 2: vertical blur (half-res).
	var bloom_v := _bloom_viewport("BloomV", half, "res://assets/blur_v.gdshader")
	(bloom_v.get_child(0).material as ShaderMaterial).set_shader_parameter("blur_h_tex", bloom_h.get_texture())

	# Composite on the root canvas: the game, then the bloom added on top.
	var game_display := TextureRect.new()
	game_display.name = "GameDisplay"
	game_display.set_anchors_preset(Control.PRESET_FULL_RECT)
	game_display.texture = game_view.get_texture()
	game_display.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(game_display)

	var bloom_display := ColorRect.new()
	bloom_display.name = "BloomDisplay"
	bloom_display.set_anchors_preset(Control.PRESET_FULL_RECT)
	bloom_display.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bd_mat := ShaderMaterial.new()
	bd_mat.shader = load("res://assets/bloom_composite.gdshader")
	bd_mat.set_shader_parameter("bloom_tex", bloom_v.get_texture())
	bloom_display.material = bd_mat
	add_child(bloom_display)

	_bloom = {"game_view": game_view, "emissive_view": emissive_view, "bloom_h": bloom_h, "bloom_v": bloom_v}
	get_viewport().size_changed.connect(_on_resize)

	# Touch pad renders above the composited game + bloom.
	move_child(touch, -1)


## Build a half-res bloom SubViewport with a fullscreen ColorRect running `shader_path`.
func _bloom_viewport(p_name: String, p_size: Vector2i, shader_path: String) -> SubViewport:
	var vp := SubViewport.new()
	vp.name = p_name
	vp.size = p_size
	vp.disable_3d = true
	vp.transparent_bg = true
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.gui_disable_input = true
	add_child(vp)
	var rect := ColorRect.new()
	rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat := ShaderMaterial.new()
	mat.shader = load(shader_path)
	rect.material = mat
	vp.add_child(rect)
	return vp


func _on_resize() -> void:
	if _bloom.is_empty():
		return
	var sz: Vector2i = Vector2i(get_viewport().get_visible_rect().size)
	_bloom["game_view"].size = sz
	_bloom["emissive_view"].size = sz
	var half: Vector2i = Vector2i(maxi(2, sz.x / 2), maxi(2, sz.y / 2))
	_bloom["bloom_h"].size = half
	_bloom["bloom_v"].size = half
