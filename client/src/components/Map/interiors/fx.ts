// The game's sound effects: synthesized, no audio files (the shooter's first set 2026-10-29; rebuilt and widened 2026-11-22, the user: "work
// on sound effects and background music"). Each effect is layers of oscillators and filtered noise, made fresh each time so no two shots
// are the same: a blaster's falling zap with its crack and thump, a bolt striking, a grenade's blast with its rumble and crackle, a saber's
// hum, swing, clash and ignition, Force powers, the interface's clicks, dice, cards and coins, doors, comlinks, alarms, a ship's jump to
// hyperspace and engines that follow a vehicle's speed. They play on the effects bus of lib/audio.ts (its volume, its mute) with a small
// room for the big ones, only once the player has touched the page, and the same effect at most every few milliseconds (a hail of bolts
// is not a wall of noise). `renderSfx` makes the same sound on an OfflineAudioContext (previews, checks). All this project's own (CC0).
import { audible, audioContext, busOf, getLevels, mixerOn, reverbOf } from "@/lib/audio";

type C = BaseAudioContext;
interface Dest { out: AudioNode; room: AudioNode }

const last: Record<string, number> = {};
const ready = (key: string, gap: number) => {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - (last[key] ?? -1e9) < gap) return false;
  last[key] = now;
  return true;
};

