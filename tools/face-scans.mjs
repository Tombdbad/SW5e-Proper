// Colour maps of real faces, laid in the head's face plane (2026-11-05; the user, with a screenshot of unwrapped photo-scan face textures: "borrow HEAVILY from this image to generate
// updated human facial textures. Our current faces have duplicated eyebrows, and weird expressions that look WRONG").
// The sheet (tools/refs/snips/face-scans-sheet.png, not in the repository) holds the textures of scanned heads laid flat, the face in the middle, the ears at the sides. For each of four
// faces (tools/refs/faces.json: the crop, the eyes, the mouth, the chin) this makes a map in the plane the head's features are laid out in (x across, y up, in metres of the head's own
// frame, as tools/blender/build-head.py has them): the photograph sampled by an affine fit of the eyes and the mouth to where the head has its own, then divided by the skin's own colour
// (the mean of the cheeks and the forehead), so that what is left is what the face has over its skin: the lips' red, the shade of the nostrils and the lids, the flush of the cheeks, the
// grain. What would be wrong on another head is taken out: the eyes (the head has eyeballs of its own), the brows (the hair cards are the brows), the lashes, and the hair and the
// temples, which fade into plain skin.
//   import { facePlane, PLANE } from "./face-scans.mjs";   const p = await facePlane("m");  p.at(x, y) -> [r, g, b] (1 is the skin's own colour) or null
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/refs/faces.json"), "utf8"));
const SHEET = path.join(ROOT, "tools/refs/snips/face-scans-sheet.png");
export const available = fs.existsSync(SHEET);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

async function crop(id) {
  const f = spec.faces[id];
  const [left, top, width, height] = f.crop;
  const { data, info } = await sharp(SHEET).extract({ left, top, width, height }).removeAlpha().blur(0.9).raw().toBuffer({ resolveWithObject: true });
  return { f, data, w: info.width, h: info.height };
}

// Bilinear sample of the crop (0..1 per channel); null where it is outside or in the scan's black
function sampler({ data, w, h }) {
  return (px, py) => {
    if (px < 0 || py < 0 || px > w - 1.001 || py > h - 1.001) return null;
    const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const a = data[(y0 * w + x0) * 3 + c], b = data[(y0 * w + x0 + 1) * 3 + c], d = data[((y0 + 1) * w + x0) * 3 + c], e = data[((y0 + 1) * w + x0 + 1) * 3 + c];
      out[c] = ((a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy) / 255;
    }
    return out[0] * 0.3 + out[1] * 0.59 + out[2] * 0.11 < 0.1 ? null : out;
  };
}

