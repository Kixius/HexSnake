class_name MenuScreens
extends RefCounted
## The 7 menu screens (port of src/ui/menu/screens/*). Each is a static render function
## that draws via `world`, queries `ui` (UiContext) for interaction, and calls
## `ctrl` (MenuController: push/pop/start_run) + reads/writes the Settings autoload.
## Loaded only via MenuController (windowed) -> references Palette/Settings directly.
##
## Phase 4: Main screen + stubs. Phase 5 fills settings/theme/music/difficulty/gallery;
## Phase 6 fills keybinds.

## Dispatch the top-of-stack screen.
static func render(world: World, ui: UiContext, ctrl: MenuController, screen_id: String, w: float, h: float) -> void:
	match screen_id:
		"main":
			render_main(world, ui, ctrl, w, h)
		"settings":
			render_settings(world, ui, ctrl, w, h)
		"keybinds":
			render_keybinds(world, ui, ctrl, w, h)
		"music":
			render_music(world, ui, ctrl, w, h)
		"theme":
			render_theme(world, ui, ctrl, w, h)
		"difficulty":
			render_difficulty(world, ui, ctrl, w, h)
		"video":
			render_video(world, ui, ctrl, w, h)
		"gallery":
			render_gallery(world, ui, ctrl, w, h)
		_:
			render_main(world, ui, ctrl, w, h)


static func render_main(world: World, ui: UiContext, ctrl: MenuController, w: float, h: float) -> void:
	MenuWidgets.screen_title(world, w, h * 0.20, "HEXSNAKE", "")
	var bw: float = 300.0
	var bh: float = 54.0
	var x: float = (w - bw) * 0.5
	var y: float = h * 0.36
	if MenuWidgets.button(world, ui, "new_game", Rect2(x, y, bw, bh), "NEW GAME"):
		ctrl.start_run()
	y += bh + 18.0
	if MenuWidgets.button(world, ui, "settings", Rect2(x, y, bw, bh), "SETTINGS"):
		ctrl.push("settings")
	y += bh + 18.0
	if MenuWidgets.button(world, ui, "gallery", Rect2(x, y, bw, bh), "CARD GALLERY"):
		ctrl.push("gallery")
	_draw_controls(world, w * 0.5, h * 0.72)
	world._text("arrows / WASD navigate    enter select    esc back", Vector2(0, h * 0.94), 14, Palette.color("text_dim"), HORIZONTAL_ALIGNMENT_CENTER, w)


## The 2x3 hex-key diagram (Q W E / A S D) from the current keybinds.
static func _draw_controls(world: World, cx: float, cy: float) -> void:
	var kb: Dictionary = Settings.keybinds
	# Rows: top = NW, N, NE (dir5, dir0, dir1); bottom = SW, S, SE (dir4, dir3, dir2).
	var rows: Array = [
		[["dir5", "NW"], ["dir0", "N"], ["dir1", "NE"]],
		[["dir4", "SW"], ["dir3", "S"], ["dir2", "SE"]],
	]
	var ks: float = 40.0
	var gap: float = 8.0
	var row_w: float = 3.0 * ks + 2.0 * gap
	var start_x: float = cx - row_w * 0.5
	for r in range(2):
		var rowy: float = cy - ks + float(r) * (ks + gap + 16.0)
		for c in range(3):
			var entry: Array = rows[r][c]
			var action: String = entry[0]
			var dir_label: String = entry[1]
			var kx: float = start_x + float(c) * (ks + gap)
			var cell: Rect2 = Rect2(kx, rowy, ks, ks)
			world.draw_rect(cell, Palette.color("grid"), true)
			world.draw_rect(cell, Palette.color("teal"), false, 2.0)
			var key_str: String = Keybinds.key_label(int(kb.get(action, Keybinds.DEFAULT_KEYBINDS[action])))
			# Scale font to fit the cell for longer binds.
			var fsize: int = 18
			var tw: float = world.font.get_string_size(key_str, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize).x
			if tw > ks - 6.0:
				fsize = maxi(9, int(float(fsize) * (ks - 6.0) / tw))
			world.draw_string(world.font, Vector2(kx + (ks - tw) * 0.5, rowy + ks * 0.62), key_str, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize, Palette.color("text"))
			world._text(dir_label, Vector2(kx, rowy + ks + 14.0), 10, Palette.color("text_dim"), HORIZONTAL_ALIGNMENT_CENTER, ks)


