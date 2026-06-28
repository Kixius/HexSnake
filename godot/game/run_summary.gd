class_name RunSummary
extends RefCounted
## A completed run's summary for the death / end-run screen. Port of RunSummary from
## src/game/types.ts. Pure data (no autoload refs) so it's `-s`-safe.

## True when the player ended the run voluntarily (pause -> END RUN); false when they
## died. Drives the title text/color ("RUN ENDED" gold vs "YOU DIED" red) and hides the
## slain-by line.
var ended: bool = false
## Difficulty label frozen at run start (e.g. "NORMAL"), shown in the stats.
var difficulty: String = "NORMAL"
var depth: int = 1
var score: int = 0
var length: int = 0
## Active mutations as {"name", "stacks"} entries (from UpgradeSystem.build_summary()).
var mutations: Array = []
## DeathReason int for a real death, or -1 when the run was ended voluntarily.
var reason: int = -1
