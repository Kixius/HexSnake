extends Node
## Mutable palette + curated theme presets (port of src/config.ts PALETTE +
## src/theme.ts). Accessed globally as `Palette`. Named "Palette" (not "Theme") to
## avoid colliding with Godot's built-in Theme class.
##
## Renderers read `Palette.color(key)` live each draw, so apply_theme() recolors the
## whole game next frame with zero call-site edits (mirrors the TS Object.assign swap).

# The 4 complete palettes. teal-orange is the default.
var _presets: Dictionary = {
	"teal-orange": {
		"bg": Color("#0e1116"), "grid": Color("#171e2a"), "grid_edge": Color("#222d3f"),
		"arena_edge": Color("#2dd4bf"),
		"snake_head": Color("#5eead4"), "snake_body": Color("#0f766e"),
		"snake_body_bright": Color("#2dd4bf"), "snake_outline": Color("#0a3a36"),
		"acid": Color("#22d3ee"), "head_glow": Color("#5eead4", 0.55),
		"essence": Color("#5eead4"), "essence_glow": Color("#5eead4", 0.5),
		"portal": Color("#f59e0b"), "portal_bright": Color("#fde68a"), "portal_glow": Color("#f59e0b", 0.45),
		"wall": Color("#394150"), "wall_edge": Color("#4b5568"),
		"slime": Color("#92400e"), "slime_edge": Color("#d97706"),
		"obstacle": Color("#f97316"), "obstacle_edge": Color("#fdba74"), "obstacle_glow": Color("#f97316", 0.5),
		"spore": Color("#22c55e"), "spore_glow": Color("#22c55e", 0.5),
		"text": Color("#e6edf3"), "text_dim": Color("#8b97a7"),
		"teal": Color("#2dd4bf"), "orange": Color("#f97316"),
		"danger": Color("#ef4444"), "danger_glow": Color("#ef4444", 0.5),
		"gold": Color("#fbbf24"), "legendary": Color("#a78bfa"),
	},
	"synthwave": {
		"bg": Color("#1a0b2e"), "grid": Color("#241440"), "grid_edge": Color("#2e1a52"),
		"arena_edge": Color("#ff2bd6"),
		"snake_head": Color("#00e5ff"), "snake_body": Color("#0b3b66"),
		"snake_body_bright": Color("#00e5ff"), "snake_outline": Color("#062a4a"),
		"acid": Color("#39ff14"), "head_glow": Color("#00e5ff", 0.55),
		"essence": Color("#ff2bd6"), "essence_glow": Color("#ff2bd6", 0.5),
		"portal": Color("#ffd000"), "portal_bright": Color("#fff275"), "portal_glow": Color("#ffd000", 0.45),
		"wall": Color("#3b2a5c"), "wall_edge": Color("#5a3f86"),
		"slime": Color("#7a1f6b"), "slime_edge": Color("#c026d3"),
		"obstacle": Color("#ff2bd6"), "obstacle_edge": Color("#ff8be6"), "obstacle_glow": Color("#ff2bd6", 0.5),
		"spore": Color("#a3e635"), "spore_glow": Color("#a3e635", 0.5),
		"text": Color("#f5e9ff"), "text_dim": Color("#9b86c0"),
		"teal": Color("#00e5ff"), "orange": Color("#ff2bd6"),
		"danger": Color("#ff3b3b"), "danger_glow": Color("#ff3b3b", 0.5),
		"gold": Color("#ffd000"), "legendary": Color("#b388ff"),
	},
	"forest": {
		"bg": Color("#0d1410"), "grid": Color("#16221b"), "grid_edge": Color("#1f2e25"),
		"arena_edge": Color("#7cfc00"),
		"snake_head": Color("#9be86a"), "snake_body": Color("#2e5d2a"),
		"snake_body_bright": Color("#7cfc00"), "snake_outline": Color("#163a17"),
		"acid": Color("#69d985"), "head_glow": Color("#7cfc00", 0.5),
		"essence": Color("#daa520"), "essence_glow": Color("#daa520", 0.5),
		"portal": Color("#f0a500"), "portal_bright": Color("#ffd166"), "portal_glow": Color("#f0a500", 0.45),
		"wall": Color("#33402f"), "wall_edge": Color("#4b5a44"),
		"slime": Color("#5a3a1a"), "slime_edge": Color("#8a5a2a"),
		"obstacle": Color("#daa520"), "obstacle_edge": Color("#ecc46b"), "obstacle_glow": Color("#daa520", 0.5),
		"spore": Color("#ccff00"), "spore_glow": Color("#ccff00", 0.5),
		"text": Color("#e8f0e0"), "text_dim": Color("#8aa085"),
		"teal": Color("#7cfc00"), "orange": Color("#daa520"),
		"danger": Color("#e54646"), "danger_glow": Color("#e54646", 0.5),
		"gold": Color("#f0a500"), "legendary": Color("#e8c547"),
	},
	"mono": {
		"bg": Color("#0c0a00"), "grid": Color("#1a1400"), "grid_edge": Color("#241c00"),
		"arena_edge": Color("#ffb000"),
		"snake_head": Color("#ffd060"), "snake_body": Color("#7a5200"),
		"snake_body_bright": Color("#ffb000"), "snake_outline": Color("#3a2600"),
		"acid": Color("#cc8800"), "head_glow": Color("#ffb000", 0.5),
		"essence": Color("#ffd060"), "essence_glow": Color("#ffd060", 0.5),
		"portal": Color("#ff8c00"), "portal_bright": Color("#ffb84d"), "portal_glow": Color("#ff8c00", 0.45),
		"wall": Color("#3a2a00"), "wall_edge": Color("#5a4200"),
		"slime": Color("#5a3a00"), "slime_edge": Color("#8a6300"),
		"obstacle": Color("#ff8c00"), "obstacle_edge": Color("#ffb84d"), "obstacle_glow": Color("#ff8c00", 0.5),
		"spore": Color("#22c55e"), "spore_glow": Color("#22c55e", 0.5),
		"text": Color("#ffce5c"), "text_dim": Color("#8a6f2a"),
		"teal": Color("#ffb000"), "orange": Color("#ff8c00"),
		"danger": Color("#ff5555"), "danger_glow": Color("#ff5555", 0.5),
		"gold": Color("#ffd060"), "legendary": Color("#ffe0a0"),
	},
}

const THEME_ORDER: Array = ["teal-orange", "synthwave", "forest", "mono"]

# The active palette (swapped in place by apply_theme so any held reference sees it).
var palette: Dictionary = {}
var current: String = "teal-orange"


func _ready() -> void:
	apply_theme("teal-orange")


## Look up a palette color. Missing keys return MAGENTA so gaps are obvious.
func color(key: String) -> Color:
	return palette.get(key, Color.MAGENTA)


## Swap the active palette by replacing its contents in place.
func apply_theme(id: String) -> void:
	if not _presets.has(id):
		return
	palette.clear()
	palette.merge(_presets[id], true)
	current = id


func has_theme(id: String) -> bool:
	return _presets.has(id)
