## Cell occupants (port of the Occupant enum from src/game/types.ts).
## Stored as ints in the grid Dictionary.
class_name Occupant
extends RefCounted

enum {
	EMPTY,        # 0
	WALL,         # 1
	SLIME,        # 2
	ESSENCE,      # 3
	CHAMBER_CORE, # 4
	PORTAL,       # 5
	# Spore pellet: a beneficial pickup — collecting it permanently slows the snake
	# (a buff). Not required to advance; passable (not a wall).
	SPORE,        # 6
}
