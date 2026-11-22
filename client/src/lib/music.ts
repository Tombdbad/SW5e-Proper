// The game's music (2026-11-22; the user: "work on sound effects and background music while I sleep"). No audio files: every piece is
// written here as notes and played by small synthesized instruments (strings, brass, horn, flute, clarinet, plucks, bells, choir, upright
// and synth bass, timpani and drums) through one shared reverb, so it costs no download, loops without a seam and changes with the moment.
// All the pieces are this project's own (CC0): written in the manner of a space-opera film score and a cantina band, quoting no film or game.
//
// How it plays: a base mood set by where the party is (`setMusicBase`, from moodOfPlace) with moods laid over it for a fight, a race or a
// dogfight (`musicOverlay`, a stack); a change fades the old piece out over two seconds as the new one comes in. A piece loops; each pass
// re-draws which of its optional layers play (`p`) so the loop does not sound the same twice, and some layers only join on later passes
// (`from`). Stingers (victory, defeat, level up, quest) play over the music with it ducked. The notes are scheduled a little ahead of the
// audio clock, as Web Audio wants; `renderMood` renders the same notes on an OfflineAudioContext (previews and checks).
import type { Area, World } from "@shared/logic";
import { audioContext, busOf, getLevels, mixerOn, onLevels, reverbOf } from "./audio";

export type Inst =
  | "strings" | "pad" | "choir" | "brass" | "horn" | "flute" | "clarinet" | "muted" | "pluck" | "bell" | "steel"
  | "bass" | "synthbass" | "timpani" | "kick" | "snare" | "brush" | "hat" | "ride" | "shaker" | "tom";

// A part: an instrument and its notes (see `parseNotes`), looped to fill the piece. `vol` its level, `pan` -1..1, `wet` its reverb send,
// `p` the chance it plays on a pass (default always), `from` the first pass it may play on (0 = the first), `swing` its off-beats swung,
// `oct` shifts it by octaves
export interface Part { inst: Inst; notes: string; vol?: number; pan?: number; wet?: number; p?: number; from?: number; swing?: boolean; oct?: number }
export interface Piece { name: string; bpm: number; beats: number; bars: number; gain: number; swing?: number; wet?: number; parts: Part[] }

export interface NoteEvent { at: number; dur: number; freqs: number[]; vel: number; stacc: boolean }

// ---- Notes -------------------------------------------------------------------------------------------------------------------------------
// Tokens apart by spaces; "|" is a bar line (only for reading). A token is a pitch, then ":" and a length in beats (default 1; "0.5",
// "1/3"), then marks: "!" accented, "." short (staccato). A pitch is a note (C4, F#3, Bb2), a chord of notes joined by "+" (D3+F3+A3),
// "x" a hit (drums: no pitch) or "r" a rest.
const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midiOf(note: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(note);
  if (!m) throw new Error(`not a note: ${note}`);
  return 12 * (Number(m[3]) + 1) + STEP[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}
export const freqOf = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const lengthOf = (s: string) => {
  const [a, b] = s.split("/");
  const v = b === undefined ? Number(a) : Number(a) / Number(b);
  if (!(v > 0)) throw new Error(`not a length: ${s}`);
  return v;
};
export function parseNotes(text: string, octaves = 0): { events: NoteEvent[]; length: number } {
  const events: NoteEvent[] = [];
  let at = 0;
  for (const token of text.split(/\s+/)) {
    if (!token || token === "|") continue;
    const m = /^([^:!.]+)(?::(\d+(?:\.\d+)?(?:\/\d+)?))?([!.]*)$/.exec(token);
    if (!m) throw new Error(`bad token: ${token}`);
    const dur = m[2] ? lengthOf(m[2]) : 1;
    if (m[1] !== "r") {
      const freqs = m[1] === "x" ? [0] : m[1].split("+").map((n) => freqOf(midiOf(n) + 12 * octaves));
      events.push({ at, dur, freqs, vel: m[3].includes("!") ? 1.25 : 1, stacc: m[3].includes(".") });
    }
    at += dur;
  }
  return { events, length: at };
}

// ---- Instruments ----------------------------------------------------------------------------------------------------------------------
type Out = AudioNode;
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseOf(c: BaseAudioContext): AudioBuffer {
  let b = noiseBuffers.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0);
    let s = 1;
    for (let i = 0; i < d.length; i++) d[i] = ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
    noiseBuffers.set(c, b);
  }
  return b;
}
function osc(c: BaseAudioContext, type: OscillatorType, f: number, t: number, end: number, detune = 0): OscillatorNode {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.detune.value = detune;
  o.start(t);
  o.stop(end);
  return o;
}
function filter(c: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const b = c.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}
// An amplitude envelope: rise to `peak` over `att`, hold until `hold`, fall away with time constant `rel`
function amp(c: BaseAudioContext, t: number, att: number, peak: number, hold: number, rel: number): GainNode {
  const g = c.createGain();
  g.gain.value = 0; // silent before `t` too: a gain starts at 1, and a start between two samples would let the first one through
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + att);
  g.gain.setValueAtTime(peak, t + Math.max(att, hold));
  g.gain.setTargetAtTime(0, t + Math.max(att, hold), rel);
  return g;
}
// A hit of filtered noise (drums), `rel` its decay time constant
function noiseHit(c: BaseAudioContext, out: Out, t: number, type: BiquadFilterType, f: number, q: number, peak: number, rel: number, att = 0.001) {
  const src = c.createBufferSource();
  src.buffer = noiseOf(c);
  const g = amp(c, t, att, peak, t + att, rel);
  src.connect(filter(c, type, f, q)).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + att + rel * 6);
}
function vibrato(c: BaseAudioContext, t: number, end: number, cents: number, rate = 5, delay = 0.25, held = 1): GainNode {
  // (a short note gets none: an LFO it is over before is only cost, and the music is played on phones)
  if (held < 0.35) return c.createGain();
  const lfo = osc(c, "sine", rate, t, end);
  const g = c.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(cents, t + delay + 0.3);
  lfo.connect(g);
  return g;
}