# ---- stubs (Phase 5/6 fill these) ----

static var _gallery_page: int = 0


static func render_settings(world: World, ui: UiContext, ctrl: MenuController, w: float, h: float) -> void:
	MenuWidgets.screen_title(world, w, h * 0.16, "SETTINGS", "")
	var bw: float = 360.0
	var bh: float = 52.0
	var x: float = (w - bw) * 0.5
	var y: float = h * 0.30
	for entry in [["keybinds", "KEYBINDS"], ["music", "MUSIC"], ["theme", "THEME"], ["difficulty", "DIFFICULTY"], ["video", "VIDEO"]]:
		if MenuWidgets.list_row(world, ui, "set_" + entry[0], Rect2(x, y, bw, bh), entry[1], "", false):
			ctrl.push(entry[0])
		y += bh + 12.0
	if MenuWidgets.back_button(world, ui, w, h):
		ctrl.pop()


# Keybinds-screen capture state (persists across frames; cleared on push).
static var _rebinding: String = ""  # the action awaiting a new key, or ""
static var _message: String = ""


static func is_capturing() -> bool:
	return _rebinding != ""


## Reset capture state (called by MenuController whenever a screen is pushed).
static func reset_capture() -> void:
	_rebinding = ""
	_message = ""


## Capture the next key for the rebinding action (called by MenuController.on_key when
## is_capturing()). Escape cancels; reserved keys reject; conflicts reject; else bind.
static func capture_key(kc: int) -> void:
	if _rebinding == "":
		return
	if kc == KEY_ESCAPE:
		_rebinding = ""
		_message = ""
		return
	if Keybinds.is_reserved_key(kc):
		_message = "reserved key (esc / enter / tab)"
		_rebinding = ""
		return
	var conflict: String = Keybinds.find_conflict(Settings.keybinds, _rebinding, kc)
	if conflict != "":
		_message = "in use by %s" % String(Keybinds.ACTION_LABELS.get(conflict, conflict))
		_rebinding = ""
		return
	Settings.set_keybind(_rebinding, kc)
	_rebinding = ""
	_message = ""


static func render_keybinds(world: World, ui: UiContext, ctrl: MenuController, w: float, h: float) -> void:
	MenuWidgets.screen_title(world, w, h * 0.09, "KEYBINDS", "select a row, then press a new key")
	var kb: Dictionary = Settings.keybinds
	var bw: float = 460.0
	var bh: float = 42.0
	var x: float = (w - bw) * 0.5
	var y: float = h * 0.20
	for action in Keybinds.ALL_ACTIONS:
		var label: String = String(Keybinds.ACTION_LABELS.get(action, action))
		var value: String = "press a key..." if _rebinding == action else Keybinds.key_label(int(kb.get(action, Keybinds.DEFAULT_KEYBINDS[action])))
		var selected: bool = _rebinding == action
		if MenuWidgets.list_row(world, ui, "kb_" + action, Rect2(x, y, bw, bh), label, value, selected):
			_rebinding = action  # next key press is captured by MenuController
			_message = ""
		y += bh + 6.0
	if _message != "":
		world._text(_message, Vector2(0, y + 4.0), 14, Palette.color("danger"), HORIZONTAL_ALIGNMENT_CENTER, w)
	# RESET DEFAULTS above the BACK button (spaced so they don't overlap).
	if MenuWidgets.button(world, ui, "kb_reset", Rect2((w - 200.0) * 0.5, h - 128.0, 200.0, 40.0), "RESET DEFAULTS"):
		Settings.set_keybinds(Keybinds.DEFAULT_KEYBINDS.duplicate())
		_rebinding = ""
		_message = ""
	if MenuWidgets.back_button(world, ui, w, h):
		ctrl.pop()


