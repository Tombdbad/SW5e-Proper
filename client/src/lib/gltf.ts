// The one way the client makes a glTF loader: the models are meshopt-compressed when the site is built (tools/optimizeDist.mjs
// turns every large .glb in the build into EXT_meshopt_compression), so each loader needs the decoder. A file that was not
// compressed (the dev server serves the sources as they are) loads the same.
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export function newGLTFLoader(): GLTFLoader {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}