type Play = (c: BaseAudioContext, out: Out, t: number, f: number, dur: number, vel: number) => void;
const INSTRUMENTS: Record<Inst, Play> = {
  // Bowed strings: three saws a few cents apart through a soft low-pass, a slow rise and a delayed vibrato
  strings(c, out, t, f, dur, vel) {
    const att = Math.min(0.45, Math.max(0.05, dur * 0.22));
    const end = t + dur + 1.0;
    const g = amp(c, t, att, 0.07 * vel, t + dur, 0.28);
    const lp = filter(c, "lowpass", Math.min(7000, 900 + f * 3), 0.5);
    const vib = vibrato(c, t, end, 6, 5.2, 0.25, dur);
    for (const d of dur < 0.3 ? [-6, 6] : [-8, 0, 8]) {
      const o = osc(c, "sawtooth", f, t, end, d);
      vib.connect(o.detune);
      o.connect(lp);
    }
    lp.connect(g).connect(out);
  },
  // A soft pad (strings far off): two saws and a triangle, darker, slow in and slow out
  pad(c, out, t, f, dur, vel) {
    const end = t + dur + 3;
    const g = amp(c, t, Math.min(1.2, dur * 0.4), 0.06 * vel, t + dur, 0.7);
    const lp = filter(c, "lowpass", Math.min(2600, 500 + f * 1.6), 0.4);
    osc(c, "sawtooth", f, t, end, -6).connect(lp);
    osc(c, "sawtooth", f, t, end, 6).connect(lp);
    osc(c, "triangle", f * 2, t, end).connect(lp);
    lp.connect(g).connect(out);
  },
  // Voices on "ah": a saw through three formant band-passes, slow in, with vibrato
  choir(c, out, t, f, dur, vel) {
    const end = t + dur + 2.0;
    const g = amp(c, t, Math.min(0.9, dur * 0.35), 0.16 * vel, t + dur, 0.5);
    const vib = vibrato(c, t, end, 9, 4.6, 0.4, dur);
    const sum = c.createGain();
    for (const d of [-10, 10]) {
      const o = osc(c, "sawtooth", f, t, end, d);
      vib.connect(o.detune);
      o.connect(sum);
    }
    for (const [ff, q, lvl] of [[730, 7, 1], [1150, 8, 0.6], [2650, 10, 0.25]] as const) {
      const bp = filter(c, "bandpass", ff, q);
      const lg = c.createGain();
      lg.gain.value = lvl;
      sum.connect(bp).connect(lg).connect(g);
    }
    g.connect(out);
  },
  // Brass: saws through a low-pass that opens with the blow (brighter when louder), a quick rise
  brass(c, out, t, f, dur, vel) {
    const end = t + dur + 0.55;
    const g = amp(c, t, 0.035, 0.095 * vel, t + dur, 0.12);
    const lp = filter(c, "lowpass", 400, 1.2);
    const top = Math.min(8000, 900 + f * (2.4 + 1.6 * vel));
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(top, t + 0.06);
    lp.frequency.setTargetAtTime(top * 0.55, t + 0.08, 0.25);
    const vib = vibrato(c, t, end, 5, 5.5, 0.35, dur);
    for (const d of [-5, 5]) {
      const o = osc(c, "sawtooth", f, t, end, d);
      vib.connect(o.detune);
      o.connect(lp);
    }
    lp.connect(g).connect(out);
  },
  // A French horn: rounder than brass, a saw and a triangle, darker and slower
  horn(c, out, t, f, dur, vel) {
    const end = t + dur + 0.8;
    const g = amp(c, t, 0.08, 0.08 * vel, t + dur, 0.2);
    const lp = filter(c, "lowpass", Math.min(2400, 300 + f * 2.2), 0.8);
    const vib = vibrato(c, t, end, 4, 5, 0.4, dur);
    const a = osc(c, "sawtooth", f, t, end);
    const b = osc(c, "triangle", f, t, end, 4);
    vib.connect(a.detune);
    vib.connect(b.detune);
    a.connect(lp);
    b.connect(lp);
    lp.connect(g).connect(out);
  },
  // A flute: a sine with a little of its octave, a breath of noise at the start, vibrato after a moment
  flute(c, out, t, f, dur, vel) {
    const end = t + dur + 0.6;
    const g = amp(c, t, 0.06, 0.11 * vel, t + dur, 0.09);
    const vib = vibrato(c, t, end, 12, 5.4, 0.3, dur);
    const a = osc(c, "sine", f, t, end);
    const b = osc(c, "triangle", f * 2, t, end);
    const bg = c.createGain();
    bg.gain.value = 0.18;
    vib.connect(a.detune);
    a.connect(g);
    b.connect(bg).connect(g);
    g.connect(out);
    noiseHit(c, out, t, "bandpass", Math.min(9000, f * 3), 2, 0.02 * vel, 0.05, 0.02);
  },
  // A clarinet (the cantina's reed): a square (odd harmonics) through a low-pass, a little vibrato
  clarinet(c, out, t, f, dur, vel) {
    const end = t + dur + 0.5;
    const g = amp(c, t, 0.025, 0.08 * vel, t + dur, 0.06);
    const lp = filter(c, "lowpass", Math.min(5000, f * 5), 0.9);
    const vib = vibrato(c, t, end, 10, 5.8, 0.2, dur);
    const o = osc(c, "square", f, t, end);
    vib.connect(o.detune);
    o.connect(lp).connect(g).connect(out);
  },
  // A muted trumpet: a saw through a narrow band (the mute's honk)
  muted(c, out, t, f, dur, vel) {
    const end = t + dur + 0.5;
    const g = amp(c, t, 0.02, 0.08 * vel, t + dur, 0.07);
    const bp = filter(c, "bandpass", Math.min(3500, f * 2.5 + 400), 2.2);
    osc(c, "sawtooth", f, t, end).connect(bp).connect(g).connect(out);
  },
  // A harp-like pluck: a triangle and its octave dying away
  pluck(c, out, t, f, dur, vel) {
    const end = t + 2.5;
    const g = amp(c, t, 0.004, 0.12 * vel, t + 0.004, 0.45);
    const lp = filter(c, "lowpass", Math.min(6000, f * 6), 0.6);
    lp.frequency.setTargetAtTime(f * 2, t + 0.01, 0.3);
    osc(c, "triangle", f, t, end).connect(lp);
    const o2 = osc(c, "sine", f * 2, t, end);
    const g2 = c.createGain();
    g2.gain.value = 0.35;
    o2.connect(g2).connect(lp);
    lp.connect(g).connect(out);
  },
  // A bell or celesta: frequency modulation at an inharmonic ratio, the brightness dying faster than the tone
  bell(c, out, t, f, dur, vel) {
    const end = t + 3.5;
    const g = amp(c, t, 0.003, 0.07 * vel, t + 0.003, 0.7);
    const car = osc(c, "sine", f, t, end);
    const mod = osc(c, "sine", f * 3.5, t, end);
    const mg = c.createGain();
    mg.gain.setValueAtTime(f * 2.2, t);
    mg.gain.setTargetAtTime(0, t, 0.25);
    mod.connect(mg).connect(car.frequency);
    car.connect(g).connect(out);
  },
  // A steel-drum-like plucked metal (the cantina's chords): modulation at 1:1 dying fast, a small fall in pitch
  steel(c, out, t, f, dur, vel) {
    const end = t + 1.6;
    const g = amp(c, t, 0.003, 0.06 * vel, t + 0.003, 0.28);
    const car = osc(c, "sine", f * 1.01, t, end);
    car.frequency.setTargetAtTime(f, t, 0.03);
    const mod = osc(c, "sine", f * 2, t, end);
    const mg = c.createGain();
    mg.gain.setValueAtTime(f * 1.4, t);
    mg.gain.setTargetAtTime(f * 0.1, t, 0.08);
    mod.connect(mg).connect(car.frequency);
    car.connect(g).connect(out);
  },
  // An upright bass: a sine and a triangle, plucked
  bass(c, out, t, f, dur, vel) {
    const end = t + dur + 0.6;
    const g = amp(c, t, 0.006, 0.13 * vel, t + 0.02, Math.min(0.5, dur * 0.45));
    const lp = filter(c, "lowpass", 700, 0.7);
    osc(c, "triangle", f, t, end).connect(lp);
    osc(c, "sine", f, t, end).connect(lp);
    lp.connect(g).connect(out);
  },
  // A synth bass for the chases: a saw and a square an octave down through a low-pass that snaps shut
  synthbass(c, out, t, f, dur, vel) {
    const end = t + dur + 0.3;
    const g = amp(c, t, 0.004, 0.065 * vel, t + dur * 0.8, 0.05);
    const lp = filter(c, "lowpass", 1800, 4);
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.setTargetAtTime(240, t + 0.005, 0.07);
    osc(c, "sawtooth", f, t, end).connect(lp);
    osc(c, "square", f / 2, t, end).connect(lp);
    lp.connect(g).connect(out);
  },
  // Timpani: a tuned drum, the pitch settling down at the stroke, with a thump of low noise
  timpani(c, out, t, f, dur, vel) {
    const end = t + 2.5;
    const g = amp(c, t, 0.004, 0.19 * vel, t + 0.004, 0.55);
    const o = osc(c, "sine", f * 1.35, t, end);
    o.frequency.setTargetAtTime(f, t, 0.025);
    const h = osc(c, "sine", f * 1.5, t, end);
    const hg = c.createGain();
    hg.gain.value = 0.25;
    o.connect(g);
    h.connect(hg).connect(g);
    g.connect(out);
    noiseHit(c, out, t, "lowpass", 260, 0.8, 0.12 * vel, 0.08);
  },
  kick(c, out, t, _f, _dur, vel) {
    const g = amp(c, t, 0.002, 0.26 * vel, t + 0.002, 0.11);
    const o = osc(c, "sine", 130, t, t + 0.5);
    o.frequency.setTargetAtTime(44, t, 0.035);
    o.connect(g).connect(out);
  },
  snare(c, out, t, _f, _dur, vel) {
    noiseHit(c, out, t, "bandpass", 2000, 0.7, 0.32 * vel, 0.055);
    const g = amp(c, t, 0.002, 0.18 * vel, t + 0.002, 0.03);
    osc(c, "triangle", 190, t, t + 0.3).connect(g).connect(out);
  },
  brush(c, out, t, _f, _dur, vel) {
    noiseHit(c, out, t, "bandpass", 3200, 0.6, 0.12 * vel, 0.07, 0.01);
  },
  hat(c, out, t, _f, _dur, vel) {
    noiseHit(c, out, t, "highpass", 7500, 0.7, 0.09 * vel, 0.018);
  },
  ride(c, out, t, _f, _dur, vel) {
    noiseHit(c, out, t, "bandpass", 6500, 1.4, 0.07 * vel, 0.12);
    const g = amp(c, t, 0.002, 0.012 * vel, t + 0.002, 0.25);
    osc(c, "sine", 3150, t, t + 1.2).connect(g).connect(out);
  },
  shaker(c, out, t, _f, _dur, vel) {
    noiseHit(c, out, t, "bandpass", 5800, 1.2, 0.07 * vel, 0.03, 0.012);
  },
  // A hand drum or taiko (the pitch, when given, sets the skin)
  tom(c, out, t, f, _dur, vel) {
    const base = f || 110;
    const g = amp(c, t, 0.003, 0.22 * vel, t + 0.003, 0.18);
    const o = osc(c, "sine", base * 1.6, t, t + 0.8);
    o.frequency.setTargetAtTime(base, t, 0.03);
    o.connect(g).connect(out);
    noiseHit(c, out, t, "lowpass", 900, 0.7, 0.08 * vel, 0.04);
  },
};

