class_name Registry
extends RefCounted
## All mutation cards (port of src/upgrades/registry.ts UPGRADES). Add cards here — no
## other file changes for pure-snapshot effects (UpgradeSystem reads this list).
##
## Each `apply` is a GDScript lambda co-located with the card metadata, so adding a
## card stays one spot. Lambdas touch ONLY the passed-in snapshot (no autoloads).

# Score multiplier hard cap (Elongated Strike / Hypertrophy ramp toward it).
const SCORE_MULT_CAP: float = 5.0
# Sentinel for "unlimited stacks" (Infinity isn't an int).
const UNLIMITED: int = 1000000

## Exponential-race weights. The marginal chance an offered card is a given rarity
## ~= weight / sum(weights) ~= common 60% / rare 27% / epic 11% / legendary 3%.
const RARITY_WEIGHT: Dictionary = {
	"common": 1.0,
	"rare": 0.45,
	"epic": 0.18,
	"legendary": 0.05,
}

## Palette key for each rarity (the renderer resolves it via Palette.color(key)).
const RARITY_COLOR_KEY: Dictionary = {
	"common": "teal",
	"rare": "gold",
	"epic": "orange",
	"legendary": "legendary",
}


static func rarity_color_key(r: String) -> String:
	return RARITY_COLOR_KEY.get(r, "teal")


## Fixed rarity colors (theme-independent): common=green, rare=blue, epic=red,
## legendary=gold. Used for card rendering so a card's rarity reads at a glance
## regardless of the active palette.
const RARITY_FIXED_COLOR: Dictionary = {
	"common": Color("#22c55e"),
	"rare": Color("#3b82f6"),
	"epic": Color("#ef4444"),
	"legendary": Color("#fbbf24"),
}


static func rarity_fixed_color(r: String) -> Color:
	return RARITY_FIXED_COLOR.get(r, Color("#22c55e"))