static func render_music(world: World, ui: UiContext, ctrl: MenuController, w: float, h: float) -> void:
	MenuWidgets.screen_title(world, w, h * 0.14, "MUSIC", "volume - mute - sound effects")
	var sw: float = 360.0
	var x: float = (w - sw) * 0.5
	var y: float = h * 0.32
	var a: Dictionary = Settings.audio
	# Music volume.
	world._text("MUSIC VOLUME  %d%%" % int(round(float(a["music_volume"]) * 100.0)), Vector2(x, y - 26.0), 16, Palette.color("text_dim"), HORIZONTAL_ALIGNMENT_LEFT)
	var mv: float = MenuWidgets.slider(world, ui, "music_vol", x, y, sw, float(a["music_volume"]), 0.0, 1.0)
	if absf(mv - float(a["music_volume"])) > 0.001:
		Settings.set_audio({"music_volume": mv})
	y += 64.0
	# SFX volume.
	world._text("SFX VOLUME  %d%%" % int(round(float(a["sfx_volume"]) * 100.0)), Vector2(x, y - 26.0), 16, Palette.color("text_dim"), HORIZONTAL_ALIGNMENT_LEFT)
	var sv: float = MenuWidgets.slider(world, ui, "sfx_vol", x, y, sw, float(a["sfx_volume"]), 0.0, 1.0)
	if absf(sv - float(a["sfx_volume"])) > 0.001:
		Settings.set_audio({"sfx_volume": sv})
	y += 64.0
	# Toggles return their target value; apply only on change.
	var tw: float = 360.0
	var muted_now: bool = MenuWidgets.toggle(world, ui, "mute", Rect2(x, y, tw, 46.0), "MUTE ALL", bool(a["muted"]))
	if muted_now != bool(a["muted"]):
		Settings.set_muted(muted_now)
	y += 58.0
	var sfx_now: bool = MenuWidgets.toggle(world, ui, "sfx_on", Rect2(x, y, tw, 46.0), "SOUND EFFECTS", bool(a["sfx_enabled"]))
	if sfx_now != bool(a["sfx_enabled"]):
		Settings.set_audio({"sfx_enabled": sfx_now})
	if MenuWidgets.back_button(world, ui, w, h):
		ctrl.pop()


static func render_theme(world: World, ui: UiContext, ctrl: MenuController, w: float, h: float) -> void:
	MenuWidgets.screen_title(world, w, h * 0.16, "THEME", "pick a palette - applies live")
	var bw: float = 360.0
	var bh: float = 52.0
	var x: float = (w - bw) * 0.5
	var y: float = h * 0.30
	for tid in Palette.THEME_ORDER:
		var selected: bool = Settings.theme == tid
		if MenuWidgets.list_row(world, ui, "theme_" + tid, Rect2(x, y, bw, bh), String(tid).capitalize(), "", selected):
			Settings.set_theme(tid)
		y += bh + 12.0
	if MenuWidgets.back_button(world, ui, w, h):
		ctrl.pop()


static func render_difficulty(world: World, ui: UiContext, ctrl: MenuController, w: float, h: float) -> void:
	MenuWidgets.screen_title(world, w, h * 0.14, "DIFFICULTY", "applies to the next run")
	var bw: float = 380.0
	var bh: float = 58.0
	var x: float = (w - bw) * 0.5
	var y: float = h * 0.30
	for did in Config.DIFFICULTY_ORDER:
		var d: Dictionary = Config.DIFFICULTIES[did]
		var selected: bool = Settings.difficulty == did
		var val: String = "%.0f%% speed   %.0f%% pts" % [float(d.speed_mult) * 100.0, float(d.score_mult) * 100.0]
		if MenuWidgets.list_row(world, ui, "diff_" + did, Rect2(x, y, bw, bh), String(d.label), val, selected):
			Settings.set_difficulty(did)
		y += bh + 14.0
	if MenuWidgets.back_button(world, ui, w, h):
		ctrl.pop()


const RESOLUTIONS: Array = [
	Vector2i(1280, 720),
	Vector2i(1600, 900),
	Vector2i(1920, 1080),
	Vector2i(2560, 1440),
]


# Video screen staging: rows update the pending selection only; APPLY commits it to
# Settings (which applies + persists), BACK discards (re-reads current Settings on next
# entry). reset_video() is called when the screen is pushed.
static var _vid_res: Vector2i = Vector2i(1280, 720)
static var _vid_mode: String = "windowed"
static var _vid_init: bool = false


static func reset_video() -> void:
	_vid_init = false