const cache = {};
export async function facePlane(id) {
  if (cache[id]) return cache[id];
  const c = await crop(id);
  const sample = sampler(c);
  const { f } = c;
  const [[lx, ly], [rx, ry]] = f.eyes;
  const eyeY = (ly + ry) / 2, cx = (lx + rx) / 2;
  // metres of the head's frame for a pixel of the photograph, across (from the eyes' distance) and up (from the eyes' height to the mouth's)
  const sx = (2 * spec.mesh.eyeX) / (rx - lx);
  const sy = (spec.mesh.eyeY - spec.mesh.mouthY) / (f.mouth - eyeY);
  // (a face used turned about the other way is a second face of the same sort)
  const flip = f.mirror ? -1 : 1;
  const photo = (x, y) => sample(cx + (flip * x) / sx, eyeY + (spec.mesh.eyeY - y) / sy);
  // The skin's own colour: the cheeks and the forehead
  const patch = (x, y, r) => {
    const sum = [0, 0, 0];
    let n = 0;
    for (let i = -r; i <= r; i += 0.002) for (let j = -r; j <= r; j += 0.002) { const p = photo(x + i, y + j); if (p) { for (let k = 0; k < 3; k++) sum[k] += p[k]; n++; } }
    return n ? sum.map((v) => v / n) : null;
  };
  const patches = [patch(-0.050, -0.020, 0.008), patch(0.050, -0.020, 0.008), patch(0, 0.058, 0.010), patch(-0.030, 0.058, 0.008), patch(0.030, 0.058, 0.008)].filter(Boolean);
  const skin = [0, 1, 2].map((k) => patches.reduce((a, p) => a + p[k], 0) / patches.length);
  // (what the skin has over its own colour; a cooler cast, a bluish jaw or a greenish shade, is damped to two fifths: the warmth stays, which is the flush and the lips)
  const ratio = (x, y) => {
    const p = photo(x, y);
    if (!p) return null;
    const r = p.map((v, k) => Math.max(0.3, Math.min(1.45, v / skin[k])));
    const lum = r[0] * 0.3 + r[1] * 0.59 + r[2] * 0.11;
    return r[0] - lum < 0 ? r.map((v) => lum + (v - lum) * 0.4) : r;
  };
  // (the same averaged over a small patch: for what stands in where something was cut out)
  const soft = (x, y) => {
    const sum = [0, 0, 0];
    let n = 0;
    for (const [dx, dy] of [[0, 0], [-0.012, 0], [0.012, 0], [0, -0.004], [0, 0.004], [-0.024, 0], [0.024, 0]]) { const r = ratio(x + dx, y + dy); if (r) { for (let k = 0; k < 3; k++) sum[k] += r[k]; n++; } }
    return n ? sum.map((v) => v / n) : [1, 1, 1];
  };
  // Where the photograph is used (1) and where it fades into plain skin (0): not the hair above `top`, not the temples where the hairline comes down, not the sides past the cheeks,
  // and the chin and the neck fade at the foot
  const fade = (x, y) => {
    const ax = Math.abs(x);
    const side = 1 - smooth(0.070, 0.086, ax);
    const high = 1 - smooth(f.top - 0.014, f.top + 0.004, y);
    const temple = y > 0.030 ? 1 - smooth(0.054, 0.068, ax) : 1;
    const low = smooth(-0.128, -0.108, y);
    return Math.max(0, Math.min(1, side * high * temple * low));
  };
  // What is cut out of the photograph and filled from the lid's skin above and below (the head has eyeballs, and hair cards for brows): an oval round each eye, a band over it
  const cut = (x, y) => {
    const ax = Math.abs(x);
    const eye = 1 - smooth(0.9, 1.25, Math.hypot((ax - 0.0405) / 0.0215, (y - 0.0170) / 0.0112));
    // (the photographs' brows sit lower over the eye than the head's: the band runs from just over the eye to over the head's own)
    const brow = (1 - smooth(0.0, 0.018, Math.max(0.028 - y, y - 0.054))) * smooth(0.004, 0.016, ax) * (1 - smooth(0.064, 0.080, ax));
    return Math.max(eye, brow);
  };
  // The lid's skin: between the forehead's ratio above the brow and the cheek's under the eye, a shade darker round the eye itself
  const fill = (x, y) => {
    const up = soft(x, 0.062);
    const dn = soft(x, -0.004);
    const t = smooth(0.0, 1.0, Math.max(0, Math.min(1, (y + 0.004) / 0.072)));
    const dark = 0.97 - 0.05 * (1 - smooth(0.9, 1.6, Math.hypot((Math.abs(x) - 0.0405) / 0.0215, (y - 0.0170) / 0.0112)));
    return [0, 1, 2].map((k) => (dn[k] * (1 - t) + up[k] * t) * dark);
  };
  // (stubble and a shaded jaw are no part of every man's face: below the nostrils, outside the lips, the ratio is not let darker than a fifth under the skin's own, nor bluer)
  const lips = (x, y) => 1 - smooth(0.8, 1.2, Math.hypot(x / 0.034, (y + 0.0525) / 0.0145));
  const clean = (r, x, y) => {
    if (y > -0.027) return r;
    const k = 1 - lips(x, y);
    const lum = r[0] * 0.3 + r[1] * 0.59 + r[2] * 0.11;
    const lift = lum < 0.9 ? 0.9 / lum : 1;
    return r.map((v) => v * (1 + (lift - 1) * k));
  };
  const at = (x, y) => {
    const w = fade(x, y);
    if (w <= 0) return null;
    const r0 = ratio(x, y);
    if (!r0) return null;
    const r = clean(r0, x, y);
    const c = cut(x, y);
    const g = c > 0 ? fill(x, y).map((v, k) => r[k] * (1 - c) + v * c) : r;
    return [0, 1, 2].map((k) => 1 + (g[k] - 1) * w);
  };
  const out = { id, skin, at };
  cache[id] = out;
  return out;
}
