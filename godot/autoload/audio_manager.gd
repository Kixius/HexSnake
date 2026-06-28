extends Node
## Audio engine: 3 buses (Master / Music / SFX), looping background music, and a
## round-robin SFX pool. Port of src/audio/AudioManager.ts.
##
## Music + SFX buses are created at runtime (sending to Master) so nothing in
## project.godot needs editing. Volume / mute map to AudioServer bus volume/mute.
## Assets live at res://assets/audio/ (bg.mp3 + the 18 SFX .wav). Missing assets load
## null -> silent; a missing file never breaks gameplay (matches the TS swallow).

const SFX_POOL_SIZE: int = 8
# 18 SFX (port of src/audio/sfx.ts SFX_FILES). id -> filename.
const SFX_LIST: Array = [
	{"id": "hover", "file": "hover.wav"},
	{"id": "click", "file": "click.wav"},
	{"id": "move", "file": "move.wav"},
	{"id": "eat_essence", "file": "eat_essence.wav"},
	{"id": "eat_spore", "file": "eat_spore.wav"},
	{"id": "eat_core", "file": "eat_core.wav"},
	{"id": "portal", "file": "portal.wav"},
	{"id": "next_level", "file": "next_level.wav"},
	{"id": "upgrade", "file": "upgrade.wav"},
	{"id": "death", "file": "death.wav"},
	{"id": "respawn", "file": "respawn.wav"},
	{"id": "wall_impact", "file": "wall_impact.wav"},
	{"id": "wall_break", "file": "wall_break.wav"},
	{"id": "slime", "file": "slime.wav"},
	{"id": "dissolve", "file": "dissolve.wav"},
	{"id": "vaporize", "file": "vaporize.wav"},
	{"id": "hydra", "file": "hydra.wav"},
	{"id": "apex", "file": "apex.wav"},
]

var _music_player: AudioStreamPlayer = null
var _sfx_pool: Array[AudioStreamPlayer] = []
var _sfx_next: int = 0
var _sfx_streams: Dictionary = {}  # id -> AudioStream
var _music_stream: AudioStream = null

var _master_bus: int = 0
var _music_bus: int = 0
var _sfx_bus: int = 0

# Current applied settings.
var _music_volume: float = 0.25
var _sfx_volume: float = 0.25
var _muted: bool = false
var _sfx_enabled: bool = true


func _ready() -> void:
	_ensure_buses()
	# Music player on the Music bus.
	_music_player = AudioStreamPlayer.new()
	_music_player.bus = "Music"
	add_child(_music_player)
	# SFX round-robin pool on the SFX bus (each play() uses the next player so
	# overlapping one-shots don't cut each other off).
	for i in range(SFX_POOL_SIZE):
		var p := AudioStreamPlayer.new()
		p.bus = "SFX"
		add_child(p)
		_sfx_pool.append(p)
	_load_assets()
	_apply_gains()
	# Native targets have no autoplay gate; start the loop now. (Web export resumes on
	# the first user gesture — handled by the engine; Phase 5 verifies.)
	play_music()


## Create Music + SFX buses if absent (Master always exists), both sending to Master.
func _ensure_buses() -> void:
	_master_bus = AudioServer.get_bus_index("Master")
	if _master_bus < 0:
		_master_bus = 0
	if AudioServer.get_bus_index("Music") < 0:
		AudioServer.add_bus()
		_music_bus = AudioServer.bus_count - 1
		AudioServer.set_bus_name(_music_bus, "Music")
		AudioServer.set_bus_send(_music_bus, "Master")
	else:
		_music_bus = AudioServer.get_bus_index("Music")
	if AudioServer.get_bus_index("SFX") < 0:
		AudioServer.add_bus()
		_sfx_bus = AudioServer.bus_count - 1
		AudioServer.set_bus_name(_sfx_bus, "SFX")
		AudioServer.set_bus_send(_sfx_bus, "Master")
	else:
		_sfx_bus = AudioServer.get_bus_index("SFX")


func _load_assets() -> void:
	var bg = load("res://assets/audio/bg.mp3")
	if bg is AudioStreamMP3:
		(bg as AudioStreamMP3).loop = true
		_music_stream = bg
	for entry in SFX_LIST:
		var s = load("res://assets/audio/%s" % entry["file"])
		if s is AudioStream:
			_sfx_streams[entry["id"]] = s


# ---- playback ----

## Start the looping music (no-op if already playing or no stream loaded).
func play_music() -> void:
	if _music_stream == null or _music_player == null:
		return
	if _music_player.playing:
		return
	_music_player.stream = _music_stream
	_music_player.play()


## Play a registered one-shot SFX. No-op if SFX disabled, the stream isn't loaded, or
## the pool is empty.
func play_sfx(id: String) -> void:
	if not _sfx_enabled or _sfx_pool.is_empty() or not _sfx_streams.has(id):
		return
	var p: AudioStreamPlayer = _sfx_pool[_sfx_next]
	_sfx_next = (_sfx_next + 1) % SFX_POOL_SIZE
	p.stream = _sfx_streams[id]
	p.play()


# ---- settings (port of AudioManager.apply / applyGains) ----

## Apply a full audio-settings block: {music_volume, sfx_volume, muted, sfx_enabled}.
func apply(s: Dictionary) -> void:
	_music_volume = clampf(float(s.get("music_volume", _music_volume)), 0.0, 1.0)
	_sfx_volume = clampf(float(s.get("sfx_volume", _sfx_volume)), 0.0, 1.0)
	_muted = bool(s.get("muted", _muted))
	_sfx_enabled = bool(s.get("sfx_enabled", _sfx_enabled))
	_apply_gains()


func set_muted(m: bool) -> void:
	_muted = m
	_apply_gains()


func is_muted() -> bool:
	return _muted


func _apply_gains() -> void:
	AudioServer.set_bus_mute(_master_bus, _muted)
	_set_bus_volume(_music_bus, _music_volume)
	_set_bus_volume(_sfx_bus, _sfx_volume if _sfx_enabled else 0.0)


## Linear 0..1 -> dB. 0 is effectively silent (-80dB) instead of -inf so unmutes pop.
func _set_bus_volume(bus: int, linear: float) -> void:
	var db: float = -80.0 if linear <= 0.0 else linear_to_db(linear)
	AudioServer.set_bus_volume_db(bus, db)
