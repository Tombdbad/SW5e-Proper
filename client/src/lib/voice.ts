// Voices for the spoken replies (2026-10-30; the user: "voices to be unique, and persist to the character that they are generated for, with a
// cache of emotional tones (gender/rough/accented/polished/masked/etc) and accompanying non verbal sounds (chuckle, breath, groan, wheeze,
// droid bleeps, stutter, hesitation, etc.)"). The model writes only what is said (server/dialogue.ts, with sound cues in square brackets);
// the server's speech engine speaks it (server/speech.ts); this gives each speaker their voice and plays it.
//  - A speaker's voice (`voiceOf`) is drawn from their id, species, role and kind, so the same person always sounds the same, on every
//    screen, with nothing stored: which of the engine's voices, how high (played faster or slower, the speech made slower or faster to
//    match, so only the pitch moves), how quick, its timbre (low, middle and high shelves, a gravel of distortion), and what it is heard
//    through: a droid's ring-modulated metal, a trooper's helmet, a mask or respirator (with its breath), a comlink. Astromechs and BB units
//    speak in bleeps, Wookiees in growls, Jawas and Ewoks in their own tongue (the subtitles say what they mean).
//  - Each reply's mood (`toneOf`: excited, nervous, weary, amused, hostile) bends the voice a little for that reply.
//  - The cues ([sigh], [chuckle], [beep], [static] ...) are played where they stand: from a sound bank made in SeptaBee if the game has one
//    (client/public/audio/voice/manifest.json; see .claude/skills/septabee/SKILL.md), else made here on the spot (noise, oscillators).
// Pure parts (`voiceOf`, `partsOf`, `toneOf`, `gibberish`) are tested in tests/world/voice.test.ts; the rest needs a browser.

export interface VoiceSpeaker { id: string; name: string; species?: string; role?: string; kind?: string; gender?: string; creature?: string; disposition?: string }
export type VoiceFx = "droid" | "metal" | "helmet" | "comms" | "masked" | "breath";
// How the words come out: spoken in Basic, an astromech's bleeps, a Wookiee's growls, a small folk's chatter
export type Tongue = "basic" | "bleeps" | "growls" | "chatter";
export interface VoiceProfile {
  v: 1;
  // The engine's voice ("George", "Hazel", "Susan"; "piper:123" for a Piper speaker; "" the browser's own)
  voice: string;
  // Played this much faster (higher) or slower (lower); the speech is made at rate / pitch so its pace stays `rate`
  pitch: number;
  rate: number;
  // The engine's own pitch shift (percent), for a little more
  shift: number;
  // Shelves (dB) and a band in the middle (Hz, dB), and the gravel (0 smooth .. 1 rough)
  low: number;
  mid: [number, number];
  high: number;
  rough: number;
  fx: VoiceFx[];
  tongue: Tongue;
  // Which bank of sounds its cues come from
  bank: "human" | "droid" | "wookiee" | "small" | "large";
  // What it is, in words (for a voice picker or a test): gender, rough, polished, masked, droid, ...
  tags: string[];
}

// ---- Pure: the voice of a speaker -------------------------------------------------------------------------------------------------
const hashOf = (text: string) => Array.from(text).reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
const rngOf = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const has = (re: RegExp, ...texts: (string | undefined)[]) => texts.some((t) => !!t && re.test(t));
// The engine's voices by how they sound (Windows' OneCore voices on this PC; others fall in by name)
const LOW_VOICES = /george|david|mark|guy|ryan|james|male/i;

