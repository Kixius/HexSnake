class_name InputQueue
extends RefCounted
## Keyboard/touch -> direction buffer. Maps the 6 hex directions, buffers them in a
## small FIFO queue, and filters illegal 180° reverses. Port of src/input/Input.ts.
##
## Keyboard (input/input_router.gd) and touch (ui/touch_controls.gd) BOTH funnel
## through enqueue() — one path. Phase Shifter (phase) and Diagonal Slip (slip) are
## edge-triggered request flags consumed once per tick.
##
##   Q W E   ->   NW  N  NE
##   A S D   ->   SW  S  SE

const MAX_QUEUE: int = 3

var _queue: Array[int] = []
var _phase_requested: bool = false
var _slip_requested: bool = false
# Becomes true on first direction press (used to launch a floor).
var directed: bool = false


## True once the player has pressed any direction this floor.
func has_directed() -> bool:
	return directed


## Push a direction index (0..5). Dedupes consecutive repeats (key repeats).
func enqueue(d: int) -> void:
	if _queue.size() > 0 and _queue[_queue.size() - 1] == d:
		return
	if _queue.size() < MAX_QUEUE:
		_queue.append(d)
	directed = true


## Pull exactly one legal direction. Drops a queued 180° reverse relative to the
## (post-turn) heading and keeps looking. Returns -1 if none legal.
func consume_next(heading: int) -> int:
	while _queue.size() > 0:
		var d: int = _queue.pop_front()
		if d != Hex.opposite(heading):
			return d
	return -1


func request_phase() -> void:
	_phase_requested = true


func request_slip() -> void:
	_slip_requested = true


func consume_phase() -> bool:
	var r: bool = _phase_requested
	_phase_requested = false
	return r


func consume_slip() -> bool:
	var r: bool = _slip_requested
	_slip_requested = false
	return r


## Discard queued directions (e.g. keys mashed during an overlay screen).
func clear_queue() -> void:
	_queue.clear()


func reset_floor() -> void:
	_queue.clear()
	_phase_requested = false
	_slip_requested = false
	directed = false