// ---- The pieces ----------------------------------------------------------------------------------------------------------------------
// Each 4 beats a bar unless it says. Written so that every part's length divides the piece (tests/world/music.test.ts checks it).
export const PIECES: Record<string, Piece> = {
  // The title: a heroic march in B flat, brass over strings and timpani (8 bars, then again with the horns' answer)
  title: {
    name: "Title", bpm: 100, beats: 4, bars: 8, gain: 0.436, wet: 0.32,
    parts: [
      { inst: "brass", vol: 1, pan: 0.1, notes: "Bb4:1.5! F4:0.5 Bb4:1 D5:1 | Eb5:2 C5:1 Ab4:1 | G5:1.5 F5:0.5 Eb5:1 Bb4:1 | C5:3 r:1 | D5:1.5 Bb4:0.5 G4:1 Bb4:1 | Eb5:1 G5:1 F5:1 Eb5:1 | C5:1 Eb5:1 D5:1 C5:1 | D5:1 Bb4:2 r:1" },
      { inst: "strings", vol: 0.9, pan: -0.25, notes: "Bb3+D4+F4:4 | Ab3+C4+Eb4:4 | G3+Bb3+Eb4:4 | A3+C4+F4:4 | G3+Bb3+D4:4 | G3+Bb3+Eb4:4 | G3+Bb3+C4+Eb4:2 A3+C4+F4:2 | Bb3+D4+F4:4" },
      { inst: "strings", vol: 0.8, pan: 0.3, notes: "Bb2:2 F2:2 | Ab2:2 Eb2:2 | Eb2:2 Bb2:2 | F2:2 C3:2 | G2:2 D2:2 | Eb2:2 G2:2 | C2:2 F2:2 | Bb1:4" },
      { inst: "horn", vol: 0.8, pan: -0.4, from: 1, notes: "D4:4 | C4:4 | Bb3:4 | A3:2 C4:2 | Bb3:4 | Bb3:2 G3:2 | Eb4:2 C4:2 | D4:4" },
      { inst: "timpani", vol: 0.9, notes: "Bb2:1! r:3 | Ab2:1 r:3 | Eb2:1 r:3 | F2:1/4 F2:1/4 F2:1/4 F2:1/4 F2:1! r:2 | G2:1 r:3 | Eb2:1 r:3 | C2:1 r:1 F2:1 r:1 | Bb2:1! r:3" },
      { inst: "snare", vol: 0.45, p: 0.8, notes: "r:1 x:0.5 x:0.5 r:1 x:1/4 x:1/4 x:0.5" },
      { inst: "bell", vol: 0.5, p: 0.5, from: 1, notes: "r:2 F5:1 D6:1 | r:4 | r:2 Bb5:1 G5:1 | r:4 | r:2 D6:1 Bb5:1 | r:4 | r:2 Eb6:1 C6:1 | r:4" },
    ],
  },
  // Exploring the wild: an open D dorian song, a flute over a soft pad and a harp's broken chords; bells now and then
  explore: {
    name: "Exploring", bpm: 72, beats: 4, bars: 8, gain: 0.799, wet: 0.45,
    parts: [
      { inst: "pad", vol: 0.9, notes: "D3+A3+F4:4 | C3+G3+E4:4 | Bb2+F3+D4:4 | F3+C4+A4:4 | D3+A3+F4:4 | A2+E3+C4:4 | Bb2+F3+D4:4 | C3+G3+E4:4" },
      { inst: "flute", vol: 0.85, pan: 0.15, p: 0.85, notes: "r:1 A4:1 D5:1.5 E5:0.5 | E5:2 D5:1 C5:1 | D5:3 r:1 | C5:1 A4:1 F4:1 G4:1 | A4:3 r:1 | r:1 C5:1 E5:1 A5:1 | G5:1.5 F5:0.5 D5:2 | E5:3 r:1" },
      { inst: "pluck", vol: 0.55, pan: -0.3, p: 0.75, notes: "D3:0.5 A3:0.5 D4:0.5 F4:0.5 A4:0.5 F4:0.5 D4:0.5 A3:0.5 | C3:0.5 G3:0.5 C4:0.5 E4:0.5 G4:0.5 E4:0.5 C4:0.5 G3:0.5 | Bb2:0.5 F3:0.5 Bb3:0.5 D4:0.5 F4:0.5 D4:0.5 Bb3:0.5 F3:0.5 | F2:0.5 C3:0.5 F3:0.5 A3:0.5 C4:0.5 A3:0.5 F3:0.5 C3:0.5 | D3:0.5 A3:0.5 D4:0.5 F4:0.5 A4:0.5 F4:0.5 D4:0.5 A3:0.5 | A2:0.5 E3:0.5 A3:0.5 C4:0.5 E4:0.5 C4:0.5 A3:0.5 E3:0.5 | Bb2:0.5 F3:0.5 Bb3:0.5 D4:0.5 F4:0.5 D4:0.5 Bb3:0.5 F3:0.5 | C3:0.5 G3:0.5 C4:0.5 E4:0.5 G4:0.5 E4:0.5 C4:0.5 G3:0.5" },
      { inst: "strings", vol: 0.55, pan: 0.35, p: 0.7, from: 1, notes: "D2:4 | C2:4 | Bb1:4 | F2:4 | D2:4 | A1:4 | Bb1:4 | C2:4" },
      { inst: "bell", vol: 0.45, pan: 0.4, p: 0.45, notes: "r:3 A5:1 | r:4 | r:2 D6:2 | r:4 | r:3 F5:1 | r:4 | r:2 D6:2 | r:4" },
      { inst: "horn", vol: 0.55, pan: -0.2, p: 0.4, from: 2, notes: "r:4 | r:4 | F4:4 | A4:4 | r:4 | r:4 | D4:4 | E4:4" },
    ],
  },
  // A town, a market or a spaceport: busy and a little strange, E phrygian over a plucked bass with hand drums and a shaker
  town: {
    name: "Town", bpm: 96, beats: 4, bars: 8, gain: 0.419, wet: 0.3,
    parts: [
      { inst: "bass", vol: 0.7, notes: "E2:0.75 E2:0.25 B2:0.5 E2:0.5 r:0.5 G2:0.5 F2:0.5 E2:0.5" },
      { inst: "pad", vol: 0.85, p: 0.9, notes: "E3+B3+G4:4 | F3+A3+C4:4 | E3+B3+G4:4 | D3+A3+F#4:4" },
      { inst: "clarinet", vol: 1.15, pan: 0.2, p: 0.85, notes: "r:2 B4:0.5 C5:0.5 B4:0.5 A4:0.5 | G4:1 F4:1 E4:2 | r:1 E4:0.5 G4:0.5 B4:1 D5:1 | C5:1.5 B4:0.5 A4:2 | r:2 E5:0.5 F5:0.5 E5:0.5 D5:0.5 | C5:1 B4:1 A4:1 G#4:1 | A4:1 B4:1 C5:1 D5:1 | E5:3 r:1" },
      { inst: "tom", vol: 0.55, pan: -0.25, notes: "A2:1! r:0.5 E2:0.5 r:1 A2:0.5 E2:0.5" },
      { inst: "shaker", vol: 1.2, pan: 0.35, p: 0.9, notes: "x:0.5! x:0.5 x:0.5 x:0.5 x:0.5! x:0.5 x:0.5 x:0.5" },
      { inst: "steel", vol: 0.8, pan: -0.35, p: 0.5, from: 1, notes: "r:1.5 E5+G5:0.5 r:2 | r:1.5 F5+A5:0.5 r:2 | r:1.5 E5+B5:0.5 r:2 | r:1.5 D5+F#5:0.5 r:2" },
      { inst: "flute", vol: 0.55, pan: -0.15, p: 0.35, from: 2, notes: "r:4 | r:4 | r:4 | r:4 | B5:2 A5:1 G5:1 | F5:2 E5:2 | r:4 | r:4" },
    ],
  },
  // The cantina's band: a swinging minor blues (12 bars) with a reed lead, walking bass, brushes, ride and steel-drum chords. Its own tune
  cantina: {
    name: "Cantina", bpm: 138, beats: 4, bars: 12, gain: 0.454, swing: 0.64, wet: 0.2,
    parts: [
      { inst: "bass", vol: 0.75, swing: true, notes: "D2 F2 A2 C3 | D3 A2 F2 E2 | D2 E2 F2 A2 | D2 F#2 A2 C3 | G2 Bb2 D3 Bb2 | G2 A2 Bb2 B2 | D2 F2 A2 F2 | D2 C#2 C2 B1 | Bb1 D2 F2 Bb2 | A1 C#2 E2 G2 | D2 F2 A2 F2 | A1 C#2 E2 C#2" },
      { inst: "clarinet", vol: 1.2, pan: 0.15, swing: true, notes: "r:0.5 A4:0.5 D5:0.5 F5:0.5 E5:0.5 D5:0.5 C5:0.5 A4:0.5 | C5:1 A4:0.5 F4:0.5 D4:2 | r:0.5 D5:0.5 F5:0.5 A5:0.5 G5:0.5 F5:0.5 E5:0.5 D5:0.5 | C5:0.5 F#4:0.5 A4:0.5 C5:0.5 Eb5:1 D5:1 | D5:1.5 Bb4:0.5 G4:1 A4:0.5 Bb4:0.5 | C5:0.5 D5:0.5 Eb5:0.5 D5:0.5 C5:0.5 Bb4:0.5 A4:1 | F4:1 A4:0.5 D5:1.5 r:1 | r:1 F5:0.5 E5:0.5 D5:0.5 C5:0.5 Bb4:0.5 A4:0.5 | Bb4:1 D5:0.5 F5:0.5 Bb5:1.5 A5:0.5 | G5:0.5 E5:0.5 C#5:0.5 A4:0.5 Bb4:1 A4:1 | D5:2 r:0.5 F5:0.5 E5:0.5 D5:0.5 | C#5:1 E5:0.5 G5:0.5 Bb5:1 A5:1" },
      { inst: "muted", vol: 0.55, pan: -0.25, swing: true, p: 0.45, from: 1, oct: -1, notes: "r:0.5 A4:0.5 D5:0.5 F5:0.5 E5:0.5 D5:0.5 C5:0.5 A4:0.5 | C5:1 A4:0.5 F4:0.5 D4:2 | r:0.5 D5:0.5 F5:0.5 A5:0.5 G5:0.5 F5:0.5 E5:0.5 D5:0.5 | C5:0.5 F#4:0.5 A4:0.5 C5:0.5 Eb5:1 D5:1 | D5:1.5 Bb4:0.5 G4:1 A4:0.5 Bb4:0.5 | C5:0.5 D5:0.5 Eb5:0.5 D5:0.5 C5:0.5 Bb4:0.5 A4:1 | F4:1 A4:0.5 D5:1.5 r:1 | r:1 F5:0.5 E5:0.5 D5:0.5 C5:0.5 Bb4:0.5 A4:0.5 | Bb4:1 D5:0.5 F5:0.5 Bb5:1.5 A5:0.5 | G5:0.5 E5:0.5 C#5:0.5 A4:0.5 Bb4:1 A4:1 | D5:2 r:0.5 F5:0.5 E5:0.5 D5:0.5 | C#5:1 E5:0.5 G5:0.5 Bb5:1 A5:1" },
      { inst: "steel", vol: 0.75, pan: -0.35, swing: true, notes: "F3+A3+C4+E4:1.5 F3+A3+C4+E4:0.5 r:2 | F3+A3+C4+E4:1.5 F3+A3+C4+E4:0.5 r:2 | F3+A3+C4+E4:1.5 F3+A3+C4+E4:0.5 r:2 | F#3+A3+C4+Eb4:1.5 F#3+A3+C4+Eb4:0.5 r:2 | F3+Bb3+D4:1.5 F3+Bb3+D4:0.5 r:2 | F3+Bb3+D4:1.5 F3+Bb3+D4:0.5 r:2 | F3+A3+C4+E4:1.5 F3+A3+C4+E4:0.5 r:2 | F3+A3+C4+E4:1.5 F3+A3+C4+E4:0.5 r:2 | F3+Bb3+D4:1.5 F3+Bb3+D4:0.5 r:2 | G3+C#4+E4:1.5 G3+C#4+E4:0.5 r:2 | F3+A3+C4+E4:1.5 F3+A3+C4+E4:0.5 r:2 | G3+C#4+E4:1.5 G3+C#4+E4:0.5 r:2" },
      { inst: "ride", vol: 1.1, pan: 0.3, notes: "x:1 x:2/3 x:1/3 x:1 x:2/3 x:1/3" },
      { inst: "brush", vol: 0.85, notes: "r:1 x:1! r:1 x:1!" },
      { inst: "kick", vol: 0.25, notes: "x:2 x:2" },
    ],
  },
  // Danger near: a low string pulse in C phrygian, high strings hanging, a brass swell and timpani like a heartbeat
  tension: {
    name: "Tension", bpm: 66, beats: 4, bars: 8, gain: 1.15, wet: 0.45,
    parts: [
      { inst: "strings", vol: 0.8, notes: "C2:0.5. C2:0.5. C2:0.5. Db2:0.5. C2:0.5. C2:0.5. G1:0.5. C2:0.5." },
      { inst: "pad", vol: 0.5, pan: 0.3, notes: "G5:8 | Ab5:8 | G5:8 | Gb5:8" },
      { inst: "brass", vol: 0.45, pan: -0.2, p: 0.8, notes: "r:12 C3+G3:4 r:12 Db3+Ab3:4" },
      { inst: "timpani", vol: 0.8, p: 0.85, notes: "C2:1 r:3" },
      { inst: "choir", vol: 0.45, pan: -0.35, p: 0.5, from: 1, notes: "r:16 Eb4+G4:8 r:8" },
      { inst: "bell", vol: 0.3, pan: 0.45, p: 0.35, notes: "r:7 Db6:1 r:8 r:6 G5:2 r:8" },
    ],
  },
  // A fight: C minor at 138, a staccato string ostinato, a brass theme, timpani and drums
  combat: {
    name: "Combat", bpm: 138, beats: 4, bars: 8, gain: 0.385, wet: 0.25,
    parts: [
      { inst: "strings", vol: 0.75, pan: -0.2, notes: "C3:0.5. G3:0.5. C4:0.5. G3:0.5. Eb4:0.5. G3:0.5. C4:0.5. G3:0.5. | Ab2:0.5. Eb3:0.5. Ab3:0.5. Eb3:0.5. C4:0.5. Eb3:0.5. Ab3:0.5. Eb3:0.5. | Bb2:0.5. F3:0.5. Bb3:0.5. F3:0.5. D4:0.5. F3:0.5. Bb3:0.5. F3:0.5. | G2:0.5. D3:0.5. G3:0.5. D3:0.5. B3:0.5. D3:0.5. G3:0.5. D3:0.5." },
      { inst: "brass", vol: 0.95, pan: 0.15, p: 0.9, notes: "C4:1.5! Eb4:0.5 G4:1 F4:0.5 Eb4:0.5 | Eb4:2 C4:1 r:1 | D4:1.5 F4:0.5 Bb4:1 Ab4:0.5 G4:0.5 | G4:3 r:1 | C5:1.5! Bb4:0.5 G4:1 Eb4:1 | F4:1 Ab4:1 C5:1.5 Bb4:0.5 | Bb4:1 D5:1 F5:1 D5:1 | D5:2 B4:2" },
      { inst: "strings", vol: 0.7, pan: 0.3, notes: "C2:4 | Ab1:4 | Bb1:4 | G1:4" },
      { inst: "horn", vol: 0.6, pan: -0.45, p: 0.7, notes: "Eb4+G4:4 | Eb4+Ab4:4 | D4+F4:4 | D4+G4:4" },
      { inst: "timpani", vol: 0.8, notes: "C2:1! r:3 | Ab1:1 r:3 | Bb1:1 r:3 | G1:1/4 G1:1/4 G1:1/4 G1:1/4 G1:1! r:2" },
      { inst: "kick", vol: 0.75, notes: "x:1 r:0.5 x:0.5 x:1 r:1" },
      { inst: "snare", vol: 0.6, notes: "r:1 x:1 r:1 x:0.75 x:0.25" },
      { inst: "hat", vol: 0.6, pan: 0.3, p: 0.7, notes: "x:0.5 x:0.5 x:0.5 x:0.5 x:0.5 x:0.5 x:0.5 x:0.5" },
    ],
  },
  // Space and the ship: F lydian, floating; a pad and a choir, bells like far stars, a low drone
  space: {
    name: "Space", bpm: 60, beats: 4, bars: 8, gain: 1.023, wet: 0.55,
    parts: [
      { inst: "pad", vol: 0.95, notes: "F3+C4+E4+A4:4 | F3+B3+D4+G4:4 | F3+C4+E4+A4:4 | F3+B3+D4+G4:4 | D3+A3+F4:4 | E3+B3+G4:4 | F3+C4+A4:4 | G3+D4+A4:4" },
      { inst: "choir", vol: 0.55, pan: 0.2, p: 0.75, notes: "A4:8 B4:8 A4:8 G4:4 A4:4" },
      { inst: "bell", vol: 0.45, pan: -0.4, p: 0.65, notes: "r:2 E6:1 r:1 | r:3 C6:1 | r:2 B5:1 r:1 | r:4 | r:1 A5:1 r:2 | r:3 G5:1 | r:2 C6:1 r:1 | r:4" },
      { inst: "strings", vol: 0.5, notes: "F1:16 D1:8 F1:4 G1:4" },
      { inst: "flute", vol: 0.45, pan: 0.35, p: 0.4, from: 1, notes: "r:4 | C6:2 B5:2 | A5:4 | r:4 | r:4 | B5:2 G5:2 | A5:4 | r:4" },
    ],
  },
  // A chase (speeder races, convoys, ambushes on the road, dogfights): E minor at 150, a pumping synth bass, rock drums, brass stabs
  chase: {
    name: "Chase", bpm: 150, beats: 4, bars: 8, gain: 0.357, wet: 0.2,
    parts: [
      { inst: "synthbass", vol: 0.95, notes: "E2:0.5 E2:0.5 E3:0.5 E2:0.5 E2:0.5 E3:0.5 D3:0.5 B2:0.5 | C2:0.5 C2:0.5 C3:0.5 C2:0.5 C2:0.5 C3:0.5 B2:0.5 G2:0.5 | D2:0.5 D2:0.5 D3:0.5 D2:0.5 D2:0.5 D3:0.5 C3:0.5 A2:0.5 | B1:0.5 B1:0.5 B2:0.5 B1:0.5 B1:0.5 B2:0.5 A2:0.5 F#2:0.5" },
      { inst: "kick", vol: 0.85, notes: "x:0.75 x:0.25 r:1 x:0.5 x:0.5 r:1" },
      { inst: "snare", vol: 0.7, notes: "r:1 x:1! r:1 x:1!" },
      { inst: "hat", vol: 0.55, pan: 0.3, notes: "x:0.5 x:0.5 x:0.5 x:0.5 x:0.5 x:0.5 x:0.5 x:0.5" },
      { inst: "brass", vol: 0.8, pan: -0.2, notes: "E4+G4+B4:0.5! r:1 E4+G4+B4:0.5 r:2 | C4+E4+G4:0.5! r:1 C4+E4+G4:0.5 r:2 | D4+F#4+A4:0.5! r:1 D4+F#4+A4:0.5 r:2 | B3+D#4+F#4:0.5! r:1 B3+D#4+F#4:0.5 r:2" },
      { inst: "strings", vol: 0.85, pan: 0.2, p: 0.85, from: 1, notes: "B4:1 E5:1 G5:1 F#5:1 | E5:2 C5:2 | D5:1 F#5:1 A5:1 G5:0.5 F#5:0.5 | F#5:4 | B4:0.5 E5:0.5 G5:1 B5:1 A5:1 | G5:1 E5:1 C5:2 | D5:1 A5:1 F#5:1 D5:1 | D#5:4" },
      { inst: "timpani", vol: 0.6, p: 0.6, notes: "E2:1! r:3 | C2:1 r:3 | D2:1 r:3 | B1:1/4 B1:1/4 B1:1/4 B1:1/4 B1:1! r:2" },
    ],
  },
};

