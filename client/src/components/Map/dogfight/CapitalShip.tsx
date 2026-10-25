// A capital ship or the station on the dogfight's scene: the paneled hull (normal-mapped, with parallax, windows lit), its parts (shield
// generators, batteries that turn to the party's craft, point defense, hangar bays, the station's port) that go dark when they are shot
// out, and the shield bubble that shows while a generator stands. Positions and sizes are the rules' (shared/logic/dogfight.ts), so the
// model is where the hull is.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CLASSES, toLocal, type Part, type Vessel } from "@shared/logic/dogfight";
import { shielded } from "@shared/logic/dogfightSim";
import { capitalGeometry } from "./capitalGeometry";
import { hullMaterial, type Livery } from "./hullSurface";
import { useQuality } from "../siteAssets";

export interface CapitalRig { hit: (world: [number, number, number], size: number) => void }

const dark = new THREE.MeshStandardMaterial({ color: "#0a0c10", roughness: 0.9, metalness: 0.2 });
const glowMat = new THREE.MeshBasicMaterial({ color: "#ffb062", toneMapped: false });
const glowCool = new THREE.MeshBasicMaterial({ color: "#9fd8ff", toneMapped: false });
const steel = new THREE.MeshStandardMaterial({ color: "#4a525c", roughness: 0.5, metalness: 0.5 });
const barrel = new THREE.MeshStandardMaterial({ color: "#2b3036", roughness: 0.4, metalness: 0.7 });
const charred = new THREE.MeshStandardMaterial({ color: "#14100e", roughness: 1 });
const domeMat = new THREE.MeshBasicMaterial({ color: "#6fe6ff", transparent: true, opacity: 0.85, toneMapped: false });
const baySolid = new THREE.MeshBasicMaterial({ color: "#ffcf8a", toneMapped: false });

// A soft round glow, for the engines' flares
let flareTexture: THREE.Texture | null = null;
function flare(): THREE.Texture {
  if (flareTexture) return flareTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.15, "rgba(255,226,170,0.95)");
  grad.addColorStop(0.45, "rgba(255,140,60,0.35)");
  grad.addColorStop(1, "rgba(255,90,20,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  flareTexture = new THREE.CanvasTexture(c);
  return flareTexture;
}

const SHIELD_VERT = `
varying vec3 vN; varying vec3 vLocal; varying vec3 vView;
void main() {
  vLocal = normalize( position );
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  vN = normalize( normalMatrix * normal );
  vView = normalize( - mv.xyz );
  gl_Position = projectionMatrix * mv;
}`;
const SHIELD_FRAG = `
uniform float uTime; uniform vec3 uColor; uniform vec4 uHits[4]; uniform float uOpacity; uniform float uScale;
varying vec3 vN; varying vec3 vLocal; varying vec3 vView;
float hexDist( vec2 p ) { p = abs( p ); float c = dot( p, normalize( vec2( 1.0, 1.73 ) ) ); return max( c, p.x ); }
float hexEdge( vec2 uv ) {
  vec2 r = vec2( 1.0, 1.73 );
  vec2 h = r * 0.5;
  vec2 a = mod( uv, r ) - h;
  vec2 b = mod( uv - h, r ) - h;
  vec2 g = dot( a, a ) < dot( b, b ) ? a : b;
  return smoothstep( 0.4, 0.5, hexDist( g ) );
}
void main() {
  vec3 L = normalize( vLocal );
  float fres = pow( 1.0 - abs( dot( normalize( vN ), normalize( vView ) ) ), 2.4 );
  // Two layers of cells at different depths: the inner one slides against the outer as the view turns, which is what makes the bubble look deep
  vec2 uv = vec2( atan( L.z, L.x ), asin( clamp( L.y, -1.0, 1.0 ) ) ) * uScale;
  vec2 shift = vView.xy * 0.4;
  float cells = hexEdge( uv ) * 0.55 + hexEdge( uv * 0.55 + shift + uTime * 0.03 ) * 0.4;
  float ripple = 0.0;
  for ( int i = 0; i < 4; i ++ ) {
    float age = uTime - uHits[ i ].w;
    if ( age > 0.0 && age < 1.8 ) {
      float d = acos( clamp( dot( L, uHits[ i ].xyz ), -1.0, 1.0 ) );
      float front = age * 0.8;
      float fade = 1.0 - age / 1.8;
      ripple += max( 0.0, sin( ( d - front ) * 24.0 ) ) * exp( - abs( d - front ) * 9.0 ) * fade + exp( - d * 10.0 ) * fade * 0.8;
    }
  }
  float a = ( fres * 0.32 + cells * ( 0.05 + fres * 0.22 ) + ripple * 0.55 ) * uOpacity;
  gl_FragColor = vec4( uColor * ( 1.0 + ripple * 1.4 ), clamp( a, 0.0, 0.9 ) );
}`;