static func build_registry() -> Array[MutationDef]:
	var list: Array[MutationDef] = []

	# ---- COMMON (solid stat adjustments) ----
	var elongated := _def(
		"elongated_strike", "Elongated Strike", "common", UNLIMITED,
		"+25% score from essence. Drawback: the snake moves 5% faster.",
		"Strike while the essence is hot.",
		func(snap: GameSnapshot, _stacks: int) -> void:
			snap.score_mult = minf(SCORE_MULT_CAP, snap.score_mult + 0.25)
			snap.speed_mult += 0.05
	)
	list.append(elongated)

	var chitinous := _def(
		"chitinous_shell", "Chitinous Shell", "common", 2,
		"+1 Armor charge (max 2). Striking a placed wall soaks the hit, shatters that wall into open space, and prevents death.",
		"Walls crack before you do.",
		func(snap: GameSnapshot, _stacks: int) -> void:
			snap.chitinous_enabled = true
			snap.wall_charges = mini(snap.chitin_cap, snap.wall_charges + 1)
	)
	list.append(chitinous)

	var nutrient := _def(
		"nutrient_storage", "Nutrient Storage", "common", 3,
		"Reduces the essence needed to open each floor portal by 2.",
		"Every drop counts. Save some for later.",
		func(snap: GameSnapshot, _stacks: int) -> void:
			snap.essence_reduction += 2
	)
	list.append(nutrient)

	var heart := _def(
		"auxiliary_heart", "Auxiliary Heart", "common", 3,
		"+1 Life. Each life revives you on the current floor when you die, keeping your essence progress.",
		"A spare pulse, kept in reserve.",
		func(snap: GameSnapshot, _stacks: int) -> void:
			snap.lives = mini(Config.MAX_LIVES, snap.lives + 1)
	)
	list.append(heart)

	# ---- RARE (hex & grid manipulators) ----
	var fork := _def(
		"tri_directional_fork", "Tri-Directional Fork", "rare", 1,
		"Essence spawns in clusters of 3 adjacent hexes. Eating one makes the other two vanish.",
		"Three morsels, one meal.",
		func(snap: GameSnapshot, _stacks: int) -> void:
			snap.fork_enabled = true
	)
	list.append(fork)

	var shedding := _def(
		"shedding_season", "Shedding Season", "rare", 1,
		"Every 15 hexes traveled, naturally shed your last tail segment - shorter, with no score lost.",
		"Leave the old skin behind.",
		func(snap: GameSnapshot, _stacks: int) -> void:
			snap.shedding_enabled = true
	)
	list.append(shedding)

	var slip := _def(
		"diagonal_slip", "Diagonal Slip", "rare", 1,
		"[SHIFT] 2s window, 15s cooldown: skim along a placed wall instead of crashing into it.",
		"Grease along the grain.",
		func(snap: GameSnapshot, _stacks: int) -> void:
			snap.slip_enabled = true
	)
	list.append(slip)

	# ---- EPIC (active abilities & major modifiers) ----
	var phase := _def(
		"phase_shifter", "Phase Shifter", "epic", 1,
		"[SPACE] Phase through your own body for 4s. 8s cooldown.",
		"Exist halfway between hexes.",
		func(snap: GameSnapshot, _stacks: int) -> void:
			snap.phase_enabled = true
	)
	list.append(phase)

	var acidic := _def(
		"acidic_trail", "Acidic Trail", "epic", 1,
		"Leave a lingering acid wake behind you. Moving hazards that cross it are dissolved.",
		"Your wake dissolves the unwary.",
		func(snap: GameSnapshot, _stacks: int) -> void:
			snap.acidic_enabled = true
	)
	list.append(acidic)

	var hypertrophy := _def(
		"hypertrophy", "Hypertrophy", "epic", 1,
		"+200% score multiplier, but you grow 2 segments per essence instead of 1.",
		"Mass is its own kind of armor.",
		func(snap: GameSnapshot, _stacks: int) -> void:
			snap.score_mult = minf(SCORE_MULT_CAP, snap.score_mult + 2.0)
			snap.growth_per_food += 1
	)
	list.append(hypertrophy)

	var bloom := _def(
		"regenerative_bloom", "Regenerative Bloom", "epic", 1,
		"+2 Lives. Cheat death twice more - each revive drops you back on the current floor.",
		"Where one falls, two rise.",
		func(snap: GameSnapshot, _stacks: int) -> void:
			snap.lives = mini(Config.MAX_LIVES, snap.lives + 2)
	)
	list.append(bloom)

	# ---- LEGENDARY (run-defining) ----
	var ouroboros := _def(
		"ouroboros_loop", "Ouroboros Loop", "legendary", 1,
		"Encircle hazards and bite your own tail to close the loop: everything trapped inside is vaporized into bonus score. You survive.",
		"The serpent that swallows the world.",
		func(snap: GameSnapshot, _stacks: int) -> void:
			snap.ouroboros_enabled = true
	)
	list.append(ouroboros)

	var hydra := _def(
		"hydra_venom", "Hydra's Venom", "legendary", 1,
		"One-time per run: crashing into a ROAMING obstacle severs your front half - the tail half becomes the new head, moving in reverse. (Walls, slime, and the arena edge still kill.)",
		"Cut one head, another remains.",
		func(snap: GameSnapshot, _stacks: int) -> void:
			snap.hydra_enabled = true
	)
	list.append(hydra)

	var apex := _def(
		"apex_predator", "Apex Predator", "legendary", 1,
		"You never die to your own tail. Biting it devours those segments (shortening you) and resets your score multiplier.",
		"At the top, you eat yourself alive.",
		func(snap: GameSnapshot, _stacks: int) -> void:
			snap.apex_enabled = true
	)
	list.append(apex)

	return list


## Build a MutationDef with its apply lambda. (Static helper; mirrors the TS literals.)
static func _def(
		id: String, card_name: String, rarity: String, max_stacks: int,
		description: String, flavor: String, apply_fn: Callable
) -> MutationDef:
	var d := MutationDef.new()
	d.id = id
	d.name = card_name
	d.rarity = rarity
	d.max_stacks = max_stacks
	d.description = description
	d.flavor = flavor
	d.apply = apply_fn
	return d