// Short pieces played once over the music (which is ducked under them)
export const STINGS: Record<string, Piece> = {
  victory: {
    name: "Victory", bpm: 120, beats: 4, bars: 3, gain: 0.7, wet: 0.35,
    parts: [
      { inst: "brass", vol: 1, notes: "F4:0.5 Bb4:0.5 D5:0.5 F5:1.5! r:1 | D5:0.5 F5:0.5 Bb5:3 | r:4" },
      { inst: "strings", vol: 0.9, notes: "Bb3+D4+F4:4 | Bb3+D4+F4+Bb4:4 | r:4" },
      { inst: "timpani", vol: 0.9, notes: "Bb2:1/4 Bb2:1/4 Bb2:1/4 Bb2:1/4 F2:1! r:2 | Bb2:1! r:3 | r:4" },
      { inst: "bell", vol: 0.5, notes: "r:4 | r:1 D6:1 F6:1 Bb6:1 | r:4" },
    ],
  },
  defeat: {
    name: "Defeat", bpm: 64, beats: 4, bars: 3, gain: 1.459, wet: 0.5,
    parts: [
      { inst: "strings", vol: 1, notes: "C4+Eb4+G4:2 Bb3+Db4+F4:2 | Ab3+C4+Eb4:2 G3+B3+D4:2 | r:4" },
      { inst: "strings", vol: 0.8, notes: "C2:2 Bb1:2 | Ab1:2 G1:2 | r:4" },
      { inst: "timpani", vol: 0.6, notes: "C2:1 r:3 | r:2 G1:1 r:1 | r:4" },
    ],
  },
  levelup: {
    name: "Level up", bpm: 132, beats: 4, bars: 2, gain: 1.15, wet: 0.35,
    parts: [
      { inst: "bell", vol: 0.8, notes: "C5:0.5 E5:0.5 G5:0.5 C6:2.5 | r:4" },
      { inst: "brass", vol: 0.7, notes: "r:1.5 C4+E4+G4+C5:2.5 | r:4" },
      { inst: "pluck", vol: 0.7, notes: "C4:0.5 E4:0.5 G4:0.5 C5:0.5 E5:0.5 G5:0.5 C6:1 | r:4" },
    ],
  },
  quest: {
    name: "Quest done", bpm: 96, beats: 4, bars: 2, gain: 2.381, wet: 0.4,
    parts: [
      { inst: "horn", vol: 1, notes: "G4:1 C5:1 E5:2 | r:4" },
      { inst: "strings", vol: 0.8, notes: "C4+E4+G4:4 | r:4" },
      { inst: "bell", vol: 0.5, notes: "r:2 G5:1 C6:1 | r:4" },
    ],
  },
};

