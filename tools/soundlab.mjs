// Sound lab (2026-10-30): the headless side of the game's sound work. SeptaBee (the user's DAW) is GUI-only, with no command line,
// no scripting and no text project format, so Claude cannot drive it (.claude/skills/septabee/SKILL.md). This is the part that can run
// without it: render a sound from a JSON recipe (the same parts a SeptaBee rack would have: oscillators, noise, envelopes, filters,
// bitcrush), inspect and conform any WAV (the user's SeptaBee exports included) to what the game wants, and put the result in
// client/public/audio/voice with its manifest entry.
//
//   node tools/soundlab.mjs presets
//   node tools/soundlab.mjs render <preset|recipe.json> <out.wav> [--seed n]
//   node tools/soundlab.mjs inspect <file.wav>...
//   node tools/soundlab.mjs look <file.wav> [out.png]      a picture of the sound (waveform over a spectrogram) for Claude to read
//   node tools/soundlab.mjs import <in.wav> <bank>/<cue>        a SeptaBee export becomes one take of a cue
//   node tools/soundlab.mjs import <in.wav> ir/<helmet|mask|comms>
//   node tools/soundlab.mjs bank <bank> <cue> [takes] [--preset name]   render varied takes and import them
//   node tools/soundlab.mjs ir <helmet|mask|comms>                      render the impulse response and import it
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SR = 48000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOICE = path.join(ROOT, "client/public/audio/voice");
// server/dialogue.ts CUES (tests/world/soundlab.test.ts checks they agree)
export const CUES = ["chuckle", "laugh", "sigh", "breath", "groan", "cough", "wheeze", "hmm", "gasp", "growl", "beep", "whistle", "static"];
export const BANKS = ["human", "droid", "wookiee", "small", "large"];
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const lin = (d) => 10 ** (d / 20);

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- WAV in and out ----

