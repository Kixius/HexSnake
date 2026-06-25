import { isThemeId } from '../theme';
import { DIFFICULTY_ORDER } from '../config';
import type { Difficulty } from '../config';
import { cloneDefaults } from './defaults';
import type { AudioSettings, Keybinds, Settings } from './types';

const STORAGE_KEY = 'hexsnake.settings.v1';

type Listener = (s: Settings) => void;

/**
 * Versioned settings persisted to localStorage. Loads are defensive: any
 * corruption or missing key falls back to defaults (never throws). Writes
 * happen on every change (cheap at this volume).
 */
class SettingsStore {
  private settings: Settings = cloneDefaults();
  private listeners = new Set<Listener>();

  get current(): Settings {
    return this.settings;
  }

  get keybinds(): Keybinds {
    return this.settings.keybinds;
  }

  get audio(): AudioSettings {
    return this.settings.audio;
  }

  get difficulty(): Difficulty {
    return this.settings.difficulty;
  }

  /** Load from storage (deep-merged over defaults). Safe to call once at boot. */
  load(): Settings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.settings = merge(JSON.parse(raw));
      else this.settings = cloneDefaults();
    } catch {
      this.settings = cloneDefaults();
    }
    return this.settings;
  }

  /** Persist current settings. */
  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage unavailable / quota — ignore; settings stay in-memory */
    }
  }

  setKeybinds(kb: Keybinds): void {
    this.settings = { ...this.settings, keybinds: { ...kb } };
    this.save();
    this.emit();
  }

  setAudio(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, audio: { ...this.settings.audio, ...patch } };
    this.save();
    this.emit();
  }

  setTheme(theme: Settings['theme']): void {
    this.settings = { ...this.settings, theme };
    this.save();
    this.emit();
  }

  setDifficulty(difficulty: Difficulty): void {
    this.settings = { ...this.settings, difficulty };
    this.save();
    this.emit();
  }

  onChange(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(): void {
    for (const cb of this.listeners) cb(this.settings);
  }
}

export const settingsStore = new SettingsStore();

// ---- defensive merge over defaults ----

function merge(parsed: unknown): Settings {
  const out = cloneDefaults();
  if (!parsed || typeof parsed !== 'object') return out;
  const p = parsed as Record<string, unknown>;
  if (p.keybinds) out.keybinds = mergeKeybinds(p.keybinds, out.keybinds);
  if (p.audio) out.audio = mergeAudio(p.audio, out.audio);
  if (isThemeId(p.theme)) out.theme = p.theme;
  if (isDifficulty(p.difficulty)) out.difficulty = p.difficulty;
  return out;
}

function mergeKeybinds(src: unknown, def: Keybinds): Keybinds {
  if (!src || typeof src !== 'object') return { ...def };
  const s = src as Record<string, unknown>;
  const out = { ...def };
  (Object.keys(def) as (keyof Keybinds)[]).forEach((k) => {
    const v = s[k];
    if (typeof v === 'string' && v.length > 0) out[k] = v;
  });
  return out;
}

function mergeAudio(src: unknown, def: AudioSettings): AudioSettings {
  if (!src || typeof src !== 'object') return { ...def };
  const s = src as Record<string, unknown>;
  const out = { ...def };
  if (typeof s.musicVolume === 'number' && Number.isFinite(s.musicVolume)) {
    out.musicVolume = Math.max(0, Math.min(1, s.musicVolume));
  }
  if (typeof s.sfxVolume === 'number' && Number.isFinite(s.sfxVolume)) {
    out.sfxVolume = Math.max(0, Math.min(1, s.sfxVolume));
  }
  if (typeof s.muted === 'boolean') out.muted = s.muted;
  if (typeof s.sfxEnabled === 'boolean') out.sfxEnabled = s.sfxEnabled;
  return out;
}

function isDifficulty(x: unknown): x is Difficulty {
  return typeof x === 'string' && (DIFFICULTY_ORDER as readonly string[]).includes(x);
}