export type Mood = "title" | "explore" | "town" | "cantina" | "tension" | "combat" | "space" | "chase";

// ---- Scheduling -------------------------------------------------------------------------------------------------------------------------
const parsed = new Map<string, { events: NoteEvent[]; length: number }>();
function partNotes(p: Part) {
  const key = `${p.oct ?? 0}|${p.notes}`;
  let hit = parsed.get(key);
  if (!hit) parsed.set(key, (hit = parseNotes(p.notes, p.oct ?? 0)));
  return hit;
}
export const pieceBeats = (p: Piece) => p.bars * p.beats;
export const pieceSeconds = (p: Piece) => (pieceBeats(p) * 60) / p.bpm;

// A pass of a piece: the notes of the parts that play on it, in time order (seconds from the pass's start)
interface Hit { at: number; part: number; ev: NoteEvent }
export function passOf(piece: Piece, pass: number, rnd: () => number): Hit[] {
  const beat = 60 / piece.bpm;
  const total = pieceBeats(piece);
  const hits: Hit[] = [];
  piece.parts.forEach((part, i) => {
    if ((part.from ?? 0) > pass) return;
    if (part.p !== undefined && rnd() > part.p) return;
    const { events, length } = partNotes(part);
    for (let k = 0; k * length < total - 1e-9; k++) {
      for (const ev of events) {
        let b = k * length + ev.at;
        if (b >= total - 1e-9) break;
        if (part.swing && piece.swing) {
          const frac = b - Math.floor(b);
          if (Math.abs(frac - 0.5) < 1e-6) b = Math.floor(b) + piece.swing;
        }
        hits.push({ at: b * beat, part: i, ev: { ...ev, dur: ev.dur * beat * (ev.stacc ? 0.45 : 0.98) } });
      }
    }
  });
  return hits.sort((a, b) => a.at - b.at);
}