// PCM 8/16/24/32, float32 and WAVE_FORMAT_EXTENSIBLE; returns { sr, channels: Float32Array[] }
export function readWav(buf) {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE")
    throw new Error("not a WAV file (in SeptaBee's Export Audio choose WAV; FLAC and Ogg are not read here)");
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") {
      fmt = { tag: buf.readUInt16LE(body), ch: buf.readUInt16LE(body + 2), sr: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
      if (fmt.tag === 0xfffe) fmt.tag = buf.readUInt16LE(body + 24);
    } else if (id === "data") data = buf.subarray(body, Math.min(body + size, buf.length));
    pos = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error("WAV has no fmt or data chunk");
  if (![1, 3].includes(fmt.tag)) throw new Error(`WAV format ${fmt.tag} is compressed; export plain PCM or float`);
  const bytes = fmt.bits / 8;
  const n = Math.floor(data.length / (bytes * fmt.ch));
  const channels = Array.from({ length: fmt.ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++)
    for (let c = 0; c < fmt.ch; c++) {
      const o = (i * fmt.ch + c) * bytes;
      channels[c][i] =
        fmt.tag === 3 ? (bytes === 8 ? data.readDoubleLE(o) : data.readFloatLE(o))
        : bytes === 1 ? (data[o] - 128) / 128
        : bytes === 2 ? data.readInt16LE(o) / 32768
        : bytes === 3 ? data.readIntLE(o, 3) / 8388608
        : data.readInt32LE(o) / 2147483648;
    }
  return { sr: fmt.sr, channels };
}

// mono samples to a 16- or 24-bit PCM WAV
export function writeWav(x, sr = SR, bits = 16) {
  const bytes = bits / 8;
  const out = Buffer.alloc(44 + x.length * bytes);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + x.length * bytes, 4);
  out.write("WAVEfmt ", 8, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sr, 24);
  out.writeUInt32LE(sr * bytes, 28);
  out.writeUInt16LE(bytes, 32);
  out.writeUInt16LE(bits, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(x.length * bytes, 40);
  const top = 2 ** (bits - 1);
  for (let i = 0; i < x.length; i++) {
    const v = Math.max(-1, Math.min(1, x[i])) * (top - 1);
    if (bits === 16) out.writeInt16LE(Math.round(v), 44 + i * 2);
    else out.writeIntLE(Math.round(v), 44 + i * 3, 3);
  }
  return out;
}

// ---- DSP ----

function coef(type, f, q, gainDb, sr) {
  const w = (2 * Math.PI * Math.min(f, sr * 0.49)) / sr;
  const c = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === "lowpass") [b0, b1, b2, a0, a1, a2] = [(1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al];
  else if (type === "highpass") [b0, b1, b2, a0, a1, a2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al];
  else if (type === "bandpass") [b0, b1, b2, a0, a1, a2] = [al, 0, -al, 1 + al, -2 * c, 1 - al];
  else if (type === "peak") [b0, b1, b2, a0, a1, a2] = [1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A];
  else throw new Error(`filter type ${type}? (lowpass highpass bandpass peak)`);
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

// RBJ biquad; `to` sweeps the cutoff from f to `to` (geometrically) over the sound
export function biquad(x, s, sr = SR) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, k = [0, 0, 0, 0, 0];
  for (let i = 0; i < x.length; i++) {
    if (i % 32 === 0) k = coef(s.type, s.to ? s.f * (s.to / s.f) ** (i / x.length) : s.f, s.q ?? 0.707, s.gain ?? 0, sr);
    const v = k[0] * x[i] + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

const chain = (x, f, sr) => (f ? [].concat(f) : []).reduce((a, s) => biquad(a, s, sr), x);

// one layer of a recipe: osc (sine square saw tri; fm, vib, am), noise (white pink brown; gate), env [a d s r], filter(s), crush, drive
function layer(l, sr, rand) {
  const len = Math.max(1, Math.round((l.len ?? 0.3) * sr));
  const T = len / sr;
  const x = new Float32Array(len);
  const [f0, f1] = Array.isArray(l.freq) ? l.freq : [l.freq ?? 440, l.freq ?? 440];
  const [a, d, s, r] = l.env ?? [0.004, 0.04, 0.8, 0.04];
  let ph = 0, b = 0, p = [0, 0, 0], gate = 1, gateAt = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const f = f0 * (f1 / f0) ** (i / len) * (1 + (l.vib ? l.vib.depth * Math.sin(2 * Math.PI * l.vib.hz * t) : 0));
    ph = (ph + f / sr) % 1;
    let v = 0;
    if (l.osc) {
      const m = l.fm ? l.fm.depth * Math.sin(2 * Math.PI * ph * l.fm.ratio) : 0;
      v = l.osc === "sine" ? Math.sin(2 * Math.PI * ph + m)
        : l.osc === "square" ? (ph < (l.pw ?? 0.5) ? 1 : -1)
        : l.osc === "saw" ? 2 * ph - 1
        : 4 * Math.abs(ph - 0.5) - 1;
    }
    if (l.noise) {
      const w = rand() * 2 - 1;
      let n = w;
      if (l.noise === "pink") { p[0] = 0.99765 * p[0] + w * 0.099046; p[1] = 0.963 * p[1] + w * 0.2965164; p[2] = 0.57 * p[2] + w * 1.0526913; n = (p[0] + p[1] + p[2] + w * 0.1848) * 0.3; }
      else if (l.noise === "brown") { b = (b + 0.02 * w) / 1.02; n = b * 3.5; }
      if (l.gate && i >= gateAt) { gate = rand() < l.gate.duty ? 1 : 0; gateAt = i + sr / l.gate.hz; }
      v += n * (l.mix ?? (l.osc ? 0.4 : 1)) * (l.gate ? gate : 1);
    }
    if (l.am) v *= 1 - l.am.depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * l.am.hz * t));
    const e = t < a ? t / a : t < a + d ? 1 - (1 - s) * ((t - a) / d) : t < T - r ? s : s * Math.max(0, (T - t) / r);
    x[i] = v * e;
  }
  let y = chain(x, l.filter, sr);
  if (l.crush) {
    const step = 2 ** (l.crush.bits - 1);
    const hold = l.crush.hold ?? 1;
    let held = 0;
    for (let i = 0; i < y.length; i++) {
      if (i % hold === 0) held = Math.round(y[i] * step) / step;
      y[i] = held;
    }
  }
  if (l.drive) y = y.map((v) => Math.tanh(v * l.drive) / Math.tanh(l.drive));
  return y.map((v) => v * (l.gain ?? 1));
}

