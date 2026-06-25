/**
 * SFX registry: id → wav filename (served from public/sfx/). Game registers each
 * at boot via `audioManager.registerSfx(id, `${BASE_URL}sfx/${file}`)`, then
 * triggers them with `audioManager.playSfx(id)`.
 *
 * To add a new sound: drop a `<id>.wav` into public/sfx/, add an entry here, and
 * call `audioManager.playSfx('<id>')` at the event site. To retune the generated
 * sounds, edit scripts/gen-sfx.mjs and re-run `node scripts/gen-sfx.mjs`.
 */
export const SFX_FILES: ReadonlyArray<{ id: string; file: string }> = [
  // UI
  { id: 'hover', file: 'hover.wav' },
  { id: 'click', file: 'click.wav' },
  // snake movement (turn tick)
  { id: 'move', file: 'move.wav' },
  // eating
  { id: 'eat_essence', file: 'eat_essence.wav' },
  { id: 'eat_spore', file: 'eat_spore.wav' },
  { id: 'eat_core', file: 'eat_core.wav' },
  // progress / level
  { id: 'portal', file: 'portal.wav' },
  { id: 'next_level', file: 'next_level.wav' },
  { id: 'upgrade', file: 'upgrade.wav' },
  // life / death
  { id: 'death', file: 'death.wav' },
  { id: 'respawn', file: 'respawn.wav' },
  // walls (Chitinous Shell)
  { id: 'wall_impact', file: 'wall_impact.wav' },
  { id: 'wall_break', file: 'wall_break.wav' },
  // slime / acid
  { id: 'slime', file: 'slime.wav' },
  { id: 'dissolve', file: 'dissolve.wav' },
  { id: 'vaporize', file: 'vaporize.wav' },
  // abilities
  { id: 'hydra', file: 'hydra.wav' },
  { id: 'apex', file: 'apex.wav' },
];
