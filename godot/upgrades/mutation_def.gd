class_name MutationDef
extends RefCounted
## A mutation card definition (port of MutationDef from src/upgrades/registry.ts).
##
## `apply` is a GDScript lambda (a Callable) that mutates the shared GameSnapshot;
## `stacks` passed to it is the count AFTER this pick. Lambdas are built co-located
## with the card metadata in registry.gd, so adding a card is one spot — and they
## touch ONLY the passed-in snapshot (no autoloads), dodging the static-func/autoload
## gotcha entirely.

var id: String = ""
var name: String = ""
## Mechanic description shown on the card body.
var description: String = ""
## Optional italic flavor line shown under the name ("" = none).
var flavor: String = ""
## "common" | "rare" | "epic" | "legendary".
var rarity: String = "common"
## Maximum times this can be taken. registry.UNLIMITED == unlimited.
var max_stacks: int = 1
## (snap: GameSnapshot, stacks: int) -> void. No-op until registry sets it.
var apply: Callable = Callable()