// A recipe: { seconds?, layers: [{ start, len, ..., repeat: { n, gap, step } }], master?: { filter, peak } }, or an impulse response
// { ir: { chain: [filters], tail: { ms, amp } }, seconds }. Same recipe and seed, same sound.
export function render(recipe, seed = 1, sr = SR) {
  const rand = rng(seed);
  if (recipe.ir) {
    const n = Math.round((recipe.seconds ?? 0.2) * sr);
    const x = new Float32Array(n);
    x[0] = 1;
    const y = chain(x, recipe.ir.chain, sr);
    if (recipe.ir.tail) {
      const tau = (recipe.ir.tail.ms / 1000) * sr;
      for (let i = 1; i < n; i++) y[i] += (rand() * 2 - 1) * recipe.ir.tail.amp * Math.exp(-i / tau);
    }
    return peakTo(y, lin(-1));
  }
  const parts = [];
  let end = 0;
  for (const l of recipe.layers) {
    const rep = l.repeat ?? { n: 1, gap: 0, step: 1 };
    for (let i = 0; i < rep.n; i++) {
      const fr = (v) => (Array.isArray(v) ? v.map((q) => q * rep.step ** i) : v * rep.step ** i);
      const at = Math.round(((l.start ?? 0) + i * rep.gap) * sr);
      const y = layer({ ...l, freq: l.freq == null ? l.freq : fr(l.freq) }, sr, rand);
      parts.push([at, y]);
      end = Math.max(end, at + y.length);
    }
  }
  let mix = new Float32Array(Math.max(end, Math.round((recipe.seconds ?? 0) * sr)));
  for (const [at, y] of parts) for (let i = 0; i < y.length; i++) mix[at + i] += y[i];
  mix = chain(mix, recipe.master?.filter, sr);
  const out = peakTo(mix, lin(recipe.master?.peak ?? -3));
  const fade = Math.min(out.length, Math.round(0.005 * sr));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

function peakTo(x, target) {
  let pk = 0;
  for (const v of x) pk = Math.max(pk, Math.abs(v));
  return pk > 0 ? x.map((v) => (v * target) / pk) : x;
}

// ---- what the game wants of a file ----

export function inspect(x, sr) {
  let pk = 0, sum = 0, dc = 0, clipped = 0;
  for (const v of x) { pk = Math.max(pk, Math.abs(v)); sum += v * v; dc += v; if (Math.abs(v) >= 0.999) clipped++; }
  let lead = 0;
  while (lead < x.length && Math.abs(x[lead]) < lin(-50)) lead++;
  const r = { sr, seconds: x.length / sr, peakDb: db(pk), rmsDb: db(Math.sqrt(sum / (x.length || 1))), dc: dc / (x.length || 1), leadMs: (lead / sr) * 1000, clipped };
  r.notes = [];
  if (sr !== SR) r.notes.push(`${sr} Hz (the game wants ${SR}; import resamples)`);
  if (r.leadMs > 30) r.notes.push(`${r.leadMs.toFixed(0)} ms of silence first (import trims to 30)`);
  if (r.peakDb > -1) r.notes.push(`peak ${r.peakDb.toFixed(1)} dBFS (cues should peak at -3)`);
  if (clipped > 2) r.notes.push(`${clipped} clipped samples`);
  if (Math.abs(r.dc) > 0.01) r.notes.push("DC offset (import removes it)");
  if (r.seconds > 2.5) r.notes.push(`${r.seconds.toFixed(1)} s is long for a cue`);
  return r;
}

// A SeptaBee export (any channels, rate or level) made into one dry mono take: mixed down, resampled to 48 kHz, DC removed,
// silence trimmed (30 ms kept before, 20 ms after), peak -3 dBFS (an impulse response keeps its shape: peak -1), a 10 ms fade out
export function conform(wav, { ir = false } = {}) {
  const n = wav.channels[0].length;
  let x = new Float32Array(n);
  for (const c of wav.channels) for (let i = 0; i < n; i++) x[i] += c[i] / wav.channels.length;
  if (wav.sr !== SR) {
    const m = Math.round((n * SR) / wav.sr);
    const y = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const at = (i * wav.sr) / SR, k = Math.floor(at), u = at - k;
      y[i] = x[k] * (1 - u) + (x[Math.min(k + 1, n - 1)] ?? 0) * u;
    }
    x = y;
  }
  if (!ir) {
    // a DC blocker (not the mean: a long silence before the sound would keep half the offset)
    const y = new Float32Array(x.length);
    for (let i = 1; i < x.length; i++) y[i] = x[i] - x[i - 1] + 0.995 * y[i - 1];
    x = y;
  }
  const quiet = (i, d) => Math.abs(x[i]) < lin(d);
  let a = 0, b = x.length;
  while (a < b && quiet(a, -50)) a++;
  while (b > a && quiet(b - 1, -55)) b--;
  const from = Math.max(0, a - Math.round(0.03 * SR));
  x = x.slice(from, Math.min(x.length, b + Math.round(0.02 * SR)));
  x = peakTo(x, lin(ir ? -1 : -3));
  if (!ir) {
    const fade = Math.min(x.length, Math.round(0.01 * SR));
    for (let i = 0; i < fade; i++) x[x.length - 1 - i] *= i / fade;
  }
  return x;
}

