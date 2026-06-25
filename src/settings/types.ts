import type { ThemeId } from '../theme';
import type { Difficulty } from '../config';

/** Direction actions use indices 0..5 matching DIRS in grid/hex.ts (N,NE,SE,S,SW,NW). */
export type DirAction = 'dir0' | 'dir1' | 'dir2' | 'dir3' | 'dir4' | 'dir5';

/** Every action the player can rebind. */
export type ActionId = DirAction | 'phase' | 'slip' | 'pause';

/** action -> KeyboardEvent.code. Values are `e.code` strings (e.g. 'KeyW', 'Space'). */
export interface Keybinds {
  dir0: string; // N
  dir1: string; // NE
  dir2: string; // SE
  dir3: string; // S
  dir4: string; // SW
  dir5: string; // NW
  phase: string;
  slip: string;
  pause: string;
}

export interface AudioSettings {
  /** Master music volume 0..1. */
  musicVolume: number;
  /** Sound-effects volume 0..1 (applied when `sfxEnabled` is on). */
  sfxVolume: number;
  muted: boolean;
  sfxEnabled: boolean;
}

export interface Settings {
  keybinds: Keybinds;
  audio: AudioSettings;
  theme: ThemeId;
  /** Run difficulty (easy/normal/hard). Applied at run start in Game.startRun. */
  difficulty: Difficulty;
}