static func render_video(world: World, ui: UiContext, ctrl: MenuController, w: float, h: float) -> void:
	if not _vid_init:
		_vid_res = Settings.display["resolution"]
		_vid_mode = String(Settings.display["mode"])
		_vid_init = true
	MenuWidgets.screen_title(world, w, h * 0.10, "VIDEO", "pick, then APPLY (back discards)")
	var bw: float = 380.0
	var bh: float = 42.0
	var x: float = (w - bw) * 0.5
	var y: float = h * 0.20
	for res in RESOLUTIONS:
		var selected: bool = _vid_res == res
		if MenuWidgets.list_row(world, ui, "res_%d_%d" % [res.x, res.y], Rect2(x, y, bw, bh), "%d x %d" % [res.x, res.y], "", selected):
			_vid_res = res
		y += bh + 6.0
	y += 12.0
	# Display mode: windowed / fullscreen / borderless (windowed fullscreen).
	var modes: Array = [["windowed", "WINDOWED"], ["fullscreen", "FULLSCREEN"], ["borderless", "BORDERLESS FULLSCREEN"]]
	for entry in modes:
		var mid: String = entry[0]
		var selected: bool = _vid_mode == mid
		if MenuWidgets.list_row(world, ui, "mode_" + mid, Rect2(x, y, bw, bh), String(entry[1]), "", selected):
			_vid_mode = mid
		y += bh + 6.0
	# APPLY commits the staged selection (applies + persists); BACK discards.
	if MenuWidgets.button(world, ui, "vid_apply", Rect2((w - 200.0) * 0.5, h - 128.0, 200.0, 42.0), "APPLY"):
		Settings.set_resolution(_vid_res)
		Settings.set_display_mode(_vid_mode)
	if MenuWidgets.back_button(world, ui, w, h):
		ctrl.pop()


static func render_gallery(world: World, ui: UiContext, ctrl: MenuController, w: float, h: float) -> void:
	MenuWidgets.screen_title(world, w, h * 0.10, "CARD GALLERY", "")
	var registry: Array[MutationDef] = Registry.build_registry()
	var per_row: int = 3
	var per_page: int = 3  # 1 row of 3 (big enough for the description text)
	var pages: int = maxi(1, ceili(registry.size() / float(per_page)))
	_gallery_page = clampi(_gallery_page, 0, pages - 1)
	var card_w: float = minf(260.0, w * 0.26)
	var card_h: float = minf(300.0, h * 0.42)
	var gap: float = 14.0
	var total_w: float = float(per_row) * card_w + float(per_row - 1) * gap
	var start_x: float = (w - total_w) * 0.5
	var y0: float = h * 0.16
	var start: int = _gallery_page * per_page
	var count: int = 0
	for i in range(start, registry.size()):
		if count >= per_page:
			break
		var def: MutationDef = registry[i]
		var col: int = count % per_row
		var row: int = count / per_row
		var cx: float = start_x + float(col) * (card_w + gap)
		var cy: float = y0 + float(row) * (card_h + gap)
		world._draw_card(def, Rect2(cx, cy, card_w, card_h), -1, 0.0, 1.0)
		count += 1
	var rows_drawn: int = ceili(float(mini(per_page, maxi(0, registry.size() - start))) / float(per_row))
	var py: float = y0 + float(rows_drawn) * (card_h + gap) + 6.0
	if MenuWidgets.button(world, ui, "gal_prev", Rect2(w * 0.5 - 210.0, py, 130.0, 40.0), "< PREV"):
		_gallery_page = maxi(0, _gallery_page - 1)
	world._text("Page %d / %d" % [_gallery_page + 1, pages], Vector2(w * 0.5 - 50.0, py + 10.0), 16, Palette.color("text_dim"), HORIZONTAL_ALIGNMENT_LEFT, 100.0)
	if MenuWidgets.button(world, ui, "gal_next", Rect2(w * 0.5 + 80.0, py, 130.0, 40.0), "NEXT >"):
		_gallery_page = mini(pages - 1, _gallery_page + 1)
	if MenuWidgets.back_button(world, ui, w, h):
		ctrl.pop()


static func _stub(world: World, ui: UiContext, ctrl: MenuController, w: float, h: float, title: String) -> void:
	MenuWidgets.screen_title(world, w, h * 0.32, title, "")
	world._text("(content lands in a follow-up phase)", Vector2(0, h * 0.42), 16, Palette.color("text_dim"), HORIZONTAL_ALIGNMENT_CENTER, w)
	if MenuWidgets.back_button(world, ui, w, h):
		ctrl.pop()