// The nodes of one playing piece: per part a panner and a reverb send, the piece's dry and wet gains (faded together)
interface Rig { dry: GainNode; wet: GainNode; outs: AudioNode[] }
// One reverb for all the music on a context (convolution is the costly part on a phone): the pieces' sends meet in it
const halls = new WeakMap<AudioNode, ConvolverNode>();
function hallOf(c: BaseAudioContext, dest: AudioNode): ConvolverNode {
  let verb = halls.get(dest);
  if (!verb) {
    verb = c.createConvolver();
    verb.buffer = reverbOf(c);
    verb.connect(dest);
    halls.set(dest, verb);
  }
  return verb;
}
function rigOf(c: BaseAudioContext, piece: Piece, dest: AudioNode, level = 1): Rig {
  const dry = c.createGain();
  const wet = c.createGain();
  dry.gain.value = level * piece.gain;
  wet.gain.value = level * piece.gain;
  dry.connect(dest);
  wet.connect(hallOf(c, dest));
  const outs = piece.parts.map((part) => {
    const g = c.createGain();
    g.gain.value = part.vol ?? 1;
    const send = c.createGain();
    send.gain.value = part.wet ?? piece.wet ?? 0.3;
    let tail: AudioNode = g;
    if (part.pan && c.createStereoPanner) {
      const pan = c.createStereoPanner();
      pan.pan.value = part.pan;
      g.connect(pan);
      tail = pan;
    }
    tail.connect(dry);
    tail.connect(send).connect(wet);
    return g;
  });
  return { dry, wet, outs };
}
// ---- One-shots: drums, plucked notes and basses are rendered once per context (by the same instruments, on an offline context) and then
// played from a buffer, a source and a gain a note instead of a small synthesizer: the music costs about a third as much, which is what lets
// it play on a phone beside the 3D map. Noisy ones keep three takes, so a run of hits is not the same hit again. A note whose buffer is not
// ready yet is played live, so nothing waits for them.
const ONE_SHOT: Partial<Record<Inst, { tail: number; takes: number; byLength?: boolean }>> = {
  kick: { tail: 0.6, takes: 1 }, snare: { tail: 0.5, takes: 3 }, brush: { tail: 0.6, takes: 3 }, hat: { tail: 0.2, takes: 3 }, ride: { tail: 1.1, takes: 3 },
  shaker: { tail: 0.3, takes: 3 }, tom: { tail: 0.9, takes: 2 }, timpani: { tail: 2.5, takes: 2 }, pluck: { tail: 2.5, takes: 1 }, bell: { tail: 3.5, takes: 1 },
  steel: { tail: 1.6, takes: 1 }, bass: { tail: 0.6, takes: 1, byLength: true }, synthbass: { tail: 0.3, takes: 1, byLength: true },
};
// Short notes of the held instruments (a staccato run, a brass stab) are one-shots too: what follows a note this short is its own decay
const SHORT: Partial<Record<Inst, number>> = { strings: 1.0, brass: 0.55, horn: 0.8, flute: 0.6, clarinet: 0.5, muted: 0.5 };
const specOf = (inst: Inst, dur: number) => ONE_SHOT[inst] ?? (SHORT[inst] !== undefined && dur <= 0.5 ? { tail: SHORT[inst]!, takes: 1, byLength: true } : undefined);
interface ShotNote { inst: Inst; f: number; dur: number; accent: boolean; take: number }
const lengthStep = (dur: number) => Math.min(8, Math.max(1, Math.round(dur * 8)));
const shotKey = (n: Omit<ShotNote, "take">, take: number) => `${n.inst}|${Math.round(n.f * 4)}|${specOf(n.inst, n.dur)?.byLength ? lengthStep(n.dur) : 0}|${n.accent ? 1 : 0}|${take}`;
const shotCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer | null>>();
const warmed = new WeakMap<BaseAudioContext, Set<string>>();
// Renders the one-shots a piece needs that this context lacks, all in one offline render, and keeps them
export async function warmPiece(c: BaseAudioContext, piece: Piece): Promise<void> {
  let done = warmed.get(c);
  if (!done) warmed.set(c, (done = new Set()));
  if (done.has(piece.name)) return;
  done.add(piece.name);
  let cache = shotCache.get(c);
  if (!cache) shotCache.set(c, (cache = new Map()));
  const beat = 60 / piece.bpm;
  const want = new Map<string, ShotNote>();
  for (const part of piece.parts) {
    for (const ev of partNotes(part).events) {
      const dur = ev.dur * beat * (ev.stacc ? 0.45 : 0.98);
      const shot = specOf(part.inst, dur);
      if (!shot) continue;
      for (const f of ev.freqs) for (let take = 0; take < shot.takes; take++) {
        const note = { inst: part.inst, f, dur: shot.byLength ? lengthStep(dur) / 8 : dur, accent: ev.vel > 1.1, take };
        const key = shotKey(note, take);
        if (!cache.has(key) && !want.has(key)) want.set(key, note);
      }
    }
  }
  if (!want.size) return;
  const notes = [...want.entries()];
  const rate = c.sampleRate;
  const spans = notes.map(([, n]) => { const spec = specOf(n.inst, n.dur)!; return n.dur * (spec.byLength ? 1 : 0) + spec.tail + 0.05; });
  const total = spans.reduce((a, b) => a + b, 0);
  for (const [key] of notes) cache.set(key, null);
  const off = new OfflineAudioContext(1, Math.ceil(total * rate), rate);
  let at = 0;
  const starts = notes.map(([, n], i) => {
    const t = at;
    INSTRUMENTS[n.inst](off, off.destination, t + 0.002, n.f, n.dur, n.accent ? 1.25 : 1);
    at += spans[i];
    return t;
  });
  const out = (await off.startRendering()).getChannelData(0);
  notes.forEach(([key], i) => {
    const from = Math.floor(starts[i] * rate);
    const len = Math.floor(spans[i] * rate);
    const buf = c.createBuffer(1, len, rate);
    buf.getChannelData(0).set(out.subarray(from, from + len));
    cache!.set(key, buf);
  });
}
function shotOf(c: BaseAudioContext, inst: Inst, f: number, dur: number, accent: boolean): AudioBuffer | null {
  const shot = specOf(inst, dur);
  if (!shot) return null;
  return shotCache.get(c)?.get(shotKey({ inst, f, dur, accent }, Math.floor(Math.random() * shot.takes))) ?? null;
}

