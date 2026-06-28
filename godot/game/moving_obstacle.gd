class_name MovingObstacle
extends RefCounted
## A roaming hazard (port of MovingObstacle from src/game/types.ts).

var hex: Vector2i = Vector2i.ZERO
var prev_hex: Vector2i = Vector2i.ZERO
# Ticks until the obstacle moves again.
var move_counter: int = 0
