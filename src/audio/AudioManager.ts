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
 * real gain nodes. Background music is registered via `registerMusic` and loops
 * through `musicGain` (so volume/mute apply live); it starts on the first user
 * gesture via `resume()`, satisfying browser autoplay policies. SFX still has no
 * assets, so `playSfx` stays a graceful no-op until they land. The AudioContext
 * is created lazily and resumed on the first user gesture.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private musicVolume = 0.25;
  private sfxVolume = 0.25;
  private muted = false;
  private sfxEnabled = true;

  private musicId: string | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  /** Decoded one-shot SFX buffers, keyed by id (registered at boot). */
  private sfxBuffers = new Map<string, AudioBuffer>();

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

  /** Resume the context — call on the first user gesture (autoplay policy).
   *  Once running, kicks off any registered background music. */
  resume(): void {
    this.ensure();
    this.ctx?.resume().then(() => this.startMusic()).catch(() => {});
  }

  /** Apply a full audio-settings block (stores values; applies to graph if up). */
  apply(s: AudioSettings): void {
    this.musicVolume = s.musicVolume;
    this.sfxVolume = s.sfxVolume;
    this.muted = s.muted;
    this.sfxEnabled = s.sfxEnabled;
    this.applyGains();
  }

  private applyGains(): void {
    if (!this.master || !this.musicGain || !this.sfxGain) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.musicGain.gain.value = this.musicVolume;
    this.sfxGain.gain.value = this.sfxEnabled ? this.sfxVolume : 0;
  }

  // ---- asset hooks ----

  /**
   * Register a looping background track (fetch + decode). Starts immediately if
   * the AudioContext is already running (registered after the first gesture);
   * otherwise it starts on the next `resume()`. Decode/loading errors are
   * swallowed so a missing asset never breaks gameplay.
   */
  registerMusic(id: string, url: string): void {
    this.ensure();
    this.musicId = id;
    const ctx = this.ctx;
    if (!ctx) return;
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        this.musicBuffer = decoded;
        // If the player already interacted (ctx running), start right away; the
        // normal case is that resume() starts it, but this covers late loads.
        if (ctx.state === 'running') this.startMusic();
      })
      .catch(() => {
        /* asset missing / decode error — ignore; game stays silent but playable */
      });
  }

  /** Play the registered track if `id` matches (no-op if already playing). */
  playMusic(id: string): void {
    if (id !== this.musicId) return;
    this.startMusic();
  }

  /** Idempotently start the looping music source through `musicGain`. */
  private startMusic(): void {
    if (this.musicSource || !this.musicBuffer || !this.ctx || !this.musicGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.musicBuffer;
    src.loop = true;
    src.connect(this.musicGain);
    src.start();
    this.musicSource = src;
  }

  /**
   * Register a one-shot SFX (fetch + decode into the buffer map). Load errors are
   * swallowed so a missing asset never breaks gameplay. Ensures the context first
   * so decode can proceed even before the first user gesture.
   */
  registerSfx(id: string, url: string): void {
    this.ensure();
    const ctx = this.ctx;
    if (!ctx) return;
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        this.sfxBuffers.set(id, decoded);
      })
      .catch(() => {
        /* asset missing / decode error — ignore */
      });
  }

  /** Play a registered one-shot SFX through `sfxGain`. No-op if SFX are disabled,
   *  the buffer isn't loaded yet, or the context isn't up. Each call spawns a fresh
   *  BufferSource (they're one-shot), so overlapping plays are fine. */
  playSfx(id: string): void {
    if (!this.sfxEnabled) return;
    const buf = this.sfxBuffers.get(id);
    if (!buf || !this.ctx || !this.sfxGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.sfxGain);
    src.start();
  }
}

export const audioManager = new AudioManager();