function strike(c: BaseAudioContext, piece: Piece, rig: Rig, start: number, hit: Hit) {
  const part = piece.parts[hit.part];
  const play = INSTRUMENTS[part.inst];
  const t = start + hit.at;
  // a breath of human timing and touch
  const vel = hit.ev.vel * (0.9 + Math.random() * 0.15);
  const chord = hit.ev.freqs.length;
  for (const f of hit.ev.freqs) {
    const level = (vel / Math.sqrt(chord)) * (chord > 1 ? 1.35 : 1);
    const when = t + Math.random() * 0.006;
    const buf = shotOf(c, part.inst, f, hit.ev.dur, hit.ev.vel > 1.1);
    if (buf) {
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = level / (hit.ev.vel > 1.1 ? 1.25 : 1);
      src.connect(g).connect(rig.outs[hit.part]);
      src.start(when);
    } else play(c, rig.outs[hit.part], when, f, hit.ev.dur, level);
  }
}

// Renders `seconds` of a piece (looped) or a stinger on an offline context: what the previews and the level checks use
export async function renderPiece(piece: Piece, seconds: number, rate = 44100, once = false): Promise<AudioBuffer> {
  const c = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  const mix = mixerOn(c);
  await warmPiece(c, piece);
  const rig = rigOf(c, piece, mix.music);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const loop = pieceSeconds(piece);
  // Scheduled a little at a time, as the player does (the render stops every half second for the next notes): with every note of a long
  // render waiting in the graph at once, the renderer slows the longer it gets, and its time would no longer tell what playing costs
  let pass = 0;
  let start = 0.05;
  let hits = passOf(piece, 0, rnd);
  let i = 0;
  const until = (end: number) => {
    for (;;) {
      if (i >= hits.length) {
        if (once) return;
        pass += 1;
        start += loop;
        hits = passOf(piece, pass, rnd);
        i = 0;
        if (!hits.length) return;
      }
      const at = start + hits[i].at;
      if (at >= Math.min(end, seconds)) return;
      strike(c, piece, rig, start, hits[i]);
      i += 1;
    }
  };
  const STEP = 0.5;
  until(STEP + 0.5);
  for (let t = STEP; t < seconds - 0.05; t += STEP) {
    const now = t;
    void c.suspend(now).then(() => {
      until(now + STEP + 0.5);
      void c.resume();
    });
  }
  return c.startRendering();
}
export const renderMood = (mood: string, seconds: number, rate?: number) => renderPiece(PIECES[mood] ?? STINGS[mood], seconds, rate, !PIECES[mood]);

