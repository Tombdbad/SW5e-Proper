// /dev/terrain: the ground beyond a place on its own page, for looking at the land in a browser without a campaign (as /dev/dogfight does for the fights).
// Drawn by the game's own (Babylon) renderer; add three=1 for three's. Query: biome (temperate, forest, jungle, swamp, ocean, desert, ice, volcanic, urban, barren), seed, fog=0 (no fog), view=high|low|top|ground (eye height, as the party sees it), inner (the flat ground's half side, in squares).
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import * as THREE from "three";
import { ReliefGround } from "@/components/Map/terrain";
import { babylonGl } from "@/components/Map/babylon";
import { groundTexture } from "@/components/Map/siteAssets";

export default function TerrainLab() {
  const [q] = useSearchParams();
  const biome = q.get("biome") ?? "temperate";
  const seed = Number(q.get("seed") ?? 1);
  const inner = Number(q.get("inner") ?? 130);
  const view = q.get("view") ?? "low";
  const tex = groundTexture(biome, "town", "#26361f")!;
  const camera: [number, number, number] = view === "top" ? [0, 900, 1] : view === "high" ? [0, 90, 150] : view === "ground" ? [0, 2.4, inner - 8] : [0, 6, 100];
  const target: [number, number, number] = view === "top" ? [0, 0, 0] : view === "ground" ? [0, 5, -140] : [0, view === "high" ? 0 : 14, -200];
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <Canvas gl={q.get("three") ? undefined : babylonGl} camera={{ position: camera, fov: 55, near: 0.5, far: 3000 }}>
        <color attach="background" args={["#a9c4dc"]} />
        {q.get("fog") !== "0" && <fog attach="fog" args={["#bcd0e0", 150, 600]} />}
        <ambientLight intensity={0.8} />
        <directionalLight position={[300, 200, 120]} intensity={1.6} />
        <Suspense fallback={null}>
          <ReliefGround biome={biome} seed={seed} inner={inner} at={[0, -0.1, 0]} set={tex.set} tint={tex.tint} />
          {/* the place's own ground, as the map lays it */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
            <planeGeometry args={[inner * 2, inner * 2]} />
            <meshLambertMaterial color={new THREE.Color("#8a7a5a")} />
          </mesh>
        </Suspense>
        <OrbitControls target={target} />
      </Canvas>
    </div>
  );
}