// ---- Building blocks ----
const noises = new WeakMap<C, AudioBuffer>();
function noiseBuf(c: C): AudioBuffer {
  let b = noises.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noises.set(c, b);
  }
  return b;
}
function env(c: C, t: number, att: number, peak: number, decay: number, hold = 0): GainNode {
  const g = c.createGain();
  g.gain.value = 0.0001; // silent before `t` too: a gain starts at 1, and a start between two samples would let the first one through
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.001, att));
  g.gain.setValueAtTime(Math.max(0.0002, peak), t + att + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + att + hold + decay);
  return g;
}
function panned(c: C, node: AudioNode, pan: number): AudioNode {
  if (!pan || !c.createStereoPanner) return node;
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  node.connect(p);
  return p;
}
// A tone that glides from `from` to `to` over `secs`
function tone(c: C, d: Dest, t: number, type: OscillatorType, from: number, to: number, secs: number, vol: number, o: { pan?: number; att?: number; room?: number; lp?: number } = {}) {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + secs);
  const g = env(c, t, o.att ?? 0.004, vol, secs);
  let n: AudioNode = osc;
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.lp;
    osc.connect(f);
    n = f;
  }
  n.connect(g);
  const tail = panned(c, g, o.pan ?? 0);
  tail.connect(d.out);
  if (o.room) {
    const s = c.createGain();
    s.gain.value = o.room;
    tail.connect(s).connect(d.room);
  }
  osc.start(t);
  osc.stop(t + (o.att ?? 0.004) + secs + 0.05);
  return osc;
}
// A burst of noise through a filter (whose frequency may sweep from `f` to `to`)
function hiss(c: C, d: Dest, t: number, type: BiquadFilterType, f: number, secs: number, vol: number, o: { to?: number; q?: number; att?: number; pan?: number; room?: number } = {}) {
  const src = c.createBufferSource();
  src.buffer = noiseBuf(c);
  const flt = c.createBiquadFilter();
  flt.type = type;
  flt.Q.value = o.q ?? 0.8;
  flt.frequency.value = f; // the start value up front: a jump at the start can throw a one-sample spike (seen in Chromium)
  flt.frequency.setValueAtTime(f, t);
  if (o.to) flt.frequency.exponentialRampToValueAtTime(o.to, t + (o.att ?? 0.003) + secs);
  const g = env(c, t, o.att ?? 0.003, vol, secs);
  src.connect(flt).connect(g);
  const tail = panned(c, g, o.pan ?? 0);
  tail.connect(d.out);
  if (o.room) {
    const s = c.createGain();
    s.gain.value = o.room;
    tail.connect(s).connect(d.room);
  }
  src.start(t, Math.random() * 1.5);
  src.stop(t + (o.att ?? 0.003) + secs + 0.05);
}
// A struck metal: frequency modulation at an inharmonic ratio
function ping(c: C, d: Dest, t: number, f: number, secs: number, vol: number, ratio = 2.76, pan = 0, room = 0) {
  const car = c.createOscillator();
  const mod = c.createOscillator();
  car.frequency.value = f;
  mod.frequency.value = f * ratio;
  const mg = c.createGain();
  mg.gain.setValueAtTime(f * 1.5, t);
  mg.gain.exponentialRampToValueAtTime(1, t + secs);
  mod.connect(mg).connect(car.frequency);
  const g = env(c, t, 0.002, vol, secs);
  car.connect(g);
  const tail = panned(c, g, pan);
  tail.connect(d.out);
  if (room) {
    const s = c.createGain();
    s.gain.value = room;
    tail.connect(s).connect(d.room);
  }
  car.start(t);
  mod.start(t);
  car.stop(t + secs + 0.05);
  mod.stop(t + secs + 0.05);
}
// Crackle: short random clicks over a span
function crackle(c: C, d: Dest, t: number, span: number, count: number, vol: number, f = 3000, pan = 0) {
  for (let i = 0; i < count; i++) hiss(c, d, t + Math.random() * span, "bandpass", f * (0.6 + Math.random() * 0.8), 0.008 + Math.random() * 0.012, vol * (0.4 + Math.random() * 0.6), { q: 2, pan });
}
// A saber's hum: two detuned saws and a sub square through a low-pass
function hum(c: C, d: Dest, t: number, secs: number, vol: number, f = 92, o: { bend?: number; open?: number; room?: number } = {}) {
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 500;
  lp.frequency.setValueAtTime(500, t);
  if (o.open) {
    lp.frequency.linearRampToValueAtTime(o.open, t + secs * 0.45);
    lp.frequency.linearRampToValueAtTime(500, t + secs);
  }
  const g = c.createGain();
  g.gain.value = 0.0001;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + secs * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
  for (const [type, mul, det] of [["sawtooth", 1, -9], ["sawtooth", 1, 9], ["square", 0.5, 0]] as const) {
    const o2 = c.createOscillator();
    o2.type = type;
    o2.detune.value = det;
    o2.frequency.setValueAtTime(f * mul, t);
    if (o.bend) {
      o2.frequency.exponentialRampToValueAtTime(f * mul * o.bend, t + secs * 0.45);
      o2.frequency.exponentialRampToValueAtTime(f * mul, t + secs);
    }
    o2.connect(lp);
    o2.start(t);
    o2.stop(t + secs + 0.05);
  }
  lp.connect(g).connect(d.out);
  if (o.room) {
    const s = c.createGain();
    s.gain.value = o.room;
    g.connect(s).connect(d.room);
  }
}