// ---- The player in the page -------------------------------------------------------------------------------------------------------------
interface Playing { mood: Mood; piece: Piece; rig: Rig; pass: number; start: number; hits: Hit[]; i: number; stopAt: number | null }
let base: Mood | null = null;
const overlays: { id: number; mood: Mood }[] = [];
let overlayId = 0;
let playing: Playing | null = null;
const fading: Playing[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
const FADE_OUT = 2.2;
const FADE_IN = 1.2;

const wanted = (): Mood | null => (overlays.length ? overlays[overlays.length - 1].mood : base);
const musicOn = () => {
  const l = getLevels();
  return !l.muted && l.music > 0.001;
};

function begin(mood: Mood, c: AudioContext, dest: AudioNode): Playing {
  const piece = PIECES[mood];
  void warmPiece(c, piece);
  const rig = rigOf(c, piece, dest, 0);
  const t = c.currentTime + 0.08;
  for (const g of [rig.dry, rig.wet]) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(piece.gain, t + FADE_IN);
  }
  return { mood, piece, rig, pass: 0, start: t, hits: passOf(piece, 0, Math.random), i: 0, stopAt: null };
}
function fadeOut(p: Playing, c: AudioContext) {
  const t = c.currentTime;
  for (const g of [p.rig.dry, p.rig.wet]) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + FADE_OUT);
  }
  p.stopAt = t + FADE_OUT;
  fading.push(p);
}
// Schedules what falls within the next moment (further ahead when the page is hidden: its timers are slowed)
function pump(p: Playing, c: AudioContext) {
  const ahead = c.currentTime + (typeof document !== "undefined" && document.hidden ? 1.5 : 0.4);
  for (;;) {
    if (p.stopAt !== null && p.start + (p.hits[p.i]?.at ?? Infinity) > p.stopAt) return;
    if (p.i >= p.hits.length) {
      p.start += pieceSeconds(p.piece);
      p.pass += 1;
      p.hits = passOf(p.piece, p.pass, Math.random);
      p.i = 0;
      if (!p.hits.length) return;
    }
    const hit = p.hits[p.i];
    if (p.start + hit.at > ahead) return;
    if (p.start + hit.at >= c.currentTime - 0.05) strike(c, p.piece, p.rig, p.start, hit);
    p.i += 1;
  }
}
function tick() {
  // (no music wanted and none playing or fading: nothing to do, and no audio context is made for it)
  if (!musicOn() && !playing && !fading.length) return;
  const c = audioContext();
  const dest = busOf("music");
  if (!c || !dest || c.state !== "running") return;
  const want = musicOn() ? wanted() : null;
  if ((playing?.mood ?? null) !== want) {
    if (playing) fadeOut(playing, c);
    playing = want ? begin(want, c, dest) : null;
  }
  if (playing) pump(playing, c);
  for (let k = fading.length - 1; k >= 0; k--) {
    const f = fading[k];
    if (c.currentTime > (f.stopAt ?? 0) + 3) {
      f.rig.dry.disconnect();
      f.rig.wet.disconnect();
      fading.splice(k, 1);
    } else pump(f, c);
  }
}
function ensureTimer() {
  if (timer || typeof window === "undefined") return;
  timer = setInterval(tick, 100);
  onLevels(() => tick());
}

// The mood of where the party is (a pure choice, the player calls it): a cantina or gambling hall, a town or port, a hostile place,
// the wild, or space (aboard a ship in space, or a system or beyond)
const WILD = /cave|ruin|camp|crash|wreck|temple|tomb|lair|nest|wild/i;
export function moodOfPlace(world: Pick<World, "areas"> | null, areaId: string | null, aboard = false): Mood {
  const here: Area | undefined = world && areaId ? world.areas[areaId] : undefined;
  if (!world || !here) return "explore";
  const chain: Area[] = [];
  for (let a: Area | undefined = here; a && chain.length < 12; a = a.parentId ? world.areas[a.parentId] : undefined) chain.push(a);
  if (here.kind === "galaxy" || here.kind === "region" || here.kind === "system") return "space";
  if (here.kind === "planet") return aboard ? "space" : "explore";
  if (chain.slice(0, 3).some((a) => /cantina|gambling hall/i.test(a.type))) return "cantina";
  const foes = here.occupants?.some((o) => o.disposition === "hostile" && (o.hitPoints ?? 1) > 0 && !o.captive);
  if (foes) return "tension";
  const settlement = chain.find((a) => a.kind === "settlement");
  if (settlement && !WILD.test(settlement.type)) return "town";
  if (/station/i.test(settlement?.type ?? "")) return "town";
  return "explore";
}

// The base mood (null: silence) and moods laid over it; an overlay returns its own remover
export function setMusicBase(mood: Mood | null) {
  base = mood;
  ensureTimer();
  tick();
}
export function musicOverlay(mood: Mood): () => void {
  const id = ++overlayId;
  overlays.push({ id, mood });
  ensureTimer();
  tick();
  return () => {
    const k = overlays.findIndex((o) => o.id === id);
    if (k >= 0) overlays.splice(k, 1);
    tick();
  };
}
// A stinger, once, over the music: the music dips under it and comes back
export function sting(name: keyof typeof STINGS) {
  const c = audioContext();
  const dest = busOf("music");
  const piece = STINGS[name];
  if (!c || !dest || !piece || c.state !== "running" || !musicOn()) return;
  const t = c.currentTime + 0.05;
  const length = pieceSeconds(piece);
  if (playing) {
    for (const g of [playing.rig.dry, playing.rig.wet]) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(playing.piece.gain * 0.25, t + 0.2);
      g.gain.setValueAtTime(playing.piece.gain * 0.25, t + length * 0.8);
      g.gain.linearRampToValueAtTime(playing.piece.gain, t + length + 1.5);
    }
  }
  const rig = rigOf(c, piece, dest);
  for (const hit of passOf(piece, 0, Math.random)) strike(c, piece, rig, t, hit);
  setTimeout(() => {
    rig.dry.disconnect();
    rig.wet.disconnect();
  }, (length + 5) * 1000);
}
export const musicNow = () => ({ base, overlays: overlays.map((o) => o.mood), playing: playing?.mood ?? null });
// For test scripts and checks in the browser (as window.__map3d is for the map): what the music is doing
if (typeof window !== "undefined") (window as unknown as { __music?: object }).__music = { now: musicNow };
