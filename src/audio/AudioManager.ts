import type { AudioSettings } from '../settings/types';

type AudioCtxCtor = typeof AudioContext;

function getAudioCtor(): AudioCtxCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioCtxCtor;
    webkitAudioContext?: AudioCtxCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Audio engine: lazy AudioContext + gain graph. Controls (volume/mute/SFX) drive
 * real gain nodes now; there are no tracks yet, so `playMusic`/`playSfx` are
 * graceful no-ops until assets are registered later (drop-in, no other code
 * changes). The AudioContext is created lazily and resumed on the first user
 * gesture to satisfy browser autoplay policies.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private musicVolume = 0.6;
  private muted = false;
  private sfxEnabled = true;

  /** Create the context + gain graph (idempotent). Safe to call anytime. */
  private ensure(): void {
    if (this.ctx) return;
    const Ctor = getAudioCtor();
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyGains();
    } catch {
      this.ctx = null;
    }
  }

  /** Resume the context — call on the first user gesture (autoplay policy). */
  resume(): void {
    this.ensure();
    this.ctx?.resume().catch(() => {});
  }

  /** Apply a full audio-settings block (stores values; applies to graph if up). */
  apply(s: AudioSettings): void {
    this.musicVolume = s.musicVolume;
    this.muted = s.muted;
    this.sfxEnabled = s.sfxEnabled;
    this.applyGains();
  }

  private applyGains(): void {
    if (!this.master || !this.musicGain || !this.sfxGain) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.musicGain.gain.value = this.musicVolume;
    this.sfxGain.gain.value = this.sfxEnabled ? 1 : 0;
  }

  // ---- future asset hooks (no-ops until tracks/SFX are registered) ----

  playMusic(_id: string): void {
    /* wired when registerMusic(id, url) lands */
  }

  playSfx(_id: string): void {
    /* wired when registerSfx(id, url) lands */
  }
}

export const audioManager = new AudioManager();
