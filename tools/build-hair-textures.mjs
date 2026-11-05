// The strand map of hair cards (2026-11-04): client/public/textures/figure/hair/strands.webp, 512 x 512 with an alpha channel (made here, CC0).
// tools/blender/build-hair.py lays each card's texture coordinates on it: u across the card in one of THREE strips of the map (0 to 0.75, a strip
// 0.25 wide each: strands of different spacing and length, so that no two locks repeat), v from the root (the bottom of the picture) to the tip;
// and the FOURTH strip (u 0.75 to 1) is opaque, fine strands without any gap: what the cap under the cards is drawn with.
//   a card's strip: strands a little over two texels wide, wavering slightly along the card, each ending at its own height (the roots are all
//   there: the first tenth of the card is solid) and narrowing to a point; the picture is grey (the vertex colour is the hair's), each strand a
//   little lighter or darker than the next, with a slow shine along it, and darker at its edges
// The alpha is cut at 0.42 by the material (models.tsx MATERIALS.strand).
//   node tools/build-hair-textures.mjs
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";

const N = 512;
const STRIP = N / 4;
const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const px = new Uint8ClampedArray(N * N * 4);
const grey = new Float32Array(N * N);
const alpha = new Float32Array(N * N);

// A card's strip: `count` strands about `width` texels wide
function strip(x0, count, width, seed, ragged) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const cx0 = x0 + ((i + 0.5) / count) * STRIP + (r() - 0.5) * (STRIP / count) * 0.7;
    const w = width * (0.75 + 0.5 * r());
    const end = 0.55 + 0.45 * r() ** (ragged ? 0.8 : 0.5);
    const tone = 0.62 + 0.38 * r();
    const phase = r() * 6.28, wob = 0.8 + 1.6 * r(), freq = 2 + 3 * r();
    const shinePhase = r() * 6.28;
    for (let y = 0; y < N; y++) {
      const t = (N - 1 - y) / (N - 1);                  // 0 at the root (the bottom of the picture), 1 at the tip
      if (t > end) continue;
      const taper = t < end - 0.3 ? 1 : 0.18 + 0.82 * ((end - t) / 0.3);
      const half = (w * taper) / 2;
      const cx = cx0 + wob * Math.sin(t * freq * 3 + phase);
      const lo = Math.max(x0, Math.floor(cx - half - 1.5)), hi = Math.min(x0 + STRIP - 1, Math.ceil(cx + half + 1.5));
      for (let x = lo; x <= hi; x++) {
        const d = Math.abs(x + 0.5 - cx);
        const a = Math.max(0, Math.min(1, half - d + 0.5));
        if (a <= 0) continue;
        const edge = 1 - 0.3 * smooth(0.4, 1.0, d / Math.max(0.5, half));
        const shine = 0.88 + 0.12 * Math.sin(t * 9 + shinePhase);
        const band = 0.82 + 0.42 * Math.exp(-(((t - 0.42) / 0.16) ** 2));           // (a broad highlight across the lock, where the light catches it)
        const v = tone * edge * shine * band * (0.8 + 0.2 * smooth(0, 0.25, t));      // (a little darker at the root)
        const k = y * N + x;
        if (a > alpha[k]) { alpha[k] = a; grey[k] = v; }
      }
    }
    // (the root band: solid, so that a card joins the cap)
  }
  for (let y = 0; y < N; y++) {
    const t = (N - 1 - y) / (N - 1);
    if (t > 0.1) continue;
    for (let x = x0; x < x0 + STRIP; x++) {
      const k = y * N + x;
      // (filled by column, a strand's tone along the whole band: a tone for each texel was a speckle of static at every card's root, 2026-11-05)
      if (alpha[k] < 1) { grey[k] = Math.max(grey[k] * alpha[k], (0.5 + 0.3 * rng(x * 977 + 13)()) * (0.8 + 0.2 * smooth(0, 0.25, t))); alpha[k] = 1; }
    }
  }
}
strip(0, 30, 3.0, 11, false);
strip(STRIP, 24, 4.0, 22, true);
strip(STRIP * 2, 38, 2.4, 33, true);

// The opaque strip: strands without gaps that tile along v (whole numbers of waves), for the cap
{
  const x0 = STRIP * 3;
  const r = rng(44);
  const cols = [];
  const count = 46;
  for (let i = 0; i < count; i++) cols.push({ tone: 0.5 + 0.5 * r(), phase: r() * 6.28, k: 1 + Math.floor(r() * 3) });
  for (let y = 0; y < N; y++) for (let x = 0; x < STRIP; x++) {
    const f = (x / STRIP) * count;
    const i = Math.min(count - 1, Math.floor(f));
    const c = cols[i];
    const across = Math.abs(f - i - 0.5) * 2;
    const along = 0.9 + 0.1 * Math.sin((y / N) * Math.PI * 2 * (c.k + 2) + c.phase);
    const tv = (N - 1 - y) / (N - 1);
    // (a ring of light round the crown: build-hair.py lays the cap's v from 0.15 at the crown to 1 under the ears, so the ring is about 40 degrees down
    // from the crown, where the light catches it; at 0.72 it was a pale band at the ears, 2026-11-05)
    const ring = 0.86 + 0.3 * Math.exp(-(((tv - 0.42) / 0.12) ** 2));
    grey[y * N + x0 + x] = c.tone * along * ring * (1 - 0.35 * across ** 2);
    alpha[y * N + x0 + x] = 1;
  }
}

for (let i = 0; i < N * N; i++) {
  const g = Math.round(Math.max(0, Math.min(1, grey[i])) * 255);
  px[i * 4] = g; px[i * 4 + 1] = g; px[i * 4 + 2] = g;
  px[i * 4 + 3] = Math.round(alpha[i] * 255);
}
const out = path.resolve("client/public/textures/figure/hair");
fs.mkdirSync(out, { recursive: true });
await sharp(Buffer.from(px.buffer), { raw: { width: N, height: N, channels: 4 } }).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(out, "strands.webp"));
console.log("ok strands.webp");
