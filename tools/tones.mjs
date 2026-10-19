// The palettes of shared/art/tones.json and the colour turn the converter bakes in (tone=<name>). The same turn is made at load
// time by client/src/components/Map/interiors/tones.ts; tests/interiors/tones.test.ts checks that the two agree.
import fs from "node:fs";

const file = new URL("../shared/art/tones.json", import.meta.url);
const srgb = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearOf = (hex) => [1, 3, 5].map((i) => srgb(parseInt(hex.slice(i, i + 2), 16) / 255));

export const TONES = Object.fromEntries(
  Object.entries(JSON.parse(fs.readFileSync(file, "utf8")))
    .filter(([name]) => !name.startsWith("_"))
    .map(([name, t]) => [name, { id: name, ramp: t.ramp.map(linearOf), accent: linearOf(t.accent) }]),
);

const saturation = ([r, g, b]) => {
  const hi = Math.max(r, g, b);
  return hi <= 1e-6 ? 0 : (hi - Math.min(r, g, b)) / hi;
};
export const toned = (tone, rgb) => {
  const l = Math.min(1, 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]);
  const t = Math.min(1, l * 1.6);
  if (saturation(rgb) >= 0.42) {
    const f = Math.min(1.25, 0.35 + t * 0.95);
    return tone.accent.map((v) => Math.min(1, v * f));
  }
  const [a, b, f] = t < 0.5 ? [tone.ramp[0], tone.ramp[1], t * 2] : [tone.ramp[1], tone.ramp[2], (t - 0.5) * 2];
  return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * f);
};
