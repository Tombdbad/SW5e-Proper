import React, { useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { babylonGl, BabylonRenderer } from "@/components/Map/babylon";
import * as CANNON from "cannon-es";
import * as THREE from "three";
import { Text } from "@react-three/drei";

// 3D dice model component
const DiceModel: React.FC<{
  size: number;
  sides: number;
  result?: number;
  rolling?: boolean;
}> = ({ size, sides, result, rolling = false }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [rotation, setRotation] = useState(() => new THREE.Euler(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2
  ));

  // Rotate the dice when rolling
  useFrame(() => {
    if (!meshRef.current || !rolling) return;
    
    meshRef.current.rotation.x += 0.05;
    meshRef.current.rotation.y += 0.08;
    meshRef.current.rotation.z += 0.03;
  });

  // Update rotation when the result changes
  useEffect(() => {
    if (!rolling && result) {
      setRotation(new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      ));
    }
  }, [result, rolling]);

  // Get appropriate geometry based on dice sides
  const getGeometry = () => {
    switch (sides) {
      case 4:
        return <tetrahedronGeometry args={[size * 0.8, 0]} />;
      case 6:
        return <boxGeometry args={[size, size, size]} />;
      case 8:
        return <octahedronGeometry args={[size * 0.7, 0]} />;
      case 10:
        // Approximation - in a real app would need a custom geometry
        return <dodecahedronGeometry args={[size * 0.6, 0]} />;
      case 12:
        return <dodecahedronGeometry args={[size * 0.6, 0]} />;
      case 20:
        return <icosahedronGeometry args={[size * 0.6, 0]} />;
      default:
        return <boxGeometry args={[size, size, size]} />;
    }
  };

  return (
    <mesh ref={meshRef} rotation={[rotation.x, rotation.y, rotation.z]}>
      {getGeometry()}
      <meshStandardMaterial 
        color={sides === 20 ? "#bb3333" : "#dddddd"} 
        roughness={0.3}
        metalness={0.2}
      />
      
      {result && !rolling && (
        <Text
          position={[0, 0, size * 0.6]}
          fontSize={size * 0.5}
          color="black"
          anchorX="center"
          anchorY="middle"
        >
          {result}
        </Text>
      )}
    </mesh>
  );
};