// ---- The effects: (context, destination, start time, ...arguments) ----
type Maker = (c: C, d: Dest, t: number, ...args: never[]) => void;
const MAKERS = {
  // A blaster bolt: a falling zap with a warble, a crack at the muzzle and (the party's own) a thump; a foe's is lower and placed by `pan`
  shot(c: C, d: Dest, t: number, own = true, pan = 0) {
    const hi = own ? 2600 : 1500;
    const lo = own ? 300 : 180;
    const zap = tone(c, d, t, "sine", hi, lo, own ? 0.17 : 0.2, own ? 0.2 : 0.11, { pan, room: 0.15 });
    const warble = c.createOscillator();
    const wg = c.createGain();
    warble.frequency.value = 60 + Math.random() * 30;
    wg.gain.value = hi * 0.12;
    warble.connect(wg).connect(zap.frequency);
    warble.start(t);
    warble.stop(t + 0.25);
    tone(c, d, t, "square", hi * 1.5, lo * 1.5, own ? 0.12 : 0.14, own ? 0.045 : 0.025, { pan, lp: 5000 });
    hiss(c, d, t, "highpass", 2600, 0.03, own ? 0.14 : 0.06, { pan });
    if (own) tone(c, d, t, "sine", 150, 55, 0.09, 0.16);
  },
  // A bolt striking a body: a thump and a burn; `kill` adds a heavier blow
  hit(c: C, d: Dest, t: number, kill = false) {
    tone(c, d, t, "sine", 190, 70, 0.12, 0.2);
    hiss(c, d, t, "lowpass", 900, 0.1, 0.12);
    hiss(c, d, t + 0.01, "highpass", 3500, 0.12, 0.05, { att: 0.01 });
    if (kill) {
      tone(c, d, t + 0.02, "sine", 110, 40, 0.3, 0.25);
      hiss(c, d, t + 0.02, "bandpass", 420, 0.28, 0.16, { q: 1.2, room: 0.2 });
    }
  },
  // The party is hurt: a low blow, muffled, and the sizzle of a burn
  hurt(c: C, d: Dest, t: number) {
    tone(c, d, t, "sine", 150, 50, 0.22, 0.3);
    hiss(c, d, t, "lowpass", 500, 0.16, 0.16);
    hiss(c, d, t + 0.02, "highpass", 4000, 0.18, 0.05, { att: 0.02 });
  },
  // A bolt striking a wall: a spark's ping and a crack, with a crackle
  impact(c: C, d: Dest, t: number) {
    hiss(c, d, t, "bandpass", 3000, 0.035, 0.12, { q: 1 });
    tone(c, d, t, "sine", 1900, 900, 0.05, 0.05);
    crackle(c, d, t + 0.01, 0.08, 4, 0.05, 4000);
  },
  // A grenade or anything that blows up: a blast whose noise darkens as it dies, a falling sub, debris crackling, the room
  boom(c: C, d: Dest, t: number) {
    hiss(c, d, t, "lowpass", 5000, 1.3, 0.55, { to: 140, room: 0.5 });
    tone(c, d, t, "sine", 80, 26, 0.9, 0.5);
    tone(c, d, t, "triangle", 160, 45, 0.25, 0.22);
    crackle(c, d, t + 0.05, 0.9, 16, 0.07, 2200);
  },
  // A saber's swing: the hum swells and bends up as it passes (a Doppler), a whoosh of air with it
  swing(c: C, d: Dest, t: number) {
    hum(c, d, t, 0.34, 0.16, 90 + Math.random() * 8, { bend: 1.3, open: 1800, room: 0.12 });
    hiss(c, d, t, "bandpass", 700, 0.3, 0.07, { to: 2200, att: 0.1, q: 1.5 });
  },
  // A saber turns a bolt: a bright metal strike, a spark and the bolt's zap flying off
  deflect(c: C, d: Dest, t: number) {
    ping(c, d, t, 1900, 0.28, 0.12, 1.41, 0, 0.15);
    hiss(c, d, t, "highpass", 3000, 0.05, 0.12);
    tone(c, d, t + 0.01, "sine", 2200, 400, 0.13, 0.06);
    crackle(c, d, t, 0.12, 5, 0.06, 5000);
  },
  // Two blades meet: a burst of noise, two inharmonic rings, the hum flaring, sparks
  clash(c: C, d: Dest, t: number) {
    hiss(c, d, t, "bandpass", 2500, 0.18, 0.25, { q: 0.8, room: 0.3 });
    ping(c, d, t, 1450, 0.4, 0.09, 1.61, 0, 0.2);
    ping(c, d, t, 2330, 0.3, 0.06, 1.33, 0, 0.2);
    hum(c, d, t, 0.4, 0.18, 96, { open: 3000 });
    crackle(c, d, t, 0.25, 10, 0.08, 4500);
  },
  // A saber lit: the hum rises from below, opening up, with a snap and a hiss; `off` puts it out (the reverse)
  ignite(c: C, d: Dest, t: number, off = false) {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    const g = c.createGain();
    const end = t + (off ? 0.45 : 0.9);
    lp.frequency.value = off ? 1800 : 300;
    lp.frequency.setValueAtTime(off ? 1800 : 300, t);
    lp.frequency.exponentialRampToValueAtTime(off ? 250 : 1800, t + (off ? 0.4 : 0.25));
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(off ? 0.15 : 0.2, t + 0.04);
    g.gain.exponentialRampToValueAtTime(off ? 0.0001 : 0.06, t + (off ? 0.42 : 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    for (const [type, mul, det] of [["sawtooth", 1, -9], ["sawtooth", 1, 9], ["square", 0.5, 0]] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.detune.value = det;
      o.frequency.setValueAtTime(off ? 95 * mul : 38 * mul, t);
      o.frequency.exponentialRampToValueAtTime(off ? 36 * mul : 95 * mul, t + (off ? 0.4 : 0.28));
      o.connect(lp);
      o.start(t);
      o.stop(end + 0.05);
    }
    lp.connect(g).connect(d.out);
    const s = c.createGain();
    s.gain.value = 0.2;
    g.connect(s).connect(d.room);
    hiss(c, d, t, "highpass", 1500, off ? 0.2 : 0.12, 0.08);
    if (!off) crackle(c, d, t, 0.15, 6, 0.06, 3500);
  },
  // A Force power: a heal shimmers up, a push or a pull is a deep rush of air, anything else crackles like lightning
  power(c: C, d: Dest, t: number, kind = "") {
    if (kind === "heal") {
      [523, 659, 784, 1047, 1319].forEach((f, i) => ping(c, d, t + i * 0.06, f, 0.6, 0.05, 2, 0, 0.4));
      hiss(c, d, t, "highpass", 5000, 0.6, 0.02, { att: 0.2 });
      return;
    }
    if (kind === "push" || kind === "pull") {
      const push = kind === "push";
      hiss(c, d, t, "lowpass", push ? 200 : 1400, 0.45, 0.35, { to: push ? 1500 : 180, att: push ? 0.03 : 0.15, room: 0.4 });
      tone(c, d, t, "sine", push ? 120 : 50, push ? 45 : 110, 0.4, 0.3);
      return;
    }
    for (let i = 0; i < 6; i++) hiss(c, d, t + i * 0.05 + Math.random() * 0.03, "bandpass", 2500 + Math.random() * 2000, 0.05, 0.4, { q: 3 });
    tone(c, d, t, "sawtooth", 120, 90, 0.4, 0.06, { lp: 2500 });
    crackle(c, d, t, 0.4, 14, 0.2, 3500);
  },
  // A blaster's power cell changed: the old one out, the new one in, and the charge whining up
  reload(c: C, d: Dest, t: number) {
    hiss(c, d, t, "highpass", 3000, 0.02, 0.1);
    ping(c, d, t, 2400, 0.05, 0.05, 1.5);
    hiss(c, d, t + 0.2, "highpass", 2200, 0.025, 0.12);
    tone(c, d, t + 0.2, "sine", 160, 70, 0.05, 0.12);
    tone(c, d, t + 0.24, "triangle", 300, 900, 0.35, 0.035);
  },
  // The tabletop's strokes: a miss whooshes past, a hit lands, a critical hit lands hard and rings
  strike(c: C, d: Dest, t: number, how: "hit" | "miss" | "crit" = "hit") {
    if (how === "miss") {
      hiss(c, d, t, "bandpass", 500, 0.22, 0.4, { to: 2200, att: 0.06, q: 1.4 });
      return;
    }
    tone(c, d, t, "sine", how === "crit" ? 220 : 180, 55, how === "crit" ? 0.3 : 0.18, how === "crit" ? 0.35 : 0.24);
    hiss(c, d, t, "lowpass", 1100, 0.12, how === "crit" ? 0.22 : 0.14);
    if (how === "crit") {
      ping(c, d, t, 1200, 0.45, 0.07, 1.41, 0, 0.3);
      crackle(c, d, t, 0.15, 6, 0.06);
    }
  },
  // Someone falls: a dull blow and a body meeting the ground
  fall(c: C, d: Dest, t: number) {
    tone(c, d, t, "sine", 95, 38, 0.32, 0.3);
    hiss(c, d, t + 0.02, "lowpass", 450, 0.3, 0.2);
    hiss(c, d, t + 0.18, "lowpass", 300, 0.2, 0.14);
  },
  // The interface: a tap, a yes, a no, a refusal
  click(c: C, d: Dest, t: number) {
    tone(c, d, t, "sine", 2300, 1800, 0.018, 0.035);
    hiss(c, d, t, "highpass", 6000, 0.008, 0.02);
  },
  confirm(c: C, d: Dest, t: number) {
    ping(c, d, t, 880, 0.12, 0.05, 2);
    ping(c, d, t + 0.07, 1320, 0.18, 0.05, 2);
  },
  cancel(c: C, d: Dest, t: number) {
    ping(c, d, t, 700, 0.1, 0.045, 2);
    ping(c, d, t + 0.07, 470, 0.16, 0.045, 2);
  },
  error(c: C, d: Dest, t: number) {
    tone(c, d, t, "square", 220, 210, 0.08, 0.04, { lp: 1600 });
    tone(c, d, t + 0.11, "square", 220, 200, 0.1, 0.04, { lp: 1600 });
  },
  // Credits change hands: coins clinking
  coins(c: C, d: Dest, t: number) {
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) ping(c, d, t + i * (0.04 + Math.random() * 0.04), 2200 + Math.random() * 1400, 0.16, 0.05 * (1 - i * 0.15), 2.76, (Math.random() - 0.5) * 0.4);
  },
  // Something taken up, and something put on
  pickup(c: C, d: Dest, t: number) {
    tone(c, d, t, "triangle", 480, 1000, 0.09, 0.06);
    ping(c, d, t + 0.06, 1500, 0.12, 0.03, 2);
  },
  equip(c: C, d: Dest, t: number) {
    hiss(c, d, t, "bandpass", 1200, 0.04, 0.08, { q: 1.5 });
    tone(c, d, t + 0.02, "sine", 170, 80, 0.06, 0.15);
    ping(c, d, t + 0.03, 2600, 0.06, 0.03, 1.5);
  },
  // Dice thrown on a table: a rattle of clicks, quick then slower, a knock or two as they land
  dice(c: C, d: Dest, t: number, count = 2) {
    let at = t;
    let gap = 0.03;
    const hits = 6 + Math.min(4, count) * 2;
    for (let i = 0; i < hits; i++) {
      hiss(c, d, at, "bandpass", 2500 + Math.random() * 2500, 0.012 + Math.random() * 0.01, 0.12 * (1 - i / (hits + 2)), { q: 3, pan: (Math.random() - 0.5) * 0.5 });
      if (i < 3) tone(c, d, at, "sine", 300 + Math.random() * 120, 150, 0.03, 0.06);
      at += gap * (0.6 + Math.random() * 0.8);
      gap *= 1.18;
    }
  },
  // Cards: one dealt across the table, one turned over, a stack of chips
  deal(c: C, d: Dest, t: number) {
    hiss(c, d, t, "bandpass", 3500, 0.07, 0.09, { to: 1500, q: 0.9, att: 0.01 });
    hiss(c, d, t + 0.07, "highpass", 4000, 0.008, 0.05);
  },
  flip(c: C, d: Dest, t: number) {
    hiss(c, d, t, "highpass", 3500, 0.01, 0.08);
    hiss(c, d, t + 0.01, "bandpass", 2200, 0.05, 0.05, { to: 3500, q: 1 });
  },
  chips(c: C, d: Dest, t: number) {
    for (let i = 0; i < 3; i++) ping(c, d, t + i * 0.05 + Math.random() * 0.02, 3000 + Math.random() * 800, 0.07, 0.04, 2.3);
  },
  // A powered door: a rush of air, the motor, and the leaf meeting its stop
  door(c: C, d: Dest, t: number, open = true) {
    hiss(c, d, t, "bandpass", open ? 1100 : 700, 0.38, 0.14, { to: open ? 500 : 1000, att: 0.04, q: 0.8, room: 0.2 });
    tone(c, d, t, "sawtooth", open ? 260 : 420, open ? 420 : 260, 0.35, 0.02, { lp: 900 });
    tone(c, d, t + 0.36, "sine", 120, 55, 0.1, open ? 0.12 : 0.2);
    hiss(c, d, t + 0.36, "lowpass", 600, 0.06, open ? 0.06 : 0.1);
  },
  // A comlink: two tones and a breath of static
  comms(c: C, d: Dest, t: number) {
    tone(c, d, t, "square", 1400, 1400, 0.07, 0.03, { lp: 4000 });
    tone(c, d, t + 0.09, "square", 1050, 1050, 0.09, 0.03, { lp: 4000 });
    hiss(c, d, t + 0.2, "bandpass", 2000, 0.08, 0.04, { q: 0.7 });
  },
  // An alarm raised
  alarm(c: C, d: Dest, t: number) {
    for (let i = 0; i < 4; i++) tone(c, d, t + i * 0.2, "square", i % 2 ? 600 : 780, i % 2 ? 600 : 780, 0.17, 0.045, { lp: 2500, att: 0.01 });
  },
  // The jump to hyperspace: a rising roar and whine, then the snap of light speed, ringing in the room
  jump(c: C, d: Dest, t: number) {
    tone(c, d, t, "sawtooth", 70, 1600, 1.3, 0.07, { lp: 3000, att: 0.6 });
    tone(c, d, t, "sine", 140, 2400, 1.3, 0.06, { att: 0.6 });
    hiss(c, d, t, "bandpass", 300, 1.2, 0.2, { to: 4000, att: 0.9, q: 0.7 });
    hiss(c, d, t + 1.3, "lowpass", 6000, 0.8, 0.35, { to: 200, room: 0.7 });
    tone(c, d, t + 1.3, "sine", 90, 30, 0.7, 0.35);
  },
  // A ship lifting off and setting down: the engines' roar swelling and fading
  takeoff(c: C, d: Dest, t: number, down = false) {
    hiss(c, d, t, "lowpass", down ? 1200 : 200, 2.6, 0.32, { to: down ? 180 : 1400, att: down ? 0.2 : 1.2, room: 0.3 });
    tone(c, d, t, "sawtooth", down ? 95 : 48, down ? 45 : 92, 2.6, 0.05, { lp: 500, att: down ? 0.2 : 1.2 });
    if (down) tone(c, d, t + 2.5, "sine", 110, 45, 0.25, 0.25);
  },
} satisfies Record<string, Maker>;
export type SfxName = keyof typeof MAKERS;

// How loud each effect is, by tiers measured on renders (peaks at the effects bus, 2026-11-22): the party's own weapons, blasts and sabers
// about -6 dBFS; foes' shots, strikes, powers and hits about -10; doors, engines, comms and alarms about -10 to -14; dice, cards and
// coins about -13; the interface's yes and no about -17 and its clicks about -26, so they never tire the ear
const LEVEL: Partial<Record<SfxName, number>> = {
  shot: 2.6, impact: 5, hit: 2.6, hurt: 2.8, deflect: 4, power: 2.2, strike: 3, fall: 2.4,
  click: 3, confirm: 2.8, cancel: 2.8, error: 2.8, coins: 6, pickup: 6, equip: 2.5, dice: 4.5, deal: 4, flip: 4.5, chips: 4,
  door: 2, comms: 5, alarm: 3.5, jump: 0.75, takeoff: 2,
};
// The room of the effects on a context: a short reverb, shared; each sound gets its own level in front of the bus and of the room
const rooms = new WeakMap<AudioNode, ConvolverNode>();
function destOf(c: C, out: AudioNode, level = 1): Dest {
  let room = rooms.get(out);
  if (!room) {
    room = c.createConvolver();
    room.buffer = reverbOf(c, 1.2, 4, 0.6);
    room.connect(out);
    rooms.set(out, room);
  }
  if (level === 1) return { out, room };
  const dry = c.createGain();
  const wet = c.createGain();
  dry.gain.value = level;
  wet.gain.value = level;
  dry.connect(out);
  wet.connect(room);
  return { out: dry, room: wet };
}
function play<K extends SfxName>(name: K, gap: number, key: string, ...args: Parameters<(typeof MAKERS)[K]> extends [C, Dest, number, ...infer R] ? R : never) {
  if (!audible() || !ready(key, gap)) return;
  const c = audioContext()!;
  const bus = busOf("sfx");
  if (!bus) return;
  (MAKERS[name] as (c: C, d: Dest, t: number, ...a: unknown[]) => void)(c, destOf(c, bus, LEVEL[name] ?? 1), c.currentTime + 0.005, ...args);
}

export const sfx = {
  // `own` is the party's gun (higher and nearer); `pan` places a foe's shot to the left or right of the view
  shot: (own: boolean, pan = 0) => play("shot", own ? 40 : 90, own ? "shot-own" : "shot-foe", own, pan),
  hit: (kill = false) => play("hit", 50, "hit", kill),
  hurt: () => play("hurt", 120, "hurt"),
  impact: () => play("impact", 45, "impact"),
  boom: () => play("boom", 150, "boom"),
  swing: () => play("swing", 120, "swing"),
  deflect: () => play("deflect", 80, "deflect"),
  clash: () => play("clash", 120, "clash"),
  ignite: (off = false) => play("ignite", 250, "ignite", off),
  power: (kind: string) => play("power", 200, "power", kind),
  reload: () => play("reload", 300, "reload"),
  strike: (how: "hit" | "miss" | "crit") => play("strike", 80, "strike", how),
  fall: () => play("fall", 200, "fall"),
  click: () => play("click", 30, "click"),
  confirm: () => play("confirm", 80, "confirm"),
  cancel: () => play("cancel", 80, "cancel"),
  error: () => play("error", 150, "error"),
  coins: () => play("coins", 120, "coins"),
  pickup: () => play("pickup", 80, "pickup"),
  equip: () => play("equip", 80, "equip"),
  dice: (count = 2) => play("dice", 150, "dice", count),
  deal: () => play("deal", 40, "deal"),
  flip: () => play("flip", 40, "flip"),
  chips: () => play("chips", 80, "chips"),
  door: (open = true) => play("door", 250, "door", open),
  comms: () => play("comms", 300, "comms"),
  alarm: () => play("alarm", 1200, "alarm"),
  jump: () => play("jump", 2000, "jump"),
  takeoff: (down = false) => play("takeoff", 2500, "takeoff", down),
};

// An engine that runs while a vehicle moves (speeder, swoop bike, pod, ship): `set` its speed and throttle (0..1) every frame or so;
// `stop` lets it die away. Silent (and cheap) until sound can be heard.
export type EngineKind = "speeder" | "bike" | "pod" | "ship";
const ENGINES: Record<EngineKind, { lo: number; hi: number; wave: OscillatorType; sub: OscillatorType; air: number; drive: number; vol: number }> = {
  speeder: { lo: 55, hi: 150, wave: "sawtooth", sub: "square", air: 0.5, drive: 0, vol: 0.09 },
  bike: { lo: 80, hi: 240, wave: "square", sub: "sawtooth", air: 0.6, drive: 0.3, vol: 0.07 },
  pod: { lo: 95, hi: 340, wave: "sawtooth", sub: "sawtooth", air: 0.8, drive: 0.6, vol: 0.08 },
  ship: { lo: 38, hi: 95, wave: "sawtooth", sub: "triangle", air: 0.9, drive: 0, vol: 0.1 },
};
export interface Engine { set(speed: number, throttle?: number): void; stop(): void }
export function engine(kind: EngineKind): Engine {
  const c = audible() ? audioContext() : null;
  const bus = busOf("sfx");
  if (!c || !bus) return { set() {}, stop() {} };
  const e = ENGINES[kind];
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.value = 0.0001;
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(e.vol, t + 0.4);
  out.connect(bus);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 500;
  lp.Q.value = 1.2;
  let tail: AudioNode = lp;
  if (e.drive) {
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * (1 + e.drive * 6)) / Math.tanh(1 + e.drive * 6);
    }
    shaper.curve = curve;
    lp.connect(shaper);
    tail = shaper;
  }
  tail.connect(out);
  const oscs = [c.createOscillator(), c.createOscillator(), c.createOscillator()];
  oscs[0].type = e.wave;
  oscs[1].type = e.wave;
  oscs[1].detune.value = kind === "pod" ? 35 : 8;
  oscs[2].type = e.sub;
  for (const o of oscs) {
    o.connect(lp);
    o.start(t);
  }
  const air = c.createBufferSource();
  air.buffer = noiseBuf(c);
  air.loop = true;
  const airF = c.createBiquadFilter();
  airF.type = "bandpass";
  airF.Q.value = 0.6;
  const airG = c.createGain();
  airG.gain.value = 0;
  air.connect(airF).connect(airG).connect(out);
  air.start(t);
  let stopped = false;
  const engineSet = (speed: number, throttle = 1) => {
    if (stopped) return;
    const s = Math.max(0, Math.min(1, speed));
    const th = Math.max(0, Math.min(1, throttle));
    const now = c.currentTime;
    const f = e.lo + (e.hi - e.lo) * s + 12 * th;
    oscs[0].frequency.setTargetAtTime(f, now, 0.08);
    oscs[1].frequency.setTargetAtTime(f * 1.01, now, 0.08);
    oscs[2].frequency.setTargetAtTime(f / 2, now, 0.08);
    lp.frequency.setTargetAtTime(350 + 2600 * (0.3 * s + 0.7 * th * s) + 300 * th, now, 0.1);
    airF.frequency.setTargetAtTime(600 + 3000 * s, now, 0.15);
    airG.gain.setTargetAtTime(e.air * 0.5 * s * s, now, 0.15);
    out.gain.setTargetAtTime(e.vol * (0.45 + 0.55 * Math.max(th, s * 0.6)), now, 0.1);
  };
  engineSet(0, 0);
  return {
    set: engineSet,
    stop() {
      if (stopped) return;
      stopped = true;
      const now = c.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0.0001, now, 0.25);
      for (const o of oscs) o.stop(now + 1.5);
      air.stop(now + 1.5);
      setTimeout(() => out.disconnect(), 1800);
    },
  };
}

// Clicks for the interface: a soft tap on any button, tab or link the player presses (lib/audio "clicks" turns them off)
let uiInstalled = false;
export function installUiSounds() {
  if (uiInstalled || typeof document === "undefined") return;
  uiInstalled = true;
  document.addEventListener("pointerdown", (ev) => {
    if (!getLevels().clicks) return;
    const el = (ev.target as Element | null)?.closest?.("button, [role=tab], [role=menuitem], [role=option], a[href], select, input[type=checkbox], input[type=radio], summary");
    if (el && !(el as HTMLButtonElement).disabled) sfx.click();
  }, { capture: true, passive: true });
}

// Renders an effect on an offline context (previews and the level checks)
export async function renderSfx(name: SfxName, args: unknown[] = [], seconds = 2.5, rate = 44100): Promise<AudioBuffer> {
  const c = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  const mix = mixerOn(c);
  (MAKERS[name] as (c: C, d: Dest, t: number, ...a: unknown[]) => void)(c, destOf(c, mix.sfx, LEVEL[name] ?? 1), 0.02, ...args);
  return c.startRendering();
}
export const SFX_NAMES = Object.keys(MAKERS) as SfxName[];
