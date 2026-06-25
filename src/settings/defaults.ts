import { DEFAULT_THEME_ID } from '../theme';
import type { AudioSettings, Keybinds, Settings } from './types';

/**
 * Defaults lifted verbatim from the pre-settings hardcoded layout so a fresh
 * install plays identically to before. See CLAUDE.md key map.
 */
export const DEFAULT_KEYBINDS: Keybinds = {
  dir0: 'KeyW', // N
  dir1: 'KeyE', // NE
  dir2: 'KeyD', // SE
  dir3: 'KeyS', // S
  dir4: 'KeyA', // SW
  dir5: 'KeyQ', // NW
  phase: 'Space',
  slip: 'ShiftLeft',
  pause: 'KeyP',
};

export const DEFAULT_AUDIO: AudioSettings = {
  musicVolume: 0.25,
  muted: false,
  sfxEnabled: true,
};

export const DEFAULT_SETTINGS: Settings = {
  keybinds: { ...DEFAULT_KEYBINDS },
  audio: { ...DEFAULT_AUDIO },
  theme: DEFAULT_THEME_ID,
  difficulty: 'normal',
};

/** Fresh deep copy so callers never mutate the shared default object. */
export function cloneDefaults(): Settings {
  return {
    keybinds: { ...DEFAULT_KEYBINDS },
    audio: { ...DEFAULT_AUDIO },
    theme: DEFAULT_SETTINGS.theme,
    difficulty: DEFAULT_SETTINGS.difficulty,
  };
}
