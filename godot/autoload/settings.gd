extends Node
## Persisted settings (port of src/settings/SettingsStore.ts): audio, difficulty,
## theme, AND keybinds. ConfigFile at user://settings.cfg. Loads at boot (defensive:
## corruption/missing keys fall back to defaults), saves on change.
##
## Autoload order in project.godot is Config, Palette, AudioManager, Settings — so by
## the time this _ready runs, Palette + AudioManager are ready to receive applies.

const PATH: String = "user://settings.cfg"

const DEFAULT_AUDIO: Dictionary = {
	"music_volume": 0.25,
	"sfx_volume": 0.25,
	"muted": false,
	"sfx_enabled": true,
}

const DEFAULT_DISPLAY: Dictionary = {
	"resolution": Vector2i(1280, 720),
	"mode": "windowed",  # "windowed" | "fullscreen" | "borderless" (borderless = windowed fullscreen)
}

var audio: Dictionary = DEFAULT_AUDIO.duplicate(true)
var difficulty: String = "normal"
var theme: String = "teal-orange"
var keybinds: Dictionary = Keybinds.DEFAULT_KEYBINDS.duplicate()
var display: Dictionary = DEFAULT_DISPLAY.duplicate(true)

## Emitted whenever any setting changes (audio/theme/difficulty/keybinds). InputRouter
## subscribes to rebuild its key maps so rebinding applies live.
signal settings_changed

var _cfg := ConfigFile.new()


func _ready() -> void:
	load_settings()
	# Apply the loaded theme + audio to the live singletons.
	Palette.apply_theme(theme)
	AudioManager.apply(audio)
	apply_display()
	settings_changed.emit()  # so InputRouter builds its maps from loaded keybinds


## Load from disk (deep-merged over defaults; never throws). Safe to call anytime.
func load_settings() -> void:
	audio = DEFAULT_AUDIO.duplicate(true)
	difficulty = "normal"
	theme = "teal-orange"
	keybinds = Keybinds.DEFAULT_KEYBINDS.duplicate()
	display = DEFAULT_DISPLAY.duplicate(true)
	if _cfg.load(PATH) != OK:
		return  # no file yet -> defaults
	audio["music_volume"] = _clamp01(_cfg.get_value("audio", "music_volume", DEFAULT_AUDIO["music_volume"]))
	audio["sfx_volume"] = _clamp01(_cfg.get_value("audio", "sfx_volume", DEFAULT_AUDIO["sfx_volume"]))
	audio["muted"] = bool(_cfg.get_value("audio", "muted", false))
	audio["sfx_enabled"] = bool(_cfg.get_value("audio", "sfx_enabled", true))
	var d = _cfg.get_value("game", "difficulty", "normal")
	if d is String and Config.DIFFICULTY_ORDER.has(d):
		difficulty = d
	var t = _cfg.get_value("game", "theme", "teal-orange")
	if t is String and Palette.has_theme(t):
		theme = t
	# Keybinds: deep-merge over defaults (defensive — bad/missing keys fall back).
	for action in Keybinds.ALL_ACTIONS:
		var k = _cfg.get_value("keybinds", action, Keybinds.DEFAULT_KEYBINDS[action])
		if k is int and k != KEY_NONE:
			keybinds[action] = k
	# Display: resolution (Vector2i) + mode (defensive).
	var res = _cfg.get_value("display", "resolution", Vector2i(1280, 720))
	if res is Vector2i:
		display["resolution"] = res
	var m = _cfg.get_value("display", "mode", "windowed")
	if m is String and (m == "windowed" or m == "fullscreen" or m == "borderless"):
		display["mode"] = m


func save() -> void:
	_cfg.set_value("audio", "music_volume", audio["music_volume"])
	_cfg.set_value("audio", "sfx_volume", audio["sfx_volume"])
	_cfg.set_value("audio", "muted", audio["muted"])
	_cfg.set_value("audio", "sfx_enabled", audio["sfx_enabled"])
	_cfg.set_value("game", "difficulty", difficulty)
	_cfg.set_value("game", "theme", theme)
	for action in Keybinds.ALL_ACTIONS:
		_cfg.set_value("keybinds", action, keybinds[action])
	_cfg.set_value("display", "resolution", display["resolution"])
	_cfg.set_value("display", "mode", display["mode"])
	_cfg.save(PATH)


## Patch one or more audio fields, persist, and apply to AudioManager.
func set_audio(patch: Dictionary) -> void:
	for k in patch:
		if audio.has(k):
			audio[k] = patch[k]
	save()
	AudioManager.apply(audio)
	settings_changed.emit()


func set_muted(m: bool) -> void:
	audio["muted"] = m
	save()
	AudioManager.set_muted(m)
	settings_changed.emit()


func set_difficulty(d: String) -> void:
	if not Config.DIFFICULTY_ORDER.has(d):
		return
	difficulty = d
	save()
	settings_changed.emit()


func set_theme(t: String) -> void:
	if not Palette.has_theme(t):
		return
	theme = t
	Palette.apply_theme(t)
	save()
	settings_changed.emit()


## Rebind one action to a Key (physical-keycode). Port of SettingsStore.setKeybinds.
func set_keybind(action: String, key: int) -> void:
	if not Keybinds.is_valid_action(action):
		return
	keybinds[action] = key
	save()
	settings_changed.emit()


## Bulk-set keybinds (RESET DEFAULTS). `kb` is action -> Key int.
func set_keybinds(kb: Dictionary) -> void:
	for action in Keybinds.ALL_ACTIONS:
		if kb.has(action) and kb[action] is int:
			keybinds[action] = kb[action]
	save()
	settings_changed.emit()


func get_keybinds() -> Dictionary:
	return keybinds


## Set the window resolution (only affects windowed mode; fullscreen/borderless ignore it).
func set_resolution(res: Vector2i) -> void:
	display["resolution"] = res
	save()
	if String(display["mode"]) == "windowed":
		apply_display()
	settings_changed.emit()


## Set the display mode: "windowed" | "fullscreen" | "borderless" (borderless = windowed
## fullscreen). Applies immediately.
func set_display_mode(m: String) -> void:
	if m != "windowed" and m != "fullscreen" and m != "borderless":
		return
	display["mode"] = m
	save()
	apply_display()
	settings_changed.emit()


## Apply the saved window size + mode via DisplayServer. No-op under the headless driver
## (so `-s` test runs are unaffected).
func apply_display() -> void:
	if DisplayServer.get_name() == "headless":
		return
	match String(display["mode"]):
		"fullscreen":
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
		"borderless":
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, true)
			DisplayServer.window_set_size(DisplayServer.screen_get_size())
		_:
			DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, false)
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			DisplayServer.window_set_size(display["resolution"])


## Cycle the theme by `delta` steps in THEME_ORDER (for the menu picker).
func cycle_theme(delta: int = 1) -> String:
	var idx: int = Palette.THEME_ORDER.find(theme)
	idx = posmod(idx + delta, Palette.THEME_ORDER.size())
	set_theme(Palette.THEME_ORDER[idx])
	return theme


## Cycle the difficulty by `delta` steps (for the menu picker).
func cycle_difficulty(delta: int = 1) -> String:
	var idx: int = Config.DIFFICULTY_ORDER.find(difficulty)
	idx = posmod(idx + delta, Config.DIFFICULTY_ORDER.size())
	difficulty = Config.DIFFICULTY_ORDER[idx]
	save()
	settings_changed.emit()
	return difficulty


static func _clamp01(v) -> float:
	if not (v is float or v is int):
		return 0.25
	return clampf(float(v), 0.0, 1.0)