function shieldMaterial() {
  const hits = Array.from({ length: 4 }, () => new THREE.Vector4(0, 1, 0, -10));
  const m = new THREE.ShaderMaterial({
    vertexShader: SHIELD_VERT,
    fragmentShader: SHIELD_FRAG,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color("#69c8ff") }, uHits: { value: hits }, uOpacity: { value: 1 }, uScale: { value: 14 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    toneMapped: false,
  });
  return m;
}

// The way a part faces: along the surface normal for the station, up or down for a ship's deck and keel
function partQuat(v: Vessel, part: Part): THREE.Quaternion {
  const up = new THREE.Vector3(0, 1, 0);
  if (v.cls === "Station") return new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(...part.at).normalize());
  return new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, part.at[1] < 0 ? -1 : 1, 0));
}

// `tips`: the glow at a turret's muzzles when it is about to fire; `fire`: the burning of a wreck; `died`: when a turret was shot out (the scene's
// clock), for the turret's head to be blown off and tumble away; `spin`: how it tumbles
interface PartRig { group: THREE.Group | null; wreck: THREE.Group | null; turret: THREE.Group | null; dome: THREE.Mesh | null; disc: THREE.Mesh | null; ring: THREE.Mesh | null; tips: THREE.Group | null; fire: THREE.Sprite | null; died: number; spin: THREE.Vector3 }
const DEBRIS = 1.6;
const newRig = (): PartRig => ({ group: null, wreck: null, turret: null, dome: null, disc: null, ring: null, tips: null, fire: null, died: -1, spin: new THREE.Vector3() });

