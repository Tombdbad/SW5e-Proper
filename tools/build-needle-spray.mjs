// The spray of a conifer's branch (2026-11-03, asked by the user: pine branches radiating from a solid trunk, with fine sprays of deep
// green needles). client/public/textures/needles/spray.webp is a card's worth of one: a woody stem up the middle, twigs swept forward
// off it, and fine needles along every twig, on a clear ground (the material alpha-tests it, models.tsx MATERIALS.needle). The picture
// is pale and nearly colourless, as the other detail maps are: the palette's green multiplies it. Made here, not downloaded (CC0, this
// project's own).
//
//   node tools/build-needle-spray.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SIZE = 512;
const OUT = path.resolve("client/public/textures/needles");

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const next = rng(20261103);
const grey = (l) => { const c = Math.round(l * 255).toString(16).padStart(2, "0"); return `#${c}${c}${c}`; };

const lines = [];
const line = (x1, y1, x2, y2, w, color) => lines.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${w.toFixed(2)}" stroke-linecap="round"/>`);

// Needles along a twig from (x, y) in direction `a` (radians, 0 along +x, y down), `length` long: pairs swept forward either side
function twig(x, y, a, length, width, needle) {
  const ex = x + Math.cos(a) * length, ey = y + Math.sin(a) * length;
  line(x, y, ex, ey, width, grey(0.5));
  const step = 4.2;
  for (let d = step; d < length; d += step) {
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    const fall = 1 - (d / length) * 0.45; // shorter toward the tip
    for (const side of [-1, 1]) {
      const na = a + side * (0.55 + next() * 0.35);
      const nl = needle * fall * (0.75 + next() * 0.5);
      line(px, py, px + Math.cos(na) * nl, py + Math.sin(na) * nl, 1.9 + next() * 0.6, grey(0.62 + next() * 0.38));
    }
  }
  // the tip: needles fanned off its end
  for (let i = -1; i <= 1; i++) {
    const na = a + i * 0.4;
    line(ex, ey, ex + Math.cos(na) * needle * 0.7, ey + Math.sin(na) * needle * 0.7, 2, grey(0.8));
  }
}

// The stem rises from the bottom middle (the card's base is where the branch leaves the trunk) with a slight bow
const baseY = SIZE - 6, topY = 14, x0 = SIZE / 2;
const stemX = (t) => x0 + Math.sin(t * Math.PI) * 6;
const stemY = (t) => baseY + (topY - baseY) * t;
for (let i = 0; i < 40; i++) {
  const t0 = i / 40, t1 = (i + 1) / 40;
  line(stemX(t0), stemY(t0), stemX(t1), stemY(t1), 7 - 5 * t0, grey(0.42));
}
// Twigs off the stem, alternating sides, long in the middle and short at the base and tip (a spray is a leaf-shaped thing)
const TWIGS = 26;
for (let i = 0; i < TWIGS; i++) {
  const t = 0.04 + (i / TWIGS) * 0.94;
  const side = i % 2 ? 1 : -1;
  const reach = 20 + 205 * Math.sin(Math.min(1, t * 1.15 + 0.06) * Math.PI * 0.92) * (1 - t * 0.35);
  const a = -Math.PI / 2 + side * (1.05 - 0.35 * t + (next() - 0.5) * 0.25);
  twig(stemX(t), stemY(t), a, reach, 2.4 - t, 17 + next() * 6);
}
// A tuft at the leader's end, and needles up the stem itself
twig(stemX(1), stemY(1), -Math.PI / 2, 30, 2, 18);
for (let t = 0.1; t < 0.97; t += 0.03) for (const side of [-1, 1]) line(stemX(t), stemY(t), stemX(t) + side * (8 + next() * 8), stemY(t) - 14 - next() * 8, 1.9, grey(0.55 + next() * 0.3));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">${lines.join("")}</svg>`;
fs.mkdirSync(OUT, { recursive: true });
await sharp(Buffer.from(svg)).webp({ quality: 85, alphaQuality: 100 }).toFile(path.join(OUT, "spray.webp"));
console.log("spray.webp written");