// Main Dice component that renders the 3D dice
export const Dice: React.FC<{
  size?: number;
  sides?: number;
  result?: number;
  rolling?: boolean;
  onRoll?: (result: number) => void;
}> = ({ size = 30, sides = 20, result, rolling, onRoll }) => {
  return (
    <div style={{ width: size * 3, height: size * 3 }}>
      <Canvas gl={babylonGl} camera={{ position: [0, 0, size * 3], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={0.5} />
        <DiceModel 
          size={size / 10} 
          sides={sides} 
          result={result} 
          rolling={rolling} 
        />
      </Canvas>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// The dice table (2026-10-31, moved in from public/dice/roller.html, which drew it with three r128 and cannon.js from a CDN in a frame of
// its own): the dice a roll needs are thrown over the whole screen, settle, and their faces are read. The dice are three.js geometry
// drawn by the Babylon renderer (Map/babylon.ts), thrown by cannon-es. DiceRoller.tsx loads this when the first roll is asked for.
// ---------------------------------------------------------------------------------------------
type V3 = THREE.Vector3;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const PHI = (1 + Math.sqrt(5)) / 2;
const cyc = (a: number, b: number) => {
  const o: V3[] = [];
  for (const s of [1, -1]) for (const t of [1, -1]) o.push(V(0, s * a, t * b), V(s * a, t * b, 0), V(t * b, 0, s * a));
  return o;
};
const cyc2 = (a: number, b: number) => {
  const o: V3[] = [];
  for (const s of [1, -1]) for (const t of [1, -1]) o.push(V(0, s * b, t * a), V(s * a, 0, t * b), V(t * b, s * a, 0));
  return o;
};
const CUBE: V3[] = [];
for (const x of [1, -1]) for (const y of [1, -1]) for (const z of [1, -1]) CUBE.push(V(x, y, z));
const AXES = [V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, -1, 0), V(0, 0, 1), V(0, 0, -1)];
// A d10 is a pentagonal trapezohedron: planar kite faces need the apex at b = a(1 + cos 36) / (1 - cos 36)
const C36 = Math.cos(Math.PI / 5), A10 = (1 - C36) / (1 + C36);
const D10_VERTS = [V(0, 1, 0), V(0, -1, 0)];
for (let i = 0; i < 5; i++) D10_VERTS.push(V(Math.cos(i * 1.2566), A10, Math.sin(i * 1.2566)));
for (let i = 0; i < 5; i++) D10_VERTS.push(V(Math.cos(i * 1.2566 + 0.6283), -A10, Math.sin(i * 1.2566 + 0.6283)));
const D10_FACES: number[][] = [];
for (let i = 0; i < 5; i++) D10_FACES.push([0, 2 + i, 7 + i, 2 + ((i + 1) % 5)]);
for (let i = 0; i < 5; i++) D10_FACES.push([1, 7 + i, 2 + ((i + 1) % 5), 7 + ((i + 1) % 5)]);
const SHAPES: Record<string, { verts: V3[]; normals?: V3[]; faces?: number[][]; R: number }> = {
  d4: { verts: [V(1, 1, 1), V(1, -1, -1), V(-1, 1, -1), V(-1, -1, 1)], normals: [V(-1, -1, -1), V(-1, 1, 1), V(1, -1, 1), V(1, 1, -1)], R: 1.25 },
  d6: { verts: CUBE, normals: AXES, R: 1.1 },
  d8: { verts: AXES, normals: CUBE, R: 1.15 },
  d10: { verts: D10_VERTS, faces: D10_FACES, R: 1.25 },
  d12: { verts: CUBE.concat(cyc(1 / PHI, PHI)), normals: cyc2(1, PHI), R: 1.25 },
  d20: { verts: cyc(1, PHI), normals: CUBE.concat(cyc2(1 / PHI, PHI)), R: 1.3 },
};
// The dice are built and reported in this order (lib/sw5e/dice.ts PAGE_ORDER)
const DIE_ORDER = ["d4", "d6", "d8", "d10", "d12", "d20"];
const DICE_COLOUR = "#2e86de", TABLE_COLOUR = "#2f8a58";

interface DieFace { idx: number[]; n: V3; c: V3; val?: number }
const angleIn = (d: V3, u: V3, w: V3) => Math.atan2(d.dot(w), d.dot(u));
// A face's corners in turn about its outward normal
function orient(idx: number[], vs: V3[]): DieFace {
  const c = new THREE.Vector3();
  idx.forEach((i) => c.add(vs[i]));
  c.divideScalar(idx.length);
  const n = new THREE.Vector3().crossVectors(vs[idx[1]].clone().sub(vs[idx[0]]), vs[idx[2]].clone().sub(vs[idx[0]])).normalize();
  if (n.dot(c) < 0) n.negate();
  const u = vs[idx[0]].clone().sub(c).normalize(), w = new THREE.Vector3().crossVectors(n, u);
  return { idx: idx.slice().sort((a, b) => angleIn(vs[a].clone().sub(c), u, w) - angleIn(vs[b].clone().sub(c), u, w)), n, c };
}
function faceByNormal(vs: V3[], normal: V3) {
  const n = normal.clone().normalize();
  const most = Math.max(...vs.map((v) => v.dot(n)));
  return vs.map((v, i) => (v.dot(n) > most - 1e-4 ? i : -1)).filter((i) => i >= 0);
}
// The die's triangles with its edges and corners bevelled (each face shrunk toward its middle by t)
function bevel(vs: V3[], faces: DieFace[], t: number) {
  const tris: V3[][] = [], P = new Map<string, V3>();
  faces.forEach((f, fi) => f.idx.forEach((vi) => P.set(`${fi}_${vi}`, vs[vi].clone().lerp(f.c, t))));
  const poly = (pts: V3[]) => {
    for (let k = 1; k < pts.length - 1; k++) tris.push([pts[0], pts[k], pts[k + 1]]);
  };
  faces.forEach((f, fi) => poly(f.idx.map((vi) => P.get(`${fi}_${vi}`)!)));
  faces.forEach((f, fi) =>
    f.idx.forEach((a, k) => {
      const b = f.idx[(k + 1) % f.idx.length];
      const gi = faces.findIndex((g, j) => j > fi && g.idx.includes(a) && g.idx.includes(b));
      if (gi >= 0) poly([P.get(`${fi}_${a}`)!, P.get(`${fi}_${b}`)!, P.get(`${gi}_${b}`)!, P.get(`${gi}_${a}`)!]);
    }),
  );
  vs.forEach((v, vi) => {
    const around = faces.map((_, i) => i).filter((i) => faces[i].idx.includes(vi));
    if (around.length < 3) return;
    const ax = v.clone().normalize(), u = new THREE.Vector3().crossVectors(ax, Math.abs(ax.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).normalize(), w = new THREE.Vector3().crossVectors(ax, u);
    around.sort((i, j) => angleIn(faces[i].c.clone().sub(v), u, w) - angleIn(faces[j].c.clone().sub(v), u, w));
    poly(around.map((i) => P.get(`${i}_${vi}`)!));
  });
  return tris;
}

interface DieKind { type: string; vs: V3[]; faces: DieFace[]; geo: THREE.BufferGeometry; mat: THREE.Material; decals: THREE.Mesh[]; shape: CANNON.ConvexPolyhedron }
const KINDS: Record<string, DieKind> = {};
function dieKind(type: string): DieKind {
  if (KINDS[type]) return KINDS[type];
  const s = SHAPES[type];
  const scale = s.R / Math.max(...s.verts.map((v) => v.length()));
  const vs = s.verts.map((v) => v.clone().multiplyScalar(scale));
  const faces = (s.faces ?? s.normals!.map((n) => faceByNormal(vs, n))).map((f) => orient(f, vs));
  // Opposite faces add up to the sides plus one (a d10's to 9, its faces 0 to 9)
  const N = +type.slice(1), sum = type === "d10" ? 9 : N + 1;
  if (type !== "d4") {
    const done = new Set<number>();
    let p = 0;
    faces.forEach((f, i) => {
      if (done.has(i)) return;
      const j = faces.findIndex((g, k) => k !== i && g.n.dot(f.n) < -0.999), a = type === "d10" ? 2 * p + 1 : p + 1;
      f.val = a;
      faces[j].val = sum - a;
      done.add(i);
      done.add(j);
      p++;
    });
  }
  const pos: number[] = [], nor: number[] = [];
  for (let [a, b, c] of bevel(vs, faces, 0.1)) {
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    if (n.dot(a.clone().add(b).add(c)) < 0) {
      [b, c] = [c, b];
      n.negate();
    }
    for (const v of [a, b, c]) {
      pos.push(v.x, v.y, v.z);
      nor.push(n.x, n.y, n.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  const mat = new THREE.MeshStandardMaterial({ color: DICE_COLOUR, roughness: 0.35, metalness: 0.15 });
  // Each face's number on a card just over it (a d4's three numbers at its corners)
  const decals = faces.map((f) => {
    const u = vs[f.idx[0]].clone().sub(f.c).normalize(), xa = new THREE.Vector3().crossVectors(u, f.n);
    const P = f.idx.map((i) => {
      const d = vs[i].clone().sub(f.c);
      return { X: d.dot(xa), Y: d.dot(u) };
    });
    const Rf = Math.max(...P.map((p) => Math.hypot(p.X, p.Y)));
    let rin = 1e9;
    f.idx.forEach((a, k) => {
      const A = vs[a], B = vs[f.idx[(k + 1) % f.idx.length]], e = B.clone().sub(A).normalize(), d = f.c.clone().sub(A);
      rin = Math.min(rin, d.sub(e.multiplyScalar(d.dot(e))).length());
    });
    const k = 60 / Rf, cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const x = cv.getContext("2d")!;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.lineJoin = "round";
    x.fillStyle = "#ffffff";
    x.strokeStyle = "rgba(0,0,0,.6)";
    const draw = (t: string, X: number, Y: number, rot: number, fs: number) => {
      x.save();
      x.translate(64 + X * k, 64 - Y * k);
      x.rotate(rot);
      x.font = `bold ${fs}px sans-serif`;
      x.lineWidth = fs * 0.14;
      x.strokeText(t, 0, 0);
      x.fillText(t, 0, 0);
      if (t === "6" || t === "9") x.fillRect(-fs * 0.2, fs * 0.45, fs * 0.4, fs * 0.08);
      x.restore();
    };
    if (type === "d4") f.idx.forEach((vi, q) => draw(String(vi + 1), P[q].X * 0.5, P[q].Y * 0.5, Math.atan2(P[q].X, P[q].Y), rin * k * 0.95));
    else draw(String(f.val), 0, 0, 0, rin * k * (String(f.val).length > 1 ? 1 : 1.3));
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * Rf, 2 * Rf), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.matrixAutoUpdate = false;
    m.matrix.makeBasis(xa, u, f.n).setPosition(f.c.clone().add(f.n.clone().multiplyScalar(0.004)));
    return m;
  });
  const shape = new CANNON.ConvexPolyhedron({ vertices: vs.map((v) => new CANNON.Vec3(v.x, v.y, v.z)), faces: faces.map((f) => f.idx) });
  return (KINDS[type] = { type, vs, faces, geo, mat, decals, shape });
}

export interface DiceTable {
  // Throws these dice (`id` is the roll's, handed back with the faces)
  roll(id: number, dice: string[]): void;
  dispose(): void;
}
// The table on a canvas: `onText` says what is shown over it (the total, each die), `onResult` the faces once they settle (in DIE_ORDER)
export function diceTable(canvas: HTMLCanvasElement, onText: (total: string, chips: string) => void, onResult: (id: number, values: number[]) => void): DiceTable {
  const ren = new BabylonRenderer(canvas);
  ren.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  ren.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14181c);
  const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55), new THREE.HemisphereLight(0xffffff, 0x556655, 0.8));
  const lamp = new THREE.PointLight(0xfff2dd, 0.9, 60);
  lamp.position.set(0, 18, 2);
  scene.add(lamp);
  const sun = new THREE.DirectionalLight(0xffffff, 1.3);
  sun.position.set(6, 16, 8);
  sun.castShadow = true;
  scene.add(sun);
  const W = 8.5, Z0 = -6, Z1 = 7;
  // The baize, lit (it takes the dice's shadows), and the wooden rails round it
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, Z1 - Z0), new THREE.MeshLambertMaterial({ color: TABLE_COLOUR }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = (Z0 + Z1) / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.7 });
  for (const [x, z, w, d] of [[0, Z0 - 0.5, 2 * W + 2, 1], [0, Z1 + 0.5, 2 * W + 2, 1], [-W - 0.5, (Z0 + Z1) / 2, 1, Z1 - Z0], [W + 0.5, (Z0 + Z1) / 2, 1, Z1 - Z0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), wood);
    m.position.set(x, 0.6, z);
    m.receiveShadow = true;
    scene.add(m);
  }
  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight, a = w / h;
    ren.setSize(w, h, false);
    cam.aspect = a;
    cam.updateProjectionMatrix();
    const f = Math.max(1, 1.7 / a);
    cam.position.set(0, 17 * f, 11 * f);
    cam.lookAt(0, 0, 0.5);
  };
  window.addEventListener("resize", resize);
  resize();

  // The physics: the table, its rails and a lid, as planes
  const world = new CANNON.World();
  world.gravity.set(0, -40, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  (world.solver as CANNON.GSSolver).iterations = 20;
  world.defaultContactMaterial.friction = 0.4;
  world.defaultContactMaterial.restitution = 0.25;
  for (const [x, y, z, ax, ay, az, a] of [[0, 0, 0, 1, 0, 0, -Math.PI / 2], [0, 12, 0, 1, 0, 0, Math.PI / 2], [-W, 0, 0, 0, 1, 0, Math.PI / 2], [W, 0, 0, 0, 1, 0, -Math.PI / 2], [0, 0, Z0, 0, 1, 0, 0], [0, 0, Z1, 0, 1, 0, Math.PI]]) {
    const b = new CANNON.Body({ mass: 0 });
    b.addShape(new CANNON.Plane());
    b.quaternion.setFromAxisAngle(new CANNON.Vec3(ax, ay, az), a);
    b.position.set(x, y, z);
    world.addBody(b);
  }

  // The dice: none until a roll asks for some; held over the table, then thrown (or dragged and flicked)
  interface Die { D: DieKind; g: THREE.Group; b: CANNON.Body; ok: boolean }
  let dice: Die[] = [], held = false, trail: { t: number; x: number; z: number }[] = [], okTime = 0, reported = false, locked = false, reqId = 0, fallback = 0;
  const ptr = V(0, 4, 4);
  const counts: Record<string, number> = {};
  const offs = (i: number) => {
    const n = dice.length, c = Math.ceil(Math.sqrt(n)), r = Math.ceil(n / c);
    return [((i % c) - (c - 1) / 2) * 3.1, (Math.floor(i / c) - (r - 1) / 2) * 3.1];
  };
  const pickUp = () => {
    held = true;
    reported = false;
    okTime = 0;
    for (const d of dice) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      d.b.quaternion.set(q.x, q.y, q.z, q.w);
      d.ok = false;
    }
  };
  const release = (v: V3) => {
    held = false;
    const sp = Math.hypot(v.x, v.z);
    if (sp < 6) v = V((Math.random() - 0.5) * 6, 0, -16);
    else if (sp > 45) v.multiplyScalar(45 / sp);
    const s = Math.hypot(v.x, v.z);
    for (const d of dice) {
      d.b.velocity.set(v.x + (Math.random() - 0.5) * 3, -2, v.z + (Math.random() - 0.5) * 3);
      d.b.angularVelocity.set(...([0, 0, 0].map(() => (Math.random() - 0.5) * 2 * (12 + s * 0.6)) as [number, number, number]));
    }
  };
  const rebuild = () => {
    for (const d of dice) {
      scene.remove(d.g);
      world.removeBody(d.b);
    }
    dice = [];
    for (const t of DIE_ORDER)
      for (let i = 0; i < (counts[t] ?? 0); i++) {
        const D = dieKind(t), g = new THREE.Group(), m = new THREE.Mesh(D.geo, D.mat);
        m.castShadow = true;
        g.add(m, ...D.decals.map((x) => x.clone()));
        const b = new CANNON.Body({ mass: 1 });
        b.addShape(D.shape);
        b.linearDamping = 0.12;
        b.angularDamping = 0.25;
        world.addBody(b);
        scene.add(g);
        dice.push({ D, g, b, ok: false });
      }
    pickUp();
    ptr.set(0, 4, 4);
    setTimeout(() => {
      if (!held) return;
      release(V(0, 0, -16));
    }, 50);
    onText("Rolling…", "");
  };

  // Drag and flick: the dice follow the pointer over the table and fly off the way it was moving
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(V(0, 1, 0), -4);
  const at = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)), cam);
    return ray.ray.intersectPlane(plane, V(0, 0, 0));
  };
  const onDown = (e: PointerEvent) => {
    if (locked) return;
    const p = at(e);
    if (!p) return;
    pickUp();
    ptr.copy(p);
    trail = [{ t: performance.now(), x: p.x, z: p.z }];
    canvas.setPointerCapture(e.pointerId);
    onText("…", "");
  };
  const onMove = (e: PointerEvent) => {
    if (!held || !trail.length) return;
    const p = at(e);
    if (!p) return;
    ptr.copy(p);
    trail.push({ t: performance.now(), x: p.x, z: p.z });
    if (trail.length > 40) trail.shift();
  };
  const onUp = () => {
    if (!held || !trail.length) return;
    const now = performance.now(), recent = trail.filter((s) => now - s.t < 120);
    const v = V(0, 0, 0);
    if (recent.length > 1) {
      const a = recent[0], b = recent[recent.length - 1], dt = (b.t - a.t) / 1000;
      if (dt > 0.016) v.set((b.x - a.x) / dt, 0, (b.z - a.z) / dt);
    }
    trail = [];
    release(v);
    onText("Rolling…", "");
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  // Settling: a die nearly at rest is eased onto its nearest face; the faces are read once all have lain still for half a second
  const down = V(0, -1, 0), tq = new THREE.Quaternion(), tmp = V(0, 0, 0);
  const assist = (d: Die, dt: number) => {
    const b = d.b;
    d.ok = false;
    if (b.velocity.length() > 0.9 || b.angularVelocity.length() > 1.4 || b.position.y > 3.5) return;
    tq.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    let best = V(0, 0, 0), by = 9;
    for (const f of d.D.faces) {
      tmp.copy(f.n).applyQuaternion(tq);
      if (tmp.y < by) {
        by = tmp.y;
        best = tmp.clone();
      }
    }
    const err = Math.acos(Math.min(1, Math.max(-1, best.dot(down))));
    if (err > 0.004) {
      const target = new THREE.Quaternion().setFromUnitVectors(best, down).multiply(tq.clone());
      tq.slerp(target, Math.min(1, dt * 9));
      b.quaternion.set(tq.x, tq.y, tq.z, tq.w);
    }
    if (err < 0.012) {
      b.angularVelocity.set(0, 0, 0);
      d.ok = true;
    }
  };
  const read = (d: Die) => {
    tq.set(d.b.quaternion.x, d.b.quaternion.y, d.b.quaternion.z, d.b.quaternion.w);
    let best = -9, val = 1;
    // (a d4 shows the number at its top corner)
    if (d.D.type === "d4")
      d.D.vs.forEach((v, i) => {
        const y = tmp.copy(v).applyQuaternion(tq).y;
        if (y > best) [best, val] = [y, i + 1];
      });
    else
      for (const f of d.D.faces) {
        const y = tmp.copy(f.n).applyQuaternion(tq).y;
        if (y > best) [best, val] = [y, f.val!];
      }
    return val;
  };
  const report = () => {
    locked = true;
    let total = 0;
    const values = dice.map(read);
    const parts = dice.map((d, i) => {
      total += d.D.type === "d10" && values[i] === 0 ? 10 : values[i];
      return `${d.D.type.toUpperCase()}: ${values[i]}`;
    });
    onText(dice.length ? `Total: ${total}` : "No dice selected", parts.join("  ·  ") + (counts.d10 ? "   (D10 “0” counts as 10)" : ""));
    onResult(reqId, values);
  };

  let last = performance.now(), loop = 0;
  const frame = (now: number) => {
    loop = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (held) {
      const c = Math.ceil(Math.sqrt(dice.length)), hx = Math.max(0, ((c - 1) / 2) * 3.1) + 1.5;
      dice.forEach((d, i) => {
        const [ox, oz] = offs(i), b = d.b;
        const tz = Math.max(Z0 + 2 + Math.abs(oz), Math.min(Z1 - 2 - Math.abs(oz), ptr.z + oz));
        const px = Math.max(-W + 1.6, Math.min(W - 1.6, Math.max(-W + hx, Math.min(W - hx, ptr.x)) + ox));
        b.position.set(b.position.x + (px - b.position.x) * 0.45, 4, b.position.z + (tz - b.position.z) * 0.45);
        b.velocity.set(0, 0, 0);
        b.angularVelocity.set(3, 4, 2);
      });
    }
    world.step(1 / 120, dt, 4);
    if (!held) {
      let all = dice.length > 0;
      for (const d of dice) {
        assist(d, dt);
        if (!d.ok) all = false;
      }
      okTime = all ? okTime + dt : 0;
      if (okTime > 0.5 && !reported) {
        reported = true;
        report();
      }
    }
    for (const d of dice) {
      const b = d.b;
      if (b.position.y < -3 || Math.abs(b.position.x) > W + 2) {
        b.position.set(0, 4, 2);
        b.velocity.set(0, 0, 0);
      }
      d.g.position.set(b.position.x, b.position.y, b.position.z);
      d.g.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }
    // (not while the table is hidden between rolls)
    if (canvas.clientWidth) ren.render(scene, cam);
  };
  loop = requestAnimationFrame(frame);

  return {
    roll(id, list) {
      reqId = id;
      locked = false;
      resize();
      for (const t of DIE_ORDER) counts[t] = 0;
      for (const t of list) counts[t] = (counts[t] ?? 0) + 1;
      rebuild();
      // (a die that will not settle is read where it lies)
      clearTimeout(fallback);
      fallback = window.setTimeout(() => {
        if (!reported && !held) {
          reported = true;
          report();
        }
      }, 8000);
    },
    dispose() {
      cancelAnimationFrame(loop);
      clearTimeout(fallback);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      ren.dispose();
    },
  };
}