export function voiceOf(s: VoiceSpeaker, engine: { voices: string[]; speakers?: number } = { voices: [] }): VoiceProfile {
  const r = rngOf(hashOf(`${s.id}|${s.name}`));
  const all = `${s.name} ${s.role ?? ""} ${s.creature ?? ""} ${s.species ?? ""}`;
  const droid = s.kind === "droid" || has(/droid|\bunit\b|\b[A-Z]\d-|\bIG-|\bHK-|\bR[2-9]\b|\bBB-|3P0|astromech|gonk|series\b/i, s.name, s.role, s.creature);
  const astromech = droid && has(/astromech|\bR[2-9]|\bBB|\bC1\b|mouse|gonk|power droid|pit droid|treadwell|\bunit\b/i, all) && !has(/protocol|3P0|000|L0M|battle|\bB[12]\b|IG|HK|KX|security|tactical/i, all);
  const species = (s.species ?? "").toLowerCase();
  const tags: string[] = [];
  const fx: VoiceFx[] = [];
  let tongue: Tongue = "basic";
  let bank: VoiceProfile["bank"] = "human";
  // Who speaks low or high: a choice of the engine's voices (by gender where it is known, else by the seed) and a pitch about it
  const gender = (s.gender ?? "").toLowerCase();
  const low = /^(m|male|man|masc)/.test(gender) ? true : /^(f|female|woman|fem)/.test(gender) ? false : r() < 0.5;
  tags.push(low ? "low voice" : "high voice");
  let pitch = low ? 0.88 + r() * 0.18 : 0.94 + r() * 0.2;
  let rate = 0.92 + r() * 0.16;
  let shift = Math.round((r() - 0.5) * 16);
  let lowShelf = (r() - 0.5) * 6;
  let highShelf = (r() - 0.5) * 6;
  let mid: [number, number] = [700 + r() * 1600, (r() - 0.5) * 8];
  let rough = r() * 0.15;
  // Size and species
  if (has(/wookiee/i, species, s.name)) { tongue = "growls"; bank = "wookiee"; pitch = 0.75; tags.push("wookiee"); }
  else if (has(/jawa|ewok|ugnaught|chadra|kowakian|jawas/i, species, s.name)) { tongue = has(/jawa|ewok/i, species, s.name) ? "chatter" : "basic"; bank = "small"; pitch = 1.32 + r() * 0.12; rate *= 1.1; tags.push("small"); }
  else if (has(/hutt/i, species, s.name)) { bank = "large"; pitch = 0.6; rate = 0.84; rough = 0.45; lowShelf = 7; tags.push("large", "rough"); }
  else if (has(/besalisk|gamorrean|herglic|trandoshan|ithorian|dug|houk|whiphid|abyssin/i, species)) { bank = "large"; pitch *= 0.84; rough += 0.25; lowShelf += 3; tags.push("large"); }
  else if (has(/yoda|chiss|twi'?lek|togruta|mirialan|zeltron|nautolan/i, species)) mid = [mid[0], mid[1] + 2];
  if (has(/trandoshan|rodian|kel dor|gand|aqualish|duros/i, species)) { highShelf += 3; tags.push("accented"); }
  // Droids: an astromech bleeps; a protocol droid is polished metal; battle droids and assassins are droid-ringed
  if (droid) {
    bank = "droid";
    tags.push("droid");
    if (astromech) { tongue = "bleeps"; tags.push("astromech"); }
    else if (has(/protocol|3P0|000|L0M|RX/i, all)) { fx.push("metal"); pitch = 1.08; rate = 1.06; rough = 0; tags.push("polished"); }
    else if (has(/\bB1\b|battle droid|B1 series/i, all)) { fx.push("droid", "metal"); pitch = 1.3; mid = [1800, 9]; tags.push("nasal"); }
    else { fx.push("droid", "metal"); pitch = 0.82; rough = 0.2; lowShelf = 3; }
  }
  // Helmets, masks and respirators; a gravel to some trades, a polish to others
  if (!droid && has(/trooper|clone|mandalorian|bounty hunter|death trooper|purge|helmet|pilot|guard, royal|royal guard/i, s.name, s.role)) { fx.push("helmet"); tags.push("helmeted"); }
  if (!droid && has(/inquisitor|sith lord|kel dor|gand|respirator|mask|vader/i, s.name, s.role, species)) { fx.push("masked", "breath"); tags.push("masked"); }
  if (!droid && has(/mercenary|pirate|smuggler|thug|gang|swoop|bounty|criminal|enforcer|scoundrel|brute|tusken/i, s.role, s.name)) { rough += 0.3; tags.push("rough"); }
  if (!droid && has(/noble|officer|senator|diplomat|isb|moff|admiral|governor|jedi|aristocrat|merchant prince|scholar/i, s.role, s.name)) { rough = Math.max(0, rough - 0.2); rate *= 0.97; highShelf += 1.5; tags.push("polished"); }
  // The engine's voice: a low or high one of those it has, picked by the seed (a Piper model's speakers, one each)
  let voice = "";
  if (engine.speakers && engine.speakers > 1) voice = `piper:${Math.floor(r() * engine.speakers)}`;
  else if (engine.voices.length) {
    const fits = engine.voices.filter((v) => LOW_VOICES.test(v) === low);
    const pool = fits.length ? fits : engine.voices;
    voice = pool[Math.floor(r() * pool.length)];
    // (a high voice played low, or a low one high, when the engine has only the one kind)
    if (!fits.length) pitch *= low ? 0.82 : 1.18;
  }
  return { v: 1, voice, pitch: +pitch.toFixed(3), rate: +rate.toFixed(3), shift, low: +lowShelf.toFixed(1), mid: [Math.round(mid[0]), +mid[1].toFixed(1)], high: +highShelf.toFixed(1), rough: +Math.min(0.9, rough).toFixed(2), fx, tongue, bank, tags };
}

// ---- Pure: a reply in the order it is heard: runs of speech (a sentence or two each, so the first starts soon) and the cues between ---
export type Part = { say: string } | { cue: string };
export function partsOf(text: string): Part[] {
  const out: Part[] = [];
  for (const piece of text.split(/(\[[a-z]+\])/)) {
    const cue = /^\[([a-z]+)\]$/.exec(piece);
    if (cue) { out.push({ cue: cue[1] }); continue; }
    const sentences = piece.replace(/\s+/g, " ").match(/[^.!?]+[.!?]*\s*/g) ?? [];
    let run = "";
    for (const s of sentences) {
      run += s;
      if (run.length > 60) { out.push({ say: run.trim() }); run = ""; }
    }
    if (run.trim()) out.push({ say: run.trim() });
  }
  return out.filter((p) => !("say" in p) || /[a-z0-9]/i.test(p.say));
}

// ---- Pure: the mood of a reply, laid over the voice for it (pace, pitch, loudness, gravel) -------------------------------------------
export interface Tone { mood: "calm" | "excited" | "nervous" | "weary" | "amused" | "hostile"; rate: number; pitch: number; gain: number; drive: number }
export function toneOf(text: string, disposition = ""): Tone {
  const words = Math.max(1, text.split(/\s+/).length);
  const bangs = (text.match(/!/g) ?? []).length;
  if (/\b(\w+)-\1\w*|\.\.\.|\buh\b|\bum\b/i.test(text) && /\[(gasp|breath)\]|\b(please|sorry|don't|scared|afraid)\b/i.test(text)) return { mood: "nervous", rate: 0.93, pitch: 1.04, gain: 0.9, drive: 0 };
  if (/\[(sigh|groan|wheeze|cough)\]/.test(text)) return { mood: "weary", rate: 0.9, pitch: 0.97, gain: 0.9, drive: 0 };
  if (/\[(laugh|chuckle)\]/.test(text)) return { mood: "amused", rate: 1.03, pitch: 1.03, gain: 1, drive: 0 };
  if (disposition === "hostile" || /\[growl\]/.test(text)) return { mood: "hostile", rate: 1.03, pitch: 0.97, gain: 1.1, drive: 0.15 };
  if (bangs / words > 0.04) return { mood: "excited", rate: 1.07, pitch: 1.04, gain: 1.1, drive: 0.05 };
  return { mood: "calm", rate: 1, pitch: 1, gain: 1, drive: 0 };
}

// ---- Pure: a tongue the party does not speak, from the words meant (the same words give the same sounds) ------------------------------
const CHATTER = ["u", "ti", "ni", "ee", "too", "ta", "ka", "wa", "yo", "ma", "kee", "chu", "mo", "ba", "ri"];
export function gibberish(text: string, seed = 0): string {
  return text.split(/([.!?,]+)/).map((chunk) => {
    if (/^[.!?,]+$/.test(chunk)) return chunk;
    const words = chunk.trim().split(/\s+/).filter(Boolean);
    return words.map((w) => {
      const r = rngOf(hashOf(w.toLowerCase()) ^ seed);
      const n = Math.max(1, Math.min(3, Math.round(w.length / 3)));
      return Array.from({ length: n }, () => CHATTER[Math.floor(r() * CHATTER.length)]).join("");
    }).join(" ");
  }).join("").trim();
}

// ---- In the browser: playing a reply -------------------------------------------------------------------------------------------------
let ctx: AudioContext | null = null;
const audio = () => {
  if (typeof window === "undefined") return null;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  ctx ??= new C();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};
let noise: AudioBuffer | null = null;
const noiseOf = (c: AudioContext) => {
  if (noise) return noise;
  noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
};

// The sound bank made in SeptaBee, if the game has one: client/public/audio/voice/manifest.json lists each bank's takes of each cue
// ("droid/beep": ["droid/beep-1.ogg", ...]) and impulse responses ("helmet": "ir/helmet.wav") for the helmet, mask and comlink
interface Manifest { nonverbal?: Record<string, string[]>; ir?: Record<string, string> }
let manifest: Promise<Manifest> | null = null;
const manifestNow = () => (manifest ??= fetch("/audio/voice/manifest.json").then((r): Promise<Manifest> | Manifest => (r.ok ? r.json() : {})).catch((): Manifest => ({})));
const buffers = new Map<string, Promise<AudioBuffer | null>>();
function bufferOf(c: AudioContext, url: string, init?: RequestInit): Promise<AudioBuffer | null> {
  const key = `${url}|${init?.body ?? ""}`;
  let b = buffers.get(key);
  if (!b) {
    b = fetch(url, init).then((r) => (r.ok ? r.arrayBuffer() : null)).then((a) => (a ? c.decodeAudioData(a) : null)).catch(() => null);
    buffers.set(key, b);
    // (the newest few hundred lines are kept decoded; older ones are fetched again, from the server's disk cache)
    if (buffers.size > 300) buffers.delete(buffers.keys().next().value!);
  }
  return b;
}

// What the speech engine on the server is (none: the browser speaks, plainly)
let engine: Promise<{ engine: string; voices: string[]; speakers?: number }> | null = null;
export const speechEngine = () => (engine ??= fetch("/api/speech/status").then((r) => r.json()).catch(() => ({ engine: "none", voices: [] })));

// The chain a voice is heard through: gravel, the three bands, then droid ring, metal, helmet, mask, comlink, and the loudness
function chainOf(c: AudioContext, p: VoiceProfile, tone: Tone, comms: boolean, irs: Record<string, AudioBuffer | null>): { input: AudioNode; out: GainNode; stop: () => void } {
  const nodes: AudioScheduledSourceNode[] = [];
  const input = c.createGain();
  let at: AudioNode = input;
  const link = (n: AudioNode) => { at.connect(n); at = n; return n; };
  const drive = p.rough + tone.drive;
  if (drive > 0.02) {
    const shaper = c.createWaveShaper();
    const k = 1 + drive * 30;
    shaper.curve = Float32Array.from({ length: 1024 }, (_, i) => { const x = (i / 1023) * 2 - 1; return Math.tanh(k * x) / Math.tanh(k); });
    link(shaper);
  }
  const band = (type: BiquadFilterType, f: number, g: number, q = 0.8) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.gain.value = g; b.Q.value = q; return link(b); };
  band("lowshelf", 220, p.low);
  band("peaking", p.mid[0], p.mid[1], 1.2);
  band("highshelf", 3200, p.high);
  const wet = (node: AudioNode, mix: number) => {
    // a split: dry on, the effect beside it, summed
    const sum = c.createGain();
    const dry = c.createGain();
    const fxg = c.createGain();
    dry.gain.value = 1 - mix;
    fxg.gain.value = mix;
    at.connect(dry).connect(sum);
    at.connect(node);
    node.connect(fxg).connect(sum);
    at = sum;
  };
  if (p.fx.includes("droid")) {
    const ring = c.createGain();
    ring.gain.value = 0;
    const osc = c.createOscillator();
    osc.frequency.value = 40 + (p.pitch * 37) % 50;
    osc.connect(ring.gain);
    osc.start();
    nodes.push(osc);
    wet(ring, 0.45);
  }
  if (p.fx.includes("metal")) {
    const comb = c.createDelay(0.05);
    comb.delayTime.value = 0.0045;
    const fb = c.createGain();
    fb.gain.value = 0.45;
    comb.connect(fb).connect(comb);
    wet(comb, 0.35);
  }
  if (p.fx.includes("helmet") || p.fx.includes("masked")) {
    const conv = c.createConvolver();
    conv.buffer = irs[p.fx.includes("helmet") ? "helmet" : "mask"] ?? roomIr(c, p.fx.includes("helmet") ? 0.06 : 0.04);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = p.fx.includes("helmet") ? 1400 : 900;
    bp.Q.value = 0.7;
    conv.connect(bp);
    at.connect(conv);
    const sum = c.createGain();
    const dry = c.createGain();
    dry.gain.value = 0.55;
    at.connect(dry).connect(sum);
    bp.connect(sum);
    at = sum;
  }
  if (comms) {
    band("highpass", 450, 0, 0.7);
    band("lowpass", 3100, 0, 0.7);
    const crush = c.createWaveShaper();
    crush.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.round(((i / 1023) * 2 - 1) * 10) / 10);
    link(crush);
    if (irs.comms) { const conv = c.createConvolver(); conv.buffer = irs.comms; link(conv); }
  }
  const out = c.createGain();
  out.gain.value = 0.9 * tone.gain;
  at.connect(out).connect(c.destination);
  return { input, out, stop: () => nodes.forEach((n) => { try { n.stop(); } catch { /* stopped */ } }) };
}
// A small space's echo, made on the spot (a SeptaBee-rendered one is used instead when the manifest lists it)
function roomIr(c: AudioContext, seconds: number): AudioBuffer {
  const b = c.createBuffer(2, Math.floor(c.sampleRate * seconds), c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3) * (i % 37 === 0 ? 3 : 1);
  }
  return b;
}

// A cue made on the spot: noise through a band for breath and sighs, a buzz for groans and growls, tones for droids. Returns its length (s)
function synthCue(c: AudioContext, dest: AudioNode, cue: string, p: VoiceProfile, at: number, seed: number): number {
  const r = rngOf(seed);
  const env = (g: GainNode, t: number, peak: number, attack: number, hold: number, release: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return attack + hold + release;
  };
  const hiss = (t: number, f: number, q: number, peak: number, a: number, h: number, rel: number, to?: number) => {
    const src = c.createBufferSource();
    src.buffer = noiseOf(c);
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(f, t);
    if (to) bp.frequency.linearRampToValueAtTime(to, t + a + h + rel);
    bp.Q.value = q;
    const g = c.createGain();
    const len = env(g, t, peak, a, h, rel);
    src.connect(bp).connect(g).connect(dest);
    src.start(t);
    src.stop(t + len + 0.05);
    return len;
  };
  const buzz = (t: number, type: OscillatorType, f0: number, f1: number, cut: number, peak: number, a: number, h: number, rel: number, am = 0) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f1, t + a + h + rel);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cut;
    const g = c.createGain();
    const len = env(g, t, peak, a, h, rel);
    o.connect(lp).connect(g).connect(dest);
    if (am) {
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = am;
      depth.gain.value = peak * 0.6;
      lfo.connect(depth).connect(g.gain);
      lfo.start(t);
      lfo.stop(t + len);
    }
    o.start(t);
    o.stop(t + len + 0.05);
    return len;
  };
  const tone = (t: number, f0: number, f1: number, len: number, type: OscillatorType = "square", peak = 0.12) => buzz(t, type, f0, f1, 6000, peak, 0.005, len - 0.03, 0.025);
  const base = p.pitch;
  switch (cue) {
    case "breath": return hiss(at, 1100, 0.8, 0.22, 0.3, 0.15, 0.35);
    case "sigh": return hiss(at, 900, 1, 0.3, 0.12, 0.25, 0.6, 380);
    case "gasp": return hiss(at, 1700, 1.1, 0.3, 0.05, 0.06, 0.12);
    case "wheeze": return hiss(at, 2600, 6, 0.25, 0.08, 0.2, 0.15) + 0.05 + hiss(at + 0.5, 2400, 6, 0.22, 0.08, 0.2, 0.2);
    case "cough": return hiss(at, 1300, 0.7, 0.45, 0.01, 0.03, 0.12) + 0.12 + hiss(at + 0.28, 1200, 0.7, 0.35, 0.01, 0.02, 0.14);
    case "groan": return buzz(at, "sawtooth", 105 * base, 85 * base, 700, 0.25, 0.12, 0.35, 0.35);
    case "growl": return Math.max(buzz(at, "sawtooth", 62 * base, 55 * base, 900, 0.3, 0.08, 0.4, 0.25, 28), hiss(at, 500, 0.8, 0.12, 0.08, 0.4, 0.25));
    case "hmm": return buzz(at, "triangle", 150 * base, 132 * base, 600, 0.22, 0.05, 0.3, 0.15);
    case "whistle": return buzz(at, "sine", 1200, 2300, 8000, 0.12, 0.05, 0.15, 0.15);
    case "static": {
      let len = hiss(at, 2200, 0.5, 0.15, 0.01, 0.3, 0.1);
      for (let i = 0; i < 6; i++) len = Math.max(len, hiss(at + r() * 0.35, 4000, 2, 0.4, 0.002, 0.004, 0.01));
      return len;
    }
    case "beep": {
      let t = at;
      const n = 2 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) t += tone(t, 900 + r() * 2200, 900 + r() * 2200, 0.05 + r() * 0.1, r() < 0.5 ? "square" : "sine") + 0.02 + r() * 0.04;
      return t - at;
    }
    case "chuckle": case "laugh": {
      let t = at;
      // (a breathy "heh": noise and a little voice under it, a beat apart)
      for (let i = 0; i < (cue === "laugh" ? 4 : 2); i++) t += Math.max(hiss(t, 1300, 1.2, 0.3, 0.01, 0.04, 0.08), buzz(t, "sawtooth", 180 * base, 160 * base, 1500, 0.08, 0.01, 0.04, 0.06)) + 0.06;
      return t - at;
    }
    default: return 0;
  }
}

