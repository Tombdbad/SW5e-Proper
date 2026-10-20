// Recolouring the downloaded models (2026-10-19). A converted model keeps the colours its pack gave it; the room it stands
// in decides its palette, so that one room (walls, furniture, machines) reads as one place and a workshop, a sickbay and a
// palace do not look alike. Colours are turned by lightness along a three-stop ramp (dark, middle, light), and the saturated
// ones (a hazard stripe, a lamp, a trim) become the palette's accent; the less saturated a colour, the more of the ramp stays in it,
// and a model that is mostly coloured has the accent held back (`holdOf`), so a bunk is not one loud colour. The ramps are in shared/art/tones.json, which
// tools/convert-assets.mjs also reads. Pure but for the geometry it is given: tests/interiors/tones.test.ts.
import * as THREE from "three";
import data from "@shared/art/tones.json";

export type Rgb = [number, number, number];
export interface Tone {
  // Names the palette (and, for one drawn from a wall colour, that colour), so that a recoloured model is made once
  id: string;
  // Dark, middle and light stops, in linear colour
  ramp: [Rgb, Rgb, Rgb];
  accent: Rgb;
}

const toLinear = (hex: string): Rgb => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const raw = data as unknown as Record<string, { ramp: string[]; accent: string }>;

export const TONE_NAMES = Object.keys(raw).filter((n) => !n.startsWith("_")) as string[];
export const TONES: Record<string, Tone> = Object.fromEntries(
  TONE_NAMES.map((n) => [n, { id: n, ramp: raw[n].ramp.map(toLinear) as Tone["ramp"], accent: toLinear(raw[n].accent) }]),
);

// How saturated a colour is (0 grey, 1 a pure hue), in linear colour
export const saturation = ([r, g, b]: Rgb) => {
  const hi = Math.max(r, g, b);
  return hi <= 1e-6 ? 0 : (hi - Math.min(r, g, b)) / hi;
};
const lightness = ([r, g, b]: Rgb) => Math.min(1, 0.2126 * r + 0.7152 * g + 0.0722 * b);
// Below SATURATED a colour is a material and follows the ramp; from FULL up (hazard stripes, lamps, crystals) it is the accent;
// between, the two are mixed (wood, a blanket: coloured, but not a signal), so the parts of a bed or a table still differ
const SATURATED = 0.5;
const FULL = 0.75;

// How much of the accent a colour takes (0 none, 1 all of it)
export function accentShare(rgb: Rgb): number {
  const x = Math.min(1, Math.max(0, (saturation(rgb) - SATURATED) / (FULL - SATURATED)));
  return x * x * (3 - 2 * x);
}

// The colour a model colour becomes in a tone. `hold` (0..1) scales the accent down for a model that is mostly coloured
export function toned(tone: Tone, rgb: Rgb, hold = 1): Rgb {
  const l = lightness(rgb);
  const t = Math.min(1, l * 1.6);
  const m = accentShare(rgb) * hold;
  // A coloured material (wood, a blanket) sits lower in the ramp than a grey as light as it, so that it does not turn to paper
  const s = t * (1 - 0.45 * Math.min(1, Math.max(0, (saturation(rgb) - 0.35) / 0.25)));
  const [a, b, f] = s < 0.5 ? [tone.ramp[0], tone.ramp[1], s * 2] : [tone.ramp[1], tone.ramp[2], (s - 0.5) * 2];
  const ramp: Rgb = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  if (m <= 0) return ramp;
  const k = Math.min(1.25, 0.35 + t * 0.95);
  return [0, 1, 2].map((i) => ramp[i] + (Math.min(1, tone.accent[i] * k) - ramp[i]) * m) as Rgb;
}

// How much of a model's surface the accent may cover before it turns loud: an accent is a stripe, a lamp or a trim, so a model that
// is mostly coloured (a bunk, a sofa, a barrel) has it held back, and its parts keep to the ramp where they are materials
const LOUD = 0.35;
export function holdOf(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute("position");
  const col = geometry.getAttribute("color");
  if (!pos || !col) return 1;
  const index = geometry.getIndex();
  const triangles = (index ? index.count : pos.count) / 3;
  const at = (i: number) => (index ? index.getX(i) : i);
  const [p, q, r, u, v] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let area = 0;
  let coloured = 0;
  for (let n = 0; n < triangles; n++) {
    const [i, j, k] = [at(n * 3), at(n * 3 + 1), at(n * 3 + 2)];
    const a = u.subVectors(q.fromBufferAttribute(pos, j), p.fromBufferAttribute(pos, i)).cross(v.subVectors(r.fromBufferAttribute(pos, k), p)).length();
    area += a;
    coloured += a * accentShare([col.getX(i), col.getY(i), col.getZ(i)]);
  }
  const share = area > 0 ? coloured / area : 0;
  return share <= LOUD ? 1 : Math.max(0.7, Math.sqrt(LOUD / share));
}

// A tone for a place on a world: the named palette's accent, with the ramp drawn from the colour its walls are on that world
// (a frontier room on a desert is dust, on ice slate). The dark stop is the colour at a fifth, the light stop lifted to paper.
export function worldTone(name: string, wall: string): Tone {
  const base = TONES[name] ?? TONES.frontier;
  const c = new THREE.Color(wall);
  const light = c.clone().lerp(new THREE.Color(1, 1, 1), 0.6);
  return {
    id: `${name}@${wall}`,
    ramp: [[c.r * 0.2, c.g * 0.2, c.b * 0.2], [c.r, c.g, c.b], [light.r, light.g, light.b]],
    accent: base.accent,
  };
}

// A copy of the geometry in the tone (the original keeps the pack's colours)
export function retone(geometry: THREE.BufferGeometry, tone: Tone): THREE.BufferGeometry {
  const out = geometry.clone();
  const src = geometry.getAttribute("color");
  if (!src) return out;
  const colours = new Float32Array(src.count * 3);
  const mark = geometry.getAttribute("mark");
  const hold = holdOf(geometry);
  for (let i = 0; i < src.count; i++) {
    // A glowing part (a blade, a screen, a lamp) keeps its own colour: the palette is for what a room is made of
    const [r, g, b] = mark && Math.round(mark.getX(i)) === 2 ? [src.getX(i), src.getY(i), src.getZ(i)] : toned(tone, [src.getX(i), src.getY(i), src.getZ(i)], hold);
    colours.set([r, g, b], i * 3);
  }
  out.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return out;
}

// The tone a pack gives a place whose walls are `wall` (a world's wall colour) coloured
export const packTone = (pack: { tone: string; world?: boolean }, wall: string): Tone => (pack.world ? worldTone(pack.tone, wall) : TONES[pack.tone] ?? TONES.frontier);

// A tone from colours given as they are (a cave's rock and crystal, as its palette has them)
export function toneOfColours(id: string, ramp: [string, string, string], accent: string): Tone {
  const lin = (hex: string): Rgb => {
    const c = new THREE.Color(hex);
    return [c.r, c.g, c.b];
  };
  return { id, ramp: ramp.map(lin) as Tone["ramp"], accent: lin(accent) };
}

// A tone's middle stop as a colour string: for the plain parts of a wall (a rounded corner) that stand beside the kit's tiles
export const toneColour = (tone: Tone): string => `#${new THREE.Color().setRGB(...tone.ramp[1]).getHexString()}`;
