// The cut-out leaf texture (2026-11-03, asked by the user: gaps between a tree's leaves, to look less like a solid lump). The leaves
// finish (models.tsx MATERIALS.leaf) is drawn with client/public/textures/leaves/forest_leaves_02/diffuse-cutout.webp: the photograph
// of the set with an alpha channel in which scattered, pointed leaves are opaque and the rest is clear (the material alpha-tests it).
// Made here, not downloaded (CC0, this project's own). The alpha tiles, as the photograph does.
//
//   node tools/build-leaf-cutout.mjs
import path from "node:path";
import sharp from "sharp";

const SIZE = 1024;
const DIR = path.resolve("client/public/textures/leaves/forest_leaves_02");
const LEAVES = 170; // how many leaves lie on one repeat
const GAPS = 14; // and how many larger gaps are cut through them (about half of a repeat ends up covered)

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// One pointed leaf along x, `l` long and `w` wide, with a stalk
const leaf = (l, w) => `M ${-l / 2} 0 C ${-l / 4} ${-w}, ${l / 4} ${-w * 0.9}, ${l / 2} 0 C ${l / 4} ${w * 0.9}, ${-l / 4} ${w}, ${-l / 2} 0 Z M ${-l / 2} 0 L ${-l / 2 - l * 0.12} ${w * 0.1} L ${-l / 2} ${w * 0.12} Z`;

const next = rng(20261103);
const shapes = [];
for (let i = 0; i < LEAVES; i++) {
  const x = next() * SIZE, y = next() * SIZE, a = next() * 360, l = 110 + next() * 90, w = l * (0.26 + next() * 0.14);
  // (a copy on each side of the repeat, so that the edges join)
  for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) {
    const px = x + dx, py = y + dy;
    if (px < -l || px > SIZE + l || py < -l || py > SIZE + l) continue;
    shapes.push(`<path d="${leaf(l, w)}" transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${a.toFixed(1)})"/>`);
  }
}
// Larger gaps cut through the leaves, ragged ellipses of sky (a canopy is a few layers of this, and small gaps close up behind one another)
const gaps = [];
for (let i = 0; i < GAPS; i++) {
  const x = next() * SIZE, y = next() * SIZE, rx = 50 + next() * 80, ry = rx * (0.5 + next() * 0.5), a = next() * 180;
  for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) {
    const px = x + dx, py = y + dy;
    if (px < -rx || px > SIZE + rx || py < -rx || py > SIZE + rx) continue;
    gaps.push(`<ellipse rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${a.toFixed(1)})"/>`);
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="100%" height="100%" fill="black"/><g fill="white">${shapes.join("")}</g><g fill="black">${gaps.join("")}</g></svg>`;
const mask = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer();

const photo = await sharp(path.join(DIR, "diffuse.jpg")).resize(SIZE, SIZE).removeAlpha().raw().toBuffer();
const out = Buffer.alloc(SIZE * SIZE * 4);
let covered = 0;
for (let i = 0; i < SIZE * SIZE; i++) {
  out[i * 4] = photo[i * 3];
  out[i * 4 + 1] = photo[i * 3 + 1];
  out[i * 4 + 2] = photo[i * 3 + 2];
  out[i * 4 + 3] = mask[i];
  if (mask[i] > 127) covered++;
}
await sharp(out, { raw: { width: SIZE, height: SIZE, channels: 4 } }).webp({ quality: 82, alphaQuality: 100 }).toFile(path.join(DIR, "diffuse-cutout.webp"));
console.log(`diffuse-cutout.webp: ${((covered / (SIZE * SIZE)) * 100).toFixed(0)}% opaque`);
