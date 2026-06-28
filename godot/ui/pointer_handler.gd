class_name PointerHandler
extends Node
## Unified mouse + touch input for the UI layer (Phase 1). Always active (NOT gated on
## touch), so desktop mouse works — this is the fix for "I can't click with the mouse".
## Routes presses by game state: menu press/release/hover, upgrade-card clicks (by the
## REAL rects world.gd stores), the pause END RUN button, and dead-retry. The gameplay
## hex pad + Phase/Slip buttons stay in touch_controls.gd (touch devices); this node
## handles UI taps/clicks everywhere.
##
## `menu` is wired in Phase 4 (MenuController); until then MENU taps fall back to
## start_run. `world` reads the per-frame hit-rects it stores.

var gm: GameManager = null
var world: World = null
var menu: Node = null  # godot/ui/menu_controller.gd (set in Phase 4)


func _unhandled_input(event: InputEvent) -> void:
	if gm == null:
		return
	# Mouse motion -> menu hover tracking (only meaningful once the menu exists).
	var mm := event as InputEventMouseMotion
	if mm != null:
		if gm.state == GameState.MENU and menu != null:
			menu.call("set_pointer", mm.position.x, mm.position.y, true)
		return
	# Press (left mouse / screen touch).
	var pos = _press_pos(event)
	if pos != null:
		_on_press(pos)
		return
	# Release -> end any active menu slider drag / click.
	if _is_release(event) and gm.state == GameState.MENU and menu != null:
		menu.call("release")


func _on_press(pos: Vector2) -> void:
	match gm.state:
		GameState.MENU:
			if menu != null:
				menu.call("press", pos.x, pos.y)
			else:
				gm.start_run()
			get_viewport().set_input_as_handled()
		GameState.UPGRADE_SELECT:
			if world != null:
				var rects: Array[Rect2] = world._upgrade_card_rects
				for i in range(rects.size()):
					if rects[i].has_point(pos):
						gm.request_pick(i)
						get_viewport().set_input_as_handled()
						return
		GameState.PLAYING:
			# Only the pause END RUN button is clickable during play.
			if gm.paused and world != null and world._end_run_rect.has_point(pos):
				gm.end_run()
				get_viewport().set_input_as_handled()
		GameState.DEAD:
			gm.go_to_menu()  # tap/click returns to the title (matches TS death -> Menu)
			get_viewport().set_input_as_handled()


func _press_pos(event: InputEvent) -> Variant:
	var mb := event as InputEventMouseButton
	if mb != null and mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
		return mb.position
	var st := event as InputEventScreenTouch
	if st != null and st.pressed:
		return st.position
	return null


func _is_release(event: InputEvent) -> bool:
	var mb := event as InputEventMouseButton
	if mb != null and not mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
		return true
	var st := event as InputEventScreenTouch
	if st != null and not st.pressed:
		return true
	return false