// An astromech's bleeps for a run of speech (as long as the words would take), or a Wookiee's growls
function tongueOf(c: AudioContext, dest: AudioNode, p: VoiceProfile, text: string, at: number): number {
  const r = rngOf(hashOf(text) ^ hashOf(p.voice + p.pitch));
  let t = at;
  if (p.tongue === "bleeps") {
    const n = Math.max(3, Math.min(16, Math.round(text.length / 6)));
    for (let i = 0; i < n; i++) t += synthCue(c, dest, r() < 0.15 ? "whistle" : "beep", p, t, Math.floor(r() * 1e9)) + 0.04 + r() * 0.08;
    return t - at;
  }
  const growls = Math.max(1, Math.min(5, Math.round(text.split(/\s+/).length / 5)));
  for (let i = 0; i < growls; i++) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    const len = 0.35 + r() * 0.5;
    const f = (130 + r() * 60) * p.pitch;
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * (1.4 + r() * 0.4), t + len * 0.4);
    o.frequency.linearRampToValueAtTime(f * 0.8, t + len);
    const f1 = c.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 650 + r() * 300;
    f1.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f1).connect(g).connect(dest);
    o.start(t);
    o.stop(t + len + 0.05);
    t += len + 0.08 + r() * 0.15;
  }
  return t - at;
}

