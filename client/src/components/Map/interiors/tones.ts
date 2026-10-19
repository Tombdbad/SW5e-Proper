// Recolouring the downloaded models (2026-10-19). A converted model keeps the colours its pack gave it; the room it stands
// in decides its palette, so that one room (walls, furniture, machines) reads as one place and a workshop, a sickbay and a
// palace do not look alike. Colours are turned by lightness along a three-stop ramp (dark, middle, light), and the saturated
// ones (a hazard stripe, a lamp, a trim) become the palette's accent. The ramps are in shared/art/tones.json, which
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
const SATURATED = 0.42;

// The colour a model colour becomes in a tone
export function toned(tone: Tone, rgb: Rgb): Rgb {
  const l = lightness(rgb);
  const t = Math.min(1, l * 1.6);
  if (saturation(rgb) >= SATURATED) {
    const f = Math.min(1.25, 0.35 + t * 0.95);
    return [Math.min(1, tone.accent[0] * f), Math.min(1, tone.accent[1] * f), Math.min(1, tone.accent[2] * f)];
  }
  const [a, b, f] = t < 0.5 ? [tone.ramp[0], tone.ramp[1], t * 2] : [tone.ramp[1], tone.ramp[2], (t - 0.5) * 2];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
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
  for (let i = 0; i < src.count; i++) {
    const [r, g, b] = toned(tone, [src.getX(i), src.getY(i), src.getZ(i)]);
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
