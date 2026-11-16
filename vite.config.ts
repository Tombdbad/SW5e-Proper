import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import glsl from "vite-plugin-glsl";
import { optimizeDistPlugin } from "./tools/optimizeDist.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    glsl(), // Add GLSL shader support
    optimizeDistPlugin(), // meshopt for the models, .br/.gz for every file, the service worker's build id
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "immer": "immer" //Added alias for immer
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    // The rules data (shared/data/sw5e) and the 3D map are bundled whole, so the chunks are large by design; the renderer and
    // three.js have chunks of their own, so that a new build of the game's code leaves them cached on the phone. (The rules data is
    // not forced into one chunk: its datasets are loaded one at a time by shared/data/index.ts)
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          const p = id.split("\\").join("/");
          if (p.includes("/node_modules/@babylonjs/")) return "babylon";
          if (/\/node_modules\/(three|three-stdlib|@react-three)\//.test(p)) return "three";
          return undefined;
        },
      },
      onwarn(warning, warn) {
        // three-stdlib ships a lottie loader that uses eval; the game never loads it
        if (warning.code === "EVAL" && /node_modules[\/]three-stdlib/.test(warning.id ?? "")) return;
        warn(warning);
      },
    },
  },
  // Add support for large models and audio files
  assetsInclude: ["**/*.gltf", "**/*.glb", "**/*.mp3", "**/*.ogg", "**/*.wav"],
});