// The shooter's sounds (2026-10-29): small synthesized effects, no audio files. A blaster bolt (a falling zap, lower for the other side), a bolt striking
// a wall or a body, a grenade's burst, a saber's swing and its hum when a bolt is turned, a power. The page may only make sound after the player has
// touched it: the first click or key of a fight resumes the context, and until then calls are silent. Muted by localStorage "sw5e.mute" = "1".
let ctx: AudioContext | null = null;
let last: Record<string, number> = {};

const muted = () => {
  try { return localStorage.getItem("sw5e.mute") === "1"; } catch { return false; }
};
function audio(): AudioContext | null {
  if (typeof window === "undefined" || muted()) return null;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  ctx ??= new C();
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx.state === "running" ? ctx : null;
}
// (the same sound is not played more than every so many milliseconds: a hail of bolts is not a wall of noise)
const ready = (key: string, gap: number) => {
  const now = performance.now();
  if (now - (last[key] ?? -1e9) < gap) return false;
  last[key] = now;
  return true;
}

function tone(c: AudioContext, type: OscillatorType, from: number, to: number, seconds: number, volume: number, delay = 0, pan = 0) {
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + seconds);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  let tail: AudioNode = g;
  if (pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    tail = p;
  }
  o.connect(g);
  tail.connect(c.destination);
  o.start(t);
  o.stop(t + seconds + 0.02);
}
function noise(c: AudioContext, seconds: number, volume: number, low = 400, delay = 0) {
  const t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * seconds)), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = low;
  const g = c.createGain();
  g.gain.value = volume;
  src.connect(filter);
  filter.connect(g);
  g.connect(c.destination);
  src.start(t);
}

export const sfx = {
  // `own` is the party's gun (higher and nearer); `pan` places a foe's shot to the left or right of the view
  shot(own: boolean, pan = 0) {
    const c = audio();
    if (!c || !ready(own ? "shot-own" : "shot-foe", own ? 40 : 90)) return;
    tone(c, "sawtooth", own ? 1500 : 900, own ? 260 : 160, 0.14, own ? 0.1 : 0.06, 0, pan);
  },
  hit(kill = false) {
    const c = audio();
    if (!c || !ready("hit", 50)) return;
    tone(c, "square", kill ? 220 : 380, 90, 0.1, 0.07);
    if (kill) noise(c, 0.18, 0.12, 700);
  },
  hurt() {
    const c = audio();
    if (!c || !ready("hurt", 120)) return;
    tone(c, "sine", 150, 60, 0.18, 0.18);
    noise(c, 0.12, 0.1, 500);
  },
  impact() {
    const c = audio();
    if (!c || !ready("impact", 45)) return;
    noise(c, 0.07, 0.06, 2400);
  },
  boom() {
    const c = audio();
    if (!c || !ready("boom", 150)) return;
    noise(c, 0.7, 0.35, 380);
    tone(c, "sine", 110, 35, 0.6, 0.3);
  },
  swing() {
    const c = audio();
    if (!c || !ready("swing", 120)) return;
    tone(c, "sawtooth", 420, 180, 0.26, 0.05);
    tone(c, "sine", 190, 150, 0.3, 0.05);
  },
  deflect() {
    const c = audio();
    if (!c || !ready("deflect", 80)) return;
    tone(c, "square", 1200, 600, 0.12, 0.09);
    tone(c, "sine", 300, 260, 0.2, 0.06);
  },
  power(kind: string) {
    const c = audio();
    if (!c || !ready("power", 200)) return;
    if (kind === "heal") { tone(c, "sine", 300, 700, 0.5, 0.1); return; }
    if (kind === "push" || kind === "pull") { noise(c, 0.35, 0.22, 300); tone(c, "sine", kind === "push" ? 160 : 90, kind === "push" ? 60 : 200, 0.35, 0.18); return; }
    tone(c, "sawtooth", 700, 120, 0.4, 0.09);
    noise(c, 0.35, 0.08, 3000);
  },
  reload() {
    const c = audio();
    if (!c || !ready("reload", 300)) return;
    tone(c, "square", 300, 250, 0.05, 0.05);
    tone(c, "square", 500, 420, 0.05, 0.05, 0.18);
  },
};
