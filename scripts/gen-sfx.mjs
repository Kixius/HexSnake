// Procedural SFX generator for HexSnake.
//
// Synthesizes short retro-style sound effects as 16-bit PCM WAV files into
// public/sfx/. No external assets or deps — pure Node. Re-run any time to
// regenerate:  `node scripts/gen-sfx.mjs`
//
// The game loads these via AudioManager.registerSfx(id, `${BASE_URL}sfx/<file>`).
// To replace a sound, swap the WAV in public/sfx/ (keep the filename) or edit the
// synth below and re-run. To add a new one, add an entry to SOUNDS + register/play
// it in code.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SR = 44100; // sample rate (Hz)
const OUT = join(process.cwd(), 'public', 'sfx');
mkdirSync(OUT, { recursive: true });

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;

// ---- core synthesis primitives ----

/** Render `durSec` of audio by sampling fn(t, i) → [-1,1]. */
function render(durSec, fn) {
  const n = Math.max(1, Math.floor(durSec * SR));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i);
  return out;
}

/** Percussive envelope: instant-ish attack, exponential decay. */
function perc(t, attack, decay) {
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) / decay);
}

const sine = (f, t) => Math.sin(TAU * f * t);
const squ = (f, t) => (((f * t) % 1) + 1) % 1 < 0.5 ? 1 : -1;
const saw = (f, t) => 2 * ((((f * t) % 1) + 1) % 1) - 1;
const tri = (f, t) => {
  const x = (((f * t) % 1) + 1) % 1;
  return x < 0.5 ? 4 * x - 1 : 3 - 4 * x;
};

/** White noise buffer. */
function noise(durSec) {
  return render(durSec, () => Math.random() * 2 - 1);
}

/** Apply an envelope fn(t) to a buffer. */
function shape(buf, fn) {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * fn(i / SR);
  return out;
}

/** One-pole low-pass (coeff smaller = duller). */
function lp(buf, coeff) {
  let state = 0;
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    state += coeff * (buf[i] - state);
    out[i] = state;
  }
  return out;
}

/** Element-wise mix (pads the shorter). */
function mix(a, b, gainB = 1) {
  const n = Math.max(a.length, b.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0) * gainB;
  return out;
}

/** Concatenate buffers end-to-end. */
function concat(parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Sequential arpeggio (one note per noteDur). */
function arp(notes, noteDur, osc, decay) {
  return concat(notes.map((f) => render(noteDur, (t) => osc(f, t) * perc(t, 0.003, decay))));
}

// ---- output: scale to a relative loudness, soft-clip, write WAV ----

function emit(name, buf, peak = 0.7) {
  let mx = 0;
  for (const s of buf) mx = Math.max(mx, Math.abs(s));
  const g = mx > 1e-6 ? peak / mx : 1;
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = Math.tanh(buf[i] * g * 1.2) * 0.9;
  writeWav(name, out);
}

function writeWav(name, buf) {
  const data = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    data[i] = Math.max(-32768, Math.min(32767, Math.round(buf[i] * 32767)));
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length * 2, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // subchunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length * 2, 40);
  writeFileSync(join(OUT, name), Buffer.concat([header, Buffer.from(data.buffer)]));
  console.log(`  ${name}  (${(buf.length / SR).toFixed(3)}s, ${buf.length * 2} bytes)`);
}

// ---- the sounds ----

const SOUNDS = {
  // UI
  hover: render(0.05, (t) => sine(880, t) * perc(t, 0.002, 0.014)),
  click: render(0.055, (t) => sine(lerp(700, 1200, t / 0.055), t) * perc(t, 0.002, 0.02)),
  // snake movement (subtle turn tick)
  move: render(0.035, (t) => tri(200, t) * perc(t, 0.001, 0.012)),
  // eating
  eat_essence: render(0.1, (t) => sine(lerp(660, 990, t / 0.1), t) * perc(t, 0.003, 0.05)),
  eat_spore: render(0.14, (t) => (sine(lerp(700, 1400, t / 0.14), t) * 0.6 + tri(lerp(700, 1400, t / 0.14), t) * 0.4) * perc(t, 0.003, 0.05)),
  eat_core: render(0.2, (t) => ((sine(523, t) + sine(659, t) + sine(784, t)) / 3) * perc(t, 0.004, 0.09)),
  // progress / level
  portal: render(0.24, (t) => sine(lerp(440, 1320, t / 0.24) + Math.sin(TAU * 6 * t) * 8, t) * perc(t, 0.005, 0.1)),
  next_level: arp([523, 659, 784], 0.09, tri, 0.05),
  upgrade: render(0.28, (t) => ((sine(523, t) + sine(659, t) + sine(784, t)) / 3) * perc(t, 0.005, 0.12)),
  // life / death
  death: render(0.5, (t) => squ(lerp(440, 110, t / 0.5) + Math.sin(TAU * 7 * t) * 6, t) * perc(t, 0.005, 0.25)),
  respawn: mix(
    render(0.2, (t) => sine(lerp(400, 120, t / 0.2), t) * perc(t, 0.003, 0.1)),
    shape(lp(noise(0.2), 0.4), (t) => perc(t, 0.003, 0.08)),
    0.6,
  ),
  // walls (Chitinous Shell)
  wall_impact: mix(
    render(0.13, (t) => sine(lerp(120, 70, t / 0.13), t) * perc(t, 0.002, 0.06)),
    shape(lp(noise(0.06), 0.3), (t) => perc(t, 0.001, 0.03)),
    0.7,
  ),
  wall_break: mix(
    shape(lp(noise(0.15), 0.2), (t) => perc(t, 0.002, 0.05)),
    render(0.15, (t) => sine(80, t) * perc(t, 0.002, 0.05)),
    0.6,
  ),
  // slime / acid
  slime: mix(
    render(0.09, (t) => sine(lerp(220, 140, t / 0.09) + Math.sin(TAU * 30 * t) * 5, t) * perc(t, 0.002, 0.03)),
    shape(lp(noise(0.05), 0.4), (t) => perc(t, 0.002, 0.02)),
    0.5,
  ),
  dissolve: shape(noise(0.12), (t) => perc(t, 0.002, 0.045)),
  vaporize: mix(
    render(0.18, (t) => squ(lerp(880, 220, t / 0.18), t) * perc(t, 0.002, 0.08)),
    shape(noise(0.1), (t) => perc(t, 0.002, 0.04)),
    0.5,
  ),
  // abilities
  hydra: arp([880, 440], 0.08, squ, 0.05),
  apex: mix(
    render(0.18, (t) => saw(lerp(110, 55, t / 0.18), t) * perc(t, 0.003, 0.08)),
    shape(lp(noise(0.18), 0.3), (t) => perc(t, 0.003, 0.06)),
    0.6,
  ),
};

// per-sound relative loudness (peak target)
const PEAKS = {
  hover: 0.32,
  click: 0.42,
  move: 0.28,
  eat_essence: 0.6,
  eat_spore: 0.6,
  eat_core: 0.65,
  portal: 0.6,
  next_level: 0.72,
  upgrade: 0.6,
  death: 0.85,
  respawn: 0.6,
  wall_impact: 0.8,
  wall_break: 0.8,
  slime: 0.5,
  dissolve: 0.5,
  vaporize: 0.6,
  hydra: 0.6,
  apex: 0.65,
};

console.log(`Generating SFX into ${OUT} ...`);
for (const [name, buf] of Object.entries(SOUNDS)) {
  emit(`${name}.wav`, buf, PEAKS[name] ?? 0.7);
}
console.log(`Done — ${Object.keys(SOUNDS).length} files.`);