// ---- eyes: Claude cannot hear a file, but can read a picture of one ----

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(ang * k), s = Math.sin(ang * k);
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
  }
}

// dB (0 loudest, -90 floor) per column and per row: rows run 16 kHz (top) to 50 Hz on a log axis
export function spectrogram(x, sr, cols = 640, rows = 256, size = 1024) {
  const hop = Math.max(1, (x.length - size) / cols);
  const grid = [];
  const re = new Float64Array(size), im = new Float64Array(size);
  let top = 1e-9;
  for (let c = 0; c < cols; c++) {
    const at = Math.floor(c * hop);
    for (let i = 0; i < size; i++) { re[i] = (x[at + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size)); im[i] = 0; }
    fft(re, im);
    const col = new Float32Array(rows);
    for (let r = 0; r < rows; r++) {
      const f = 16000 * (50 / 16000) ** (r / (rows - 1));
      const k = Math.min(size / 2 - 1, Math.round((f * size) / sr));
      col[r] = Math.hypot(re[k], im[k]);
      top = Math.max(top, col[r]);
    }
    grid.push(col);
  }
  return grid.map((col) => col.map((v) => Math.max(-90, db(v / top))));
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

// A PNG of a sound: its waveform (top, with a line at 0 dB and -6 dB) over its spectrogram (dark to bright = quiet to loud; low
// pitches at the bottom, ticks every octave from 100 Hz), time running left to right
export function picture(x, sr, cols = 640) {
  const waveH = 120, specH = 256, W = cols, H = waveH + specH;
  const px = Buffer.alloc(W * H * 3, 18);
  const put = (xx, yy, r, g, b) => { if (xx >= 0 && xx < W && yy >= 0 && yy < H) { const o = (yy * W + xx) * 3; px[o] = r; px[o + 1] = g; px[o + 2] = b; } };
  for (const g of [1, 0.5, -0.5, -1]) put(0, 0, 0, 0, 0), [...Array(W).keys()].forEach((xx) => put(xx, Math.round(waveH / 2 - (g * (waveH / 2 - 2))), 60, 60, 80));
  for (let xx = 0; xx < W; xx++) {
    let lo = 0, hi = 0;
    for (let i = Math.floor((xx * x.length) / W); i < Math.floor(((xx + 1) * x.length) / W); i++) { lo = Math.min(lo, x[i]); hi = Math.max(hi, x[i]); }
    for (let yy = Math.round(waveH / 2 - hi * (waveH / 2 - 2)); yy <= Math.round(waveH / 2 - lo * (waveH / 2 - 2)); yy++) put(xx, yy, 120, 200, 255);
  }
  const grid = spectrogram(x, sr, W, specH);
  for (let xx = 0; xx < W; xx++)
    for (let r = 0; r < specH; r++) {
      const t = Math.max(0, (grid[xx][r] + 80) / 80); // 0 quiet .. 1 loud
      put(xx, waveH + r, Math.round(255 * Math.min(1, t * 2.2)), Math.round(255 * Math.max(0, t * 2 - 0.6)), Math.round(120 * (1 - Math.abs(t - 0.35) * 2.2 > 0 ? 1 - Math.abs(t - 0.35) * 2.2 : 0) + 255 * Math.max(0, t * 3 - 2)));
    }
  for (const f of [100, 200, 400, 800, 1600, 3200, 6400, 12800]) {
    const r = Math.round(((specH - 1) * Math.log(16000 / f)) / Math.log(16000 / 50));
    for (let xx = 0; xx < 8; xx++) put(xx, waveH + r, 255, 255, 255);
  }
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(W, 0); head.writeUInt32BE(H, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ---- presets: first drafts of the game's cues, to hear in the game or to replace with the user's own ----

const bp = (f, q = 0.8, to) => ({ type: "bandpass", f, q, ...(to ? { to } : {}) });
export const PRESETS = {
  "droid/beep": { layers: [{ osc: "square", freq: [900, 1400], len: 0.07, env: [0.002, 0.02, 0.6, 0.02], filter: { type: "lowpass", f: 5200 }, repeat: { n: 3, gap: 0.11, step: 1.14 }, gain: 0.8 }] },
  "droid/whistle": { layers: [{ osc: "sine", freq: [1300, 2900], len: 0.55, vib: { hz: 9, depth: 0.03 }, env: [0.03, 0.1, 0.8, 0.15] }] },
  "droid/static": { layers: [{ noise: "white", len: 0.6, gate: { hz: 45, duty: 0.65 }, filter: bp(2400, 0.7), crush: { bits: 6, hold: 3 }, env: [0.01, 0.05, 0.8, 0.1] }] },
  "droid/gasp": { layers: [{ osc: "square", freq: [1800, 700], len: 0.3, fm: { ratio: 3, depth: 2 }, env: [0.005, 0.1, 0.4, 0.1], filter: { type: "lowpass", f: 3000 } }] },
  "human/breath": { layers: [{ noise: "pink", len: 0.9, env: [0.28, 0.1, 0.5, 0.35], filter: bp(1800, 0.6, 1200), gain: 0.6 }] },
  "human/sigh": { layers: [{ noise: "pink", len: 1.1, env: [0.08, 0.3, 0.4, 0.5], filter: bp(1400, 0.7, 700), gain: 0.6 }, { osc: "tri", freq: [190, 140], len: 1.0, env: [0.1, 0.3, 0.3, 0.5], filter: bp(600, 1.2), gain: 0.25 }] },
  "human/gasp": { layers: [{ noise: "white", len: 0.35, env: [0.05, 0.05, 0.5, 0.12], filter: bp(2500, 0.8, 1800), gain: 0.7 }] },
  "human/cough": { layers: [{ noise: "white", len: 0.12, repeat: { n: 2, gap: 0.17, step: 1 }, env: [0.003, 0.03, 0.4, 0.05], filter: bp(900, 0.9), gain: 0.8 }, { osc: "sine", freq: [140, 90], len: 0.1, repeat: { n: 2, gap: 0.17, step: 1 }, env: [0.003, 0.03, 0.4, 0.04], gain: 0.5 }] },
  "human/wheeze": { layers: [{ noise: "pink", len: 0.9, am: { hz: 6, depth: 0.5 }, env: [0.1, 0.1, 0.7, 0.3], filter: bp(3000, 4), gain: 0.7 }] },
  "human/hmm": { layers: [{ osc: "saw", freq: [120, 100], len: 0.5, env: [0.06, 0.1, 0.8, 0.15], filter: { type: "lowpass", f: 700, q: 1.5 } }] },
  "human/groan": { layers: [{ osc: "saw", freq: [150, 80], len: 0.9, am: { hz: 5, depth: 0.3 }, env: [0.1, 0.2, 0.8, 0.3], filter: { type: "lowpass", f: 900, to: 400, q: 1.5 } }, { noise: "pink", len: 0.9, mix: 1, gain: 0.12, filter: bp(500) }] },
  "human/chuckle": { layers: [{ osc: "saw", freq: [200, 170], len: 0.08, repeat: { n: 4, gap: 0.11, step: 0.94 }, env: [0.005, 0.03, 0.4, 0.03], filter: bp(700, 1.2) }] },
  "human/laugh": { layers: [{ osc: "saw", freq: [260, 220], len: 0.09, repeat: { n: 6, gap: 0.12, step: 0.95 }, env: [0.005, 0.03, 0.5, 0.03], filter: bp(800, 1.2) }] },
  "human/growl": { layers: [{ osc: "saw", freq: [90, 70], len: 0.8, am: { hz: 28, depth: 0.5 }, env: [0.05, 0.2, 0.8, 0.2], filter: { type: "lowpass", f: 700, to: 350, q: 3 } }, { noise: "brown", len: 0.8, mix: 1, gain: 0.3 }] },
  "wookiee/growl": { layers: [{ osc: "saw", freq: [75, 52], len: 1.1, am: { hz: 24, depth: 0.55 }, env: [0.06, 0.25, 0.85, 0.3], filter: { type: "lowpass", f: 600, to: 280, q: 3 }, drive: 2 }, { noise: "brown", len: 1.1, mix: 1, gain: 0.35 }] },
  "large/growl": { layers: [{ osc: "saw", freq: [55, 40], len: 1.2, am: { hz: 14, depth: 0.5 }, env: [0.08, 0.3, 0.85, 0.35], filter: { type: "lowpass", f: 420, q: 2 }, drive: 2 }, { noise: "brown", len: 1.2, mix: 1, gain: 0.35 }] },
  "small/chuckle": { layers: [{ osc: "square", freq: [520, 430], len: 0.06, repeat: { n: 5, gap: 0.08, step: 0.96 }, env: [0.004, 0.02, 0.4, 0.02], filter: bp(1500, 1.2), gain: 0.8 }] },
  "ir/helmet": { seconds: 0.2, ir: { chain: [{ type: "highpass", f: 320 }, { type: "peak", f: 1200, q: 4, gain: 7 }, { type: "peak", f: 2100, q: 6, gain: 5 }, { type: "lowpass", f: 4500 }], tail: { ms: 12, amp: 0.12 } } },
  "ir/mask": { seconds: 0.15, ir: { chain: [{ type: "highpass", f: 250 }, { type: "peak", f: 700, q: 3, gain: 4 }, { type: "lowpass", f: 1800 }], tail: { ms: 8, amp: 0.1 } } },
  "ir/comms": { seconds: 0.12, ir: { chain: [{ type: "highpass", f: 300 }, { type: "peak", f: 1500, q: 2, gain: 6 }, { type: "lowpass", f: 3400 }], tail: { ms: 6, amp: 0.1 } } },
};
// a cue without a preset of its own for a bank borrows the human one; the droid and creature banks only have what suits them
const presetFor = (bank, cue) => PRESETS[`${bank}/${cue}`] ?? (bank === "human" || bank === "droid" ? null : PRESETS[`human/${cue}`]) ?? null;

// takes of one cue differ a little (pitch and length) so the same person keeps theirs but the bank has some variety
export function varied(recipe, take) {
  const rand = rng(take * 7919 + 13);
  const j = () => 1 + (rand() - 0.5) * 0.14;
  const mul = (v) => (Array.isArray(v) ? v.map((q) => q * j()) : v == null ? v : v * j());
  if (recipe.ir) return recipe;
  return { ...recipe, layers: recipe.layers.map((l) => ({ ...l, freq: l.freq == null ? l.freq : mul(l.freq), len: l.len * (0.92 + rand() * 0.16) })) };
}

// ---- the game's folder and manifest ----

function addToManifest(kind, key, rel) {
  const file = path.join(VOICE, "manifest.json");
  const m = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  m.nonverbal ??= {};
  m.ir ??= {};
  if (kind === "ir") m.ir[key] = rel;
  else m.nonverbal[key] = [...new Set([...(m.nonverbal[key] ?? []), rel])];
  fs.writeFileSync(file, JSON.stringify(m, null, 2) + "\n");
}

// put samples in as the next take of bank/cue (or the impulse response ir/<name>); returns the file path
export function install(x, target, root = VOICE) {
  const [bank, name] = target.split("/");
  if (bank === "ir") {
    if (!["helmet", "mask", "comms"].includes(name)) throw new Error("impulse responses: helmet, mask, comms");
    fs.mkdirSync(path.join(root, "ir"), { recursive: true });
    fs.writeFileSync(path.join(root, "ir", `${name}.wav`), writeWav(x, SR, 24));
    if (root === VOICE) addToManifest("ir", name, `ir/${name}.wav`);
    return path.join(root, "ir", `${name}.wav`);
  }
  if (!BANKS.includes(bank) || !CUES.includes(name)) throw new Error(`${target}? bank one of ${BANKS.join(" ")}, cue one of ${CUES.join(" ")}`);
  const dir = path.join(root, "nonverbal", bank);
  fs.mkdirSync(dir, { recursive: true });
  let n = 1;
  while (fs.existsSync(path.join(dir, `${name}-${n}.wav`))) n++;
  fs.writeFileSync(path.join(dir, `${name}-${n}.wav`), writeWav(x, SR, 16));
  if (root === VOICE) addToManifest("cue", target, `nonverbal/${bank}/${name}-${n}.wav`);
  return path.join(dir, `${name}-${n}.wav`);
}

// ---- command line ----

const show = (f, r) => console.log(`${f}: ${r.seconds.toFixed(2)} s, ${r.sr} Hz, peak ${r.peakDb.toFixed(1)} dBFS, rms ${r.rmsDb.toFixed(1)} dBFS, lead ${r.leadMs.toFixed(0)} ms${r.notes.length ? "\n  - " + r.notes.join("\n  - ") : "\n  fine"}`);

function main(argv) {
  const [cmd, ...rest] = argv;
  const flag = (name) => { const i = rest.indexOf(`--${name}`); return i < 0 ? null : rest.splice(i, 2)[1]; };
  const seed = +(flag("seed") ?? 1);
  const preset = flag("preset");
  if (cmd === "presets") return console.log(Object.keys(PRESETS).join("\n"));
  if (cmd === "render") {
    const [what, out] = rest;
    const recipe = PRESETS[what] ?? JSON.parse(fs.readFileSync(what, "utf8"));
    const x = render(recipe, seed);
    fs.writeFileSync(out, writeWav(x, SR, recipe.ir ? 24 : 16));
    return show(out, inspect(x, SR));
  }
  if (cmd === "look") {
    const w = readWav(fs.readFileSync(rest[0]));
    const out = rest[1] ?? rest[0].replace(/.wav$/i, "") + ".png";
    fs.writeFileSync(out, picture(w.channels[0], w.sr));
    return console.log("wrote", out, "(waveform on top; spectrogram below, 16 kHz at the top to 50 Hz, ticks at 100 Hz and each octave up)");
  }
  if (cmd === "inspect") for (const f of rest) { const w = readWav(fs.readFileSync(f)); show(f, inspect(w.channels[0], w.sr)); }
  else if (cmd === "import") {
    const [file, target] = rest;
    const x = conform(readWav(fs.readFileSync(file)), { ir: target.startsWith("ir/") });
    console.log("installed", path.relative(ROOT, install(x, target)));
    show("  as", inspect(x, SR));
  } else if (cmd === "bank") {
    const [bank, cue, takes = "3"] = rest;
    const recipe = preset ? PRESETS[preset] : presetFor(bank, cue);
    if (!recipe) throw new Error(`no preset for ${bank}/${cue}; use --preset <name> (node tools/soundlab.mjs presets)`);
    for (let t = 1; t <= +takes; t++) console.log("installed", path.relative(ROOT, install(render(varied(recipe, t), seed + t), `${bank}/${cue}`)));
  } else if (cmd === "ir") {
    const name = rest[0];
    console.log("installed", path.relative(ROOT, install(render(PRESETS[`ir/${name}`], seed), `ir/${name}`)));
  } else console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(0, 19).join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(String(e.message ?? e)); process.exit(1); }
}
