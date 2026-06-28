class_name Floor
extends RefCounted
## A procedurally generated floor (port of Floor from src/floor/FloorGenerator.ts).

var grid: GridManager = null
var spawn: Vector2i = Vector2i.ZERO
var spawn_heading: int = 0
var essence_needed: int = 0
var obstacles: Array[MovingObstacle] = []
# Tri-Directional Fork: maps each essence-cluster member to its siblings so eating
# one clears the rest (1 cluster = 1 toward the portal). Vector2i -> Array[Vector2i].
var clusters: Dictionary = {}
