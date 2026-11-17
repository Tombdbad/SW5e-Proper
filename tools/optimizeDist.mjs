// The last step of every client build (a Vite plugin in vite.config.ts, so `vite build --outDir <anywhere>` gets it too), and
// a command for a folder that is already built:  node tools/optimizeDist.mjs <build dir>
//   1. every .glb over 64 kB in the build is meshopt-compressed (EXT_meshopt_compression, the "filter" method: the decoder gives
//      floats back, so no loader sees a changed node scale). The sources in client/public stay as the Blender tools wrote them,
//      so a regenerated ships.glb or any new model gets this with no extra step; the client decodes it (src/lib/gltf.ts);
//   2. every file a browser can read as text or that compresses well gets a .br and a .gz next to it (kept only if smaller),
//      which server/vite.ts serves by Accept-Encoding;
//   3. the service worker's build id is set (client/public/sw.js, see src/main.tsx).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";

const COMPRESSIBLE = new Set([".js", ".mjs", ".css", ".html", ".json", ".svg", ".webmanifest", ".txt", ".glb", ".gltf", ".wasm", ".xml", ".map", ".wav", ".bin"]);
const GLB_MIN = 64 * 1024;
const PRECOMPRESS_MIN = 1024;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

async function compressGlbs(dir, log) {
  const { NodeIO } = await import("@gltf-transform/core");
  const ext = await import("@gltf-transform/extensions");
  const { MeshoptEncoder, MeshoptDecoder } = await import("meshoptimizer");
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const { EXTMeshoptCompression } = ext;
  const io = new NodeIO()
    .registerExtensions(ext.ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  const warn = console.warn;
  console.warn = () => {};
  let before = 0;
  let after = 0;
  try {
    for (const file of walk(dir)) {
      if (!file.endsWith(".glb") || fs.statSync(file).size < GLB_MIN) continue;
      const doc = await io.read(file);
      if (doc.getRoot().listExtensionsUsed().some((x) => x.extensionName === "EXT_meshopt_compression")) continue;
      doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
      const size = fs.statSync(file).size;
      const bytes = await io.writeBinary(doc);
      if (bytes.length >= size) continue;
      fs.writeFileSync(file, bytes);
      before += size;
      after += bytes.length;
    }
  } finally {
    console.warn = warn;
  }
  if (before) log(`optimizeDist: glb ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB (meshopt)`);
}

function precompress(dir, log) {
  let raw = 0;
  let br = 0;
  for (const file of [...walk(dir)]) {
    if (/\.(br|gz)$/.test(file) || !COMPRESSIBLE.has(path.extname(file))) continue;
    const buf = fs.readFileSync(file);
    if (buf.length < PRECOMPRESS_MIN) continue;
    const packed = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
    const gz = zlib.gzipSync(buf, { level: 9 });
    for (const [suffix, data] of [[".br", packed], [".gz", gz]]) {
      if (data.length < buf.length * 0.95) fs.writeFileSync(file + suffix, data);
      else if (fs.existsSync(file + suffix)) fs.rmSync(file + suffix);
    }
    raw += buf.length;
    br += Math.min(packed.length, buf.length);
  }
  log(`optimizeDist: ${(raw / 1e6).toFixed(1)} MB of compressible files -> ${(br / 1e6).toFixed(1)} MB brotli`);
}

// The service worker caches by build: its id is a hash of the page and every script the page names, so a new build is a new worker
function stampWorker(dir, log) {
  const sw = path.join(dir, "sw.js");
  if (!fs.existsSync(sw)) return;
  const hash = crypto.createHash("sha1");
  for (const file of [...walk(dir)].sort()) if (/(index\.html|\.js|\.css)$/.test(file) && file !== sw) hash.update(path.relative(dir, file)).update(fs.readFileSync(file));
  // (replaceAll: sw.js names the placeholder in a comment above the line that uses it)
  fs.writeFileSync(sw, fs.readFileSync(sw, "utf8").replaceAll("__BUILD_ID__", hash.digest("hex").slice(0, 12)));
  log("optimizeDist: service worker stamped");
}

export async function optimizeDist(dir, log = console.log) {
  stampWorker(dir, log);
  await compressGlbs(dir, log);
  precompress(dir, log);
}

export function optimizeDistPlugin() {
  let outDir = "";
  return {
    name: "optimize-dist",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      if (outDir && fs.existsSync(outDir)) await optimizeDist(outDir);
    },
  };
}

// (by the script's own name: server/vite.ts imports vite.config, so this module is bundled into dist/index.js, where import.meta.url is the server's)
if (/optimizeDist\.mjs$/.test(process.argv[1] ?? "")) {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: node tools/optimizeDist.mjs <build dir>");
  await optimizeDist(path.resolve(dir));
}
