// The iris of an eye (2026-11-04): client/public/textures/figure/eye/diffuse.jpg, 256 x 256, made here (CC0). The picture is laid on a cap whose edge is the
// edge of the circle (models.tsx irisCap): a black pupil in the middle (it stays black whatever the eye's colour), a lighter collarette round it, fibres
// running out to a darker limbal ring at the rim. The eye's colour (the vertex colour) multiplies it.
//   node tools/build-eye-textures.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const N = 256;
const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const r = rng(5);
const BINS = 96;
const fibre = Array.from({ length: BINS }, () => r());
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const noiseA = (a) => { const f = ((a / (Math.PI * 2)) % 1 + 1) % 1 * BINS; const i = Math.floor(f); const t = f - i; return fibre[i % BINS] * (1 - t) + fibre[(i + 1) % BINS] * t; };
const px = Buffer.alloc(N * N * 3);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const dx = (x + 0.5) / N * 2 - 1, dy = (y + 0.5) / N * 2 - 1;
  const rho = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  const fib = 0.5 * noiseA(a) + 0.3 * noiseA(a * 2.3 + rho * 3) + 0.2 * noiseA(a * 5.1 - rho * 4);
  let v = 0.5 + 0.5 * fib;                                   // the fibres
  v *= 0.75 + 0.25 * smooth(0.34, 0.55, rho);                // darker toward the pupil
  v += 0.35 * Math.exp(-(((rho - 0.46) / 0.07) ** 2));        // the collarette: a bright ring round the pupil
  v *= 1 - 0.55 * smooth(0.8, 1.0, rho);                     // the limbal ring
  v *= 1 - 0.97 * (1 - smooth(0.27, 0.33, rho));             // the pupil
  const g = Math.round(Math.max(0, Math.min(1, v)) * 255);
  const k = (y * N + x) * 3;
  px[k] = g; px[k + 1] = g; px[k + 2] = g;
}
const out = path.resolve("client/public/textures/figure/eye");
fs.mkdirSync(out, { recursive: true });
await sharp(px, { raw: { width: N, height: N, channels: 3 } }).jpeg({ quality: 92 }).toFile(path.join(out, "diffuse.jpg"));
console.log("ok eye");