export function CapitalShip({ vessel, livery, sim, rigs }: { vessel: Vessel; livery: Livery; sim: { current: { state: { vessels: Vessel[]; me: number } } }; rigs: { current: Map<number, CapitalRig> } }) {
  const tier = useQuality((q) => q.tier);
  const size = tier === "lite" ? 512 : 1024;
  const geo = useMemo(() => capitalGeometry(vessel.cls, vessel.role, vessel.id * 31 + 7), [vessel.cls, vessel.role, vessel.id]);
  useEffect(() => () => { geo.hull.dispose(); geo.dark.dispose(); geo.glow.dispose(); }, [geo]);
  const mat = useMemo(() => hullMaterial({ livery, size, parallax: tier === "lite" ? 0.0 : 0.03, steps: tier === "lite" ? 4 : 10, emissive: 1.4, side: THREE.FrontSide }), [livery, size, tier]);
  const bubbleMat = useMemo(shieldMaterial, []);
  const bubble = useRef<THREE.Mesh>(null);
  const partRigs = useRef<PartRig[]>(vessel.parts.map(newRig));
  const hitIndex = useRef(0);
  const half = CLASSES[vessel.cls].half;
  const bubbleScale: [number, number, number] = vessel.cls === "Station" ? [half[0] * 1.07, half[1] * 1.07, half[2] * 1.07] : vessel.cls === "Large" ? [half[0] * 1.5, half[1] * 3.4, half[2] * 1.7] : [half[0] * 1.38, half[1] * 1.7, half[2] * 1.5];

  useEffect(() => {
    rigs.current.set(vessel.id, {
      hit: (world, size2) => {
        const local = toLocal(vessel, world);
        // The bubble is scaled from a unit sphere, so the hit's direction is the point's direction in the hull's frame, unscaled
        const d = new THREE.Vector3(local[0] / bubbleScale[0], local[1] / bubbleScale[1], local[2] / bubbleScale[2]).normalize();
        const hits = bubbleMat.uniforms.uHits.value as THREE.Vector4[];
        const k = hitIndex.current++ % 4;
        hits[k].set(d.x, d.y, d.z, bubbleMat.uniforms.uTime.value);
        void size2;
      },
    });
    return () => void rigs.current.delete(vessel.id);
  }, [vessel, bubbleMat, rigs]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    bubbleMat.uniforms.uTime.value = t;
    const sheet = sim.current.state.vessels.find((v) => v.id === vessel.id);
    if (!sheet) return;
    const up = shielded(sheet);
    if (bubble.current) bubble.current.visible = up;
    const me = sim.current.state.vessels.find((v) => v.id === sim.current.state.me);
    sheet.parts.forEach((part, i) => {
      const rig = partRigs.current[i];
      if (!rig?.group) return;
      const turretKind = part.kind === "battery" || part.kind === "pd";
      // A turret shot out: its head is thrown off along the part's up and tumbles (and falls from sight), the mount burns where it stood
      if (turretKind && !part.alive && rig.died < 0) {
        rig.died = t;
        rig.spin.set(Math.sin(i * 12.9) * 6, Math.cos(i * 7.3) * 6, Math.sin(i * 3.1) * 6);
      }
      const debris = turretKind && rig.died >= 0 && t - rig.died < DEBRIS;
      rig.group.visible = part.alive || part.kind === "port" || debris;
      if (rig.wreck) rig.wreck.visible = !part.alive && part.kind !== "port";
      if (rig.turret && debris) {
        const age = t - rig.died;
        rig.turret.position.set(Math.sin(i * 5.3) * part.r * age * 1.5, part.r * (0.45 + age * 4 - age * age * 1.2), Math.cos(i * 2.7) * part.r * age * 1.5);
        rig.turret.rotation.set(rig.spin.x * age, rig.turret.rotation.y + 0.2, rig.spin.z * age);
        rig.turret.scale.setScalar(Math.max(0.05, 1 - age / DEBRIS));
      }
      if (rig.fire && !part.alive) {
        const flick = 1 + 0.35 * Math.sin(t * 13 + i * 2.1) + 0.2 * Math.sin(t * 7.7 + i);
        rig.fire.scale.setScalar(part.r * 2.2 * flick);
      }
      // A turret that is about to fire shows it at its muzzles
      if (rig.tips) rig.tips.visible = part.alive && part.wait < 0.45;
      if (part.kind === "generator" && rig.dome) {
        const mat2 = rig.dome.material as THREE.MeshBasicMaterial;
        mat2.opacity = 0.55 + 0.35 * Math.sin(t * 3 + i);
      }
      if (part.kind === "port") {
        if (rig.disc) {
          rig.disc.scale.setScalar(Math.max(0.001, 1 - part.open));
          rig.disc.visible = part.open < 0.999;
        }
        if (rig.ring) (rig.ring.material as THREE.MeshBasicMaterial).color.set(part.open >= 1 ? "#5dffb0" : "#ff5a4a");
      }
      if ((part.kind === "battery" || part.kind === "pd") && part.alive && rig.turret && me) {
        const l = toLocal(sheet, me.p);
        const q = partQuat(sheet, part);
        // In the part's own frame (y along its facing) the yaw is about that axis
        const local = new THREE.Vector3(l[0] - part.at[0], l[1] - part.at[1], l[2] - part.at[2]).applyQuaternion(q.clone().invert());
        rig.turret.rotation.y += (Math.atan2(-local.z, local.x) - rig.turret.rotation.y) * 0.1;
      }
      if (part.kind === "hangar" && rig.disc) {
        (rig.disc.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.3 * Math.sin(t * 2 + i);
      }
    });
  });

  const partView = (part: Part, i: number) => {
    const q = partQuat(vessel, part);
    const rig = partRigs.current[i];
    const r = part.r;
    const body = (() => {
      switch (part.kind) {
        case "generator":
          return (
            <>
              <mesh material={steel} position={[0, -r * 0.45, 0]}><cylinderGeometry args={[r * 0.5, r * 0.85, r * 0.9, 18]} /></mesh>
              <mesh material={steel} position={[0, r * 0.05, 0]}><cylinderGeometry args={[r * 0.72, r * 0.5, r * 0.25, 18]} /></mesh>
              <mesh ref={(el) => { rig.dome = el; }} material={domeMat.clone()} position={[0, r * 0.14, 0]}><sphereGeometry args={[r * 0.66, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
              <mesh material={glowCool} position={[0, r * 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[r * 0.7, r * 0.04, 6, 28]} /></mesh>
            </>
          );
        case "battery":
          return (
            <>
              <mesh material={steel}><cylinderGeometry args={[r * 0.85, r, r * 0.55, 14]} /></mesh>
              <group ref={(el) => { rig.turret = el; }} position={[0, r * 0.45, 0]}>
                <mesh material={steel} position={[0, 0, 0]}><boxGeometry args={[r * 1.1, r * 0.55, r * 1.1]} /></mesh>
                {[-0.3, 0.3].map((z) => (
                  <mesh key={z} material={barrel} position={[r * 1.3, r * 0.05, r * z]}><boxGeometry args={[r * 2.6, r * 0.22, r * 0.22]} /></mesh>
                ))}
                <group ref={(el) => { rig.tips = el; }} visible={false}>
                  {[-0.3, 0.3].map((z) => (
                    <mesh key={z} material={glowMat} position={[r * 2.65, r * 0.05, r * z]}><sphereGeometry args={[r * 0.2, 8, 6]} /></mesh>
                  ))}
                </group>
              </group>
            </>
          );
        case "pd":
          return (
            <>
              <mesh material={steel}><cylinderGeometry args={[r * 0.7, r * 0.9, r * 0.5, 10]} /></mesh>
              <group ref={(el) => { rig.turret = el; }} position={[0, r * 0.4, 0]}>
                <mesh material={steel}><sphereGeometry args={[r * 0.55, 10, 8]} /></mesh>
                {[-0.25, 0.25].flatMap((y) => [-0.25, 0.25].map((z) => (
                  <mesh key={`${y}${z}`} material={barrel} position={[r * 0.9, r * y, r * z]}><boxGeometry args={[r * 1.5, r * 0.12, r * 0.12]} /></mesh>
                )))}
                <group ref={(el) => { rig.tips = el; }} visible={false}>
                  {[-0.25, 0.25].flatMap((y) => [-0.25, 0.25].map((z) => (
                    <mesh key={`t${y}${z}`} material={glowMat} position={[r * 1.68, r * y, r * z]}><sphereGeometry args={[r * 0.14, 6, 5]} /></mesh>
                  )))}
                </group>
              </group>
            </>
          );
        case "hangar":
          return (
            <>
              <mesh material={dark} position={[0, 0.15, 0]}><boxGeometry args={[r * 2.4, 0.6, r * 2.6]} /></mesh>
              <mesh ref={(el) => { rig.disc = el; }} material={baySolid.clone()} position={[0, -0.1, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[r * 2.1, r * 2.3]} /></mesh>
            </>
          );
        case "port":
          return (
            <>
              <mesh ref={(el) => { rig.ring = el; }} material={new THREE.MeshBasicMaterial({ color: "#ff5a4a", toneMapped: false })}><torusGeometry args={[r, r * 0.07, 8, 40]} /></mesh>
              <mesh ref={(el) => { rig.disc = el; }} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[r * 0.95, 32]} /><meshBasicMaterial color="#ff3b2e" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>
              <mesh material={dark} position={[0, -r * 0.5, 0]}><cylinderGeometry args={[r * 1.05, r * 1.15, r, 24, 1, true]} /></mesh>
            </>
          );
      }
    })();
    return (
      <group key={part.id} position={part.at} quaternion={q}>
        <group ref={(el) => { rig.group = el; }}>{body}</group>
        {part.kind !== "port" && (
          <group ref={(el) => { rig.wreck = el; }} visible={false}>
            <mesh material={charred}><cylinderGeometry args={[r * 0.8, r * 1.0, r * 0.4, 8]} /></mesh>
            <mesh material={charred} position={[r * 0.3, r * 0.45, r * 0.1]} rotation={[0.3, 0.4, -0.9]}><boxGeometry args={[r * 1.1, r * 0.2, r * 0.2]} /></mesh>
            <mesh material={charred} position={[-r * 0.3, r * 0.3, -r * 0.3]} rotation={[0.5, 0, 0.7]}><boxGeometry args={[r * 0.6, r * 0.18, r * 0.5]} /></mesh>
            <sprite ref={(el) => { rig.fire = el; }} position={[0, r * 0.5, 0]}>
              <spriteMaterial map={flare()} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </sprite>
          </group>
        )}
      </group>
    );
  };

  return (
    <group>
      <mesh geometry={geo.hull} material={mat} />
      <mesh geometry={geo.dark} material={dark} />
      <mesh geometry={geo.glow} material={livery === "tunnel" ? glowCool : glowMat} />
      {geo.engines.map((e, i) => (
        <sprite key={i} position={e.at} scale={[e.r * 5, e.r * 5, 1]}>
          <spriteMaterial map={flare()} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
      {vessel.parts.map(partView)}
      {vessel.parts.length > 0 && (
        <mesh ref={bubble} scale={bubbleScale} material={bubbleMat} renderOrder={5}>
          <sphereGeometry args={[1, 48, 32]} />
        </mesh>
      )}
    </group>
  );
}

