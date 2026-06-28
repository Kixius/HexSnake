class_name UpgradeSystem
extends RefCounted
## Owns the mutation lifecycle: rolls 3 weighted-distinct choices for the upgrade
## screen, applies picks to the shared GameSnapshot, tracks the active build for the
## HUD, and is the SOLE writer of GameSnapshot (with the documented snake-side
## `hydra_used` exception). Port of src/upgrades/UpgradeSystem.ts.

# The full card list (rebuilt per run, like the TS `new UpgradeSystem()`).
var registry: Array[MutationDef] = Registry.build_registry()
# Active build: Array[ActiveMutation]. Empty until picks land.
var active: Array = []


## 3 weighted-distinct choices, excluding maxed-out upgrades (exponential race).
func roll_three() -> Array[MutationDef]:
	var candidates: Array[MutationDef] = []
	for d in registry:
		if not is_maxed(d):
			candidates.append(d)
	# Exponential race: key = -ln(rand) / weight. Higher weight -> smaller key -> picked.
	var keyed: Array = []
	for d in candidates:
		var w: float = float(Registry.RARITY_WEIGHT.get(d.rarity, 1.0))
		var k: float = -log(randf()) / w
		keyed.append({"def": d, "k": k})
	keyed.sort_custom(func(a, b) -> bool: return float(a["k"]) < float(b["k"]))
	var out: Array[MutationDef] = []
	var take: int = mini(3, keyed.size())
	for i in range(take):
		out.append(keyed[i]["def"])
	return out


func is_maxed(def: MutationDef) -> bool:
	var entry: ActiveMutation = _find_active(def.id)
	if entry == null:
		return false
	return entry.stacks >= def.max_stacks


## Apply one pick of `id` to the shared snapshot, incrementing its stack count and
## invoking the card's apply lambda. No-op if unknown or already maxed.
func apply(id: String, snap: GameSnapshot) -> void:
	var def: MutationDef = _find_def(id)
	if def == null:
		return
	var entry: ActiveMutation = _find_active(id)
	if entry == null:
		entry = ActiveMutation.new()
		entry.def = def
		entry.stacks = 0
		active.append(entry)
	if entry.stacks >= def.max_stacks:
		return
	entry.stacks += 1
	def.apply.call(snap, entry.stacks)


func reset() -> void:
	active.clear()


## Apex Predator resets the score multiplier to 1 (sole-writer rule).
func reset_multiplier(snap: GameSnapshot) -> void:
	snap.score_mult = 1.0


## Consuming a spore pellet adds a permanent slow stack (sole-writer rule). tick_dt
## turns the stack count into the actual multiplicative speed factor.
func apply_spore(snap: GameSnapshot) -> void:
	snap.spore_stacks += 1


## Active mutations as {"name", "stacks"} for the death screen / HUD.
func build_summary() -> Array:
	var out: Array = []
	for a in active:
		out.append({"name": a.def.name, "stacks": a.stacks})
	return out


func _find_def(id: String) -> MutationDef:
	for d in registry:
		if d.id == id:
			return d
	return null


func _find_active(id: String) -> ActiveMutation:
	for a in active:
		if a.def.id == id:
			return a
	return null


class ActiveMutation:
	extends RefCounted
	var def: MutationDef = null
	var stacks: int = 0
