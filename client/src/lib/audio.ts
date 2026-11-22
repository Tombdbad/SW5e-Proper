// The game's one audio context and its mixer (2026-11-22; the user: "work on sound effects and background music"). Music, sound effects and
// voices each have a bus with its own volume; they meet in the master bus, which ends in a soft limiter so that a burst of effects over the
// music never clips. One context for the whole page (a phone allows only a few), made on first use and resumed on the first touch or key,
// as browsers only let a page make sound after the player has touched it. The levels are kept in localStorage "sw5e.audio"; the old
// "sw5e.mute" = "1" still mutes. Everything here also works on an OfflineAudioContext (see `reverbOf`), so music can be rendered to a file.
export type BusName = "music" | "sfx" | "voice";
export interface Levels { master: number; music: number; sfx: number; voice: number; muted: boolean; clicks: boolean }

const KEY = "sw5e.audio";
export const DEFAULT_LEVELS: Levels = { master: 0.9, music: 0.5, sfx: 0.8, voice: 1, muted: false, clicks: true };

let levels: Levels = load();
let ctx: AudioContext | null = null;
let buses: Record<BusName | "master", GainNode> | null = null;
const listeners = new Set<(l: Levels) => void>();

// An automated browser (the e2e play-through: navigator.webdriver) starts muted unless levels were saved: nobody listens there, and the
// synthesis would only slow a long test on software rendering
function load(): Levels {
  const robot = typeof navigator !== "undefined" && navigator.webdriver === true;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Levels> | null;
    const old = localStorage.getItem("sw5e.mute") === "1";
    return { ...DEFAULT_LEVELS, ...(robot ? { muted: true } : {}), ...(saved ?? {}), ...(old && !saved ? { muted: true } : {}) };
  } catch {
    return { ...DEFAULT_LEVELS, muted: robot };
  }
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
// A slider's 0..1 as a gain: a square law, so the low half of the slider is not all "loud"
const gainOf = (v: number) => clamp01(v) ** 2;

export const getLevels = (): Levels => levels;
export function setLevels(change: Partial<Levels>) {
  levels = { ...levels, ...change };
  for (const k of ["master", "music", "sfx", "voice"] as const) levels[k] = clamp01(levels[k]);
  try {
    localStorage.setItem(KEY, JSON.stringify(levels));
    localStorage.setItem("sw5e.mute", levels.muted ? "1" : "0");
  } catch { /* private mode */ }
  apply();
  for (const f of listeners) f(levels);
}
export function onLevels(f: (l: Levels) => void): () => void {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

function apply() {
  if (!ctx || !buses) return;
  const t = ctx.currentTime;
  const set = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t, 0.05);
  set(buses.master, levels.muted ? 0 : gainOf(levels.master));
  set(buses.music, gainOf(levels.music));
  set(buses.sfx, gainOf(levels.sfx));
  set(buses.voice, gainOf(levels.voice));
}

// The master chain on any context: master gain -> a gentle limiter -> the speakers
export function mixerOn(c: BaseAudioContext): Record<BusName | "master", GainNode> {
  const master = c.createGain();
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter).connect(c.destination);
  const bus = () => {
    const g = c.createGain();
    g.connect(master);
    return g;
  };
  return { master, music: bus(), sfx: bus(), voice: bus() };
}

// The context is made at the player's first touch or key (inside that event, as iOS wants; before it a page may not make sound, and a
// context made earlier only earns a console warning), and resumed on every touch after it
let touched = false;
if (typeof document !== "undefined") {
  const go = () => {
    touched = true;
    const c = audioContext();
    if (c && c.state !== "running") void c.resume().catch(() => {});
  };
  for (const ev of ["pointerdown", "keydown", "touchend"]) document.addEventListener(ev, go, { capture: true, passive: true });
}
export function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    // (muted, none is made: no audio thread runs on a page that makes no sound; unmuting from the Sound tab is a touch, which makes it)
    if (!touched || levels.muted) return null;
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    // At 32 kHz (16 kHz of bandwidth, all the game's sounds need): a third less work than a phone's own 48 kHz for every voice, effect
    // and note; the browser resamples to the speakers. A browser that refuses the rate gets its own.
    try {
      ctx = new C({ latencyHint: "interactive", sampleRate: 32000 });
    } catch {
      ctx = new C({ latencyHint: "interactive" });
    }
    buses = mixerOn(ctx);
    apply();
    pauseWhenHidden();
  }
  if (ctx.state === "suspended" && !document.hidden) void ctx.resume().catch(() => {});
  return ctx;
}
// The bus to connect a sound to (null before there is a context)
export function busOf(name: BusName): AudioNode | null {
  return audioContext() && buses ? buses[name] : null;
}
// Whether sound can be heard now: a context that runs and is not muted (callers skip making sounds otherwise)
export const audible = () => !levels.muted && !!audioContext() && ctx!.state === "running";

// A hidden page has nobody listening: the context sleeps (the phone's battery) and wakes when the page is shown again
function pauseWhenHidden() {
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => {});
    else void ctx.resume().catch(() => {});
  });
}
// Called by any control the player touches (the first touch must resume the context in the same event on iOS)
export function wake() {
  audioContext();
}

// A stereo room made from noise that dies away (a plate-like reverb for music and big effects); one per context and length
const reverbs = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
export function reverbOf(c: BaseAudioContext, seconds = 2.4, decay = 3.2, bright = 0.55): AudioBuffer {
  let byKey = reverbs.get(c);
  if (!byKey) reverbs.set(c, (byKey = new Map()));
  const key = `${seconds}|${decay}|${bright}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const n = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, n, c.sampleRate);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      // darker as it dies (a one-pole low-pass whose cut-off falls), with a short pre-delay
      const a = bright * (1 - 0.8 * t);
      lp = lp + a * (rnd() - lp);
      d[i] = i < c.sampleRate * 0.012 ? 0 : lp * Math.pow(1 - t, decay);
    }
  }
  byKey.set(key, buf);
  return buf;
}
// For test scripts and checks in the browser: the levels and whether the context runs
if (typeof window !== "undefined") (window as unknown as { __audio?: object }).__audio = { levels: getLevels, state: () => ctx?.state ?? "none", set: setLevels };