// What a cue a person voices is said as (laughter is the voice's own, not a made noise)
const SPOKEN_CUES: Record<string, string> = { chuckle: "Heh heh.", laugh: "Ha ha ha!", hmm: "Hmm." };

let playing: { stop: () => void } | null = null;
export const stopSpeaking = () => { playing?.stop(); playing = null; if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); };

// Speaks a reply in a speaker's voice (and `comms`: over a comlink). Resolves when it has been heard, or was stopped
export async function speak(text: string, speaker: VoiceSpeaker, o: { comms?: boolean } = {}): Promise<void> {
  stopSpeaking();
  const c = audio();
  const eng = await speechEngine();
  const p = voiceOf(speaker, eng.engine === "none" ? { voices: [] } : eng);
  const tone = toneOf(text, speaker.disposition);
  const parts = partsOf(text);
  let stopped = false;
  const stopNow = { stop: () => { stopped = true; } };
  playing = stopNow;
  // No engine on the server and the person speaks Basic: the browser's own voice, its pitch and pace (nothing can be laid over it)
  if (eng.engine === "none" && p.tongue === "basic" && !c) return browserSpeak(parts, p, tone, () => stopped);
  if (!c) return;
  const m = await manifestNow();
  const irs: Record<string, AudioBuffer | null> = {};
  for (const [k, url] of Object.entries(m.ir ?? {})) irs[k] = await bufferOf(c, `/audio/voice/${url}`);
  const chain = chainOf(c, p, tone, !!o.comms, irs);
  const sources: AudioScheduledSourceNode[] = [];
  stopNow.stop = () => { stopped = true; sources.forEach((s) => { try { s.stop(); } catch { /* done */ } }); chain.out.gain.setTargetAtTime(0, c.currentTime, 0.02); setTimeout(chain.stop, 300); };
  const speechOf = (say: string) => {
    const words = p.tongue === "chatter" ? gibberish(say, hashOf(speaker.id)) : say;
    const playback = p.pitch * tone.pitch;
    return bufferOf(c, "/api/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: words, voice: { name: p.voice, rate: (p.rate * tone.rate) / playback, pitch: p.shift } }) });
  };
  // Each run of speech is asked for one ahead of where it is heard
  const ahead = parts.map((part) => ("say" in part && (p.tongue === "basic" || p.tongue === "chatter") ? speechOf(part.say) : "cue" in part && SPOKEN_CUES[part.cue] && p.tongue === "basic" && p.bank !== "droid" ? speechOf(SPOKEN_CUES[part.cue]) : null));
  let t = c.currentTime + 0.05;
  if (o.comms) t += synthCue(c, chain.input, "static", p, t, 7) * 0.5;
  for (let i = 0; i < parts.length && !stopped; i++) {
    const part = parts[i];
    const pending = ahead[i];
    if (pending) {
      const buf = await pending;
      if (stopped) break;
      if (!buf) continue;
      t = Math.max(t, c.currentTime + 0.02);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = p.pitch * tone.pitch;
      src.connect(chain.input);
      src.start(t);
      sources.push(src);
      t += buf.duration / src.playbackRate.value + 0.12;
      // (a masked voice breathes between its sentences)
      if (p.fx.includes("breath") && i < parts.length - 1) t += synthCue(c, chain.input, "breath", p, t, i) + 0.05;
    } else if ("say" in part) {
      t += tongueOf(c, chain.input, p, part.say, Math.max(t, c.currentTime + 0.02)) + 0.15;
    } else {
      const takes = m.nonverbal?.[`${p.bank}/${part.cue}`] ?? m.nonverbal?.[`human/${part.cue}`];
      const take = takes?.length ? await bufferOf(c, `/audio/voice/${takes[hashOf(speaker.id + i) % takes.length]}`) : null;
      if (take) {
        const src = c.createBufferSource();
        src.buffer = take;
        src.playbackRate.value = p.bank === "droid" ? 1 : p.pitch;
        src.connect(chain.input);
        src.start(Math.max(t, c.currentTime + 0.02));
        sources.push(src);
        t = Math.max(t, c.currentTime + 0.02) + take.duration / src.playbackRate.value + 0.08;
      } else t += synthCue(c, chain.input, part.cue, p, Math.max(t, c.currentTime + 0.02), hashOf(speaker.id) + i) + 0.08;
    }
    // Wait until shortly before this part ends, so a stop is quick and the next is asked in time
    while (!stopped && c.currentTime < t - 0.4) await new Promise((res) => setTimeout(res, 60));
  }
  if (o.comms && !stopped) t += synthCue(c, chain.input, "static", p, t, 9) * 0.5;
  while (!stopped && c.currentTime < t) await new Promise((res) => setTimeout(res, 60));
  if (!stopped) setTimeout(chain.stop, 200);
  if (playing === stopNow) playing = null;
}

// The browser's own speech: a voice of those it has, picked by the speaker's seed, at its pitch and pace; cues are skipped
function browserSpeak(parts: Part[], p: VoiceProfile, tone: Tone, stopped: () => boolean): Promise<void> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve();
  const voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  const voice = voices.length ? voices[hashOf(`${p.voice}${p.pitch}`) % voices.length] : undefined;
  const text = parts.map((x) => ("say" in x ? x.say : SPOKEN_CUES[x.cue] ?? "")).filter(Boolean).join(" ");
  return new Promise((resolve) => {
    if (stopped()) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.pitch = Math.max(0, Math.min(2, p.pitch * tone.pitch));
    u.rate = Math.max(0.5, Math.min(2, p.rate * tone.rate));
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

// The player's choices: voices on or off, the words shown as subtitles or not (kept in this browser)
const flag = (key: string, d: boolean) => { try { const v = localStorage.getItem(key); return v === null ? d : v === "1"; } catch { return d; } };
export const voicePrefs = () => ({ voice: flag("sw5e.voice", true), subtitles: flag("sw5e.subtitles", true) });
export const setVoicePref = (key: "voice" | "subtitles", on: boolean) => { try { localStorage.setItem(`sw5e.${key}`, on ? "1" : "0"); } catch { /* private window */ } };
