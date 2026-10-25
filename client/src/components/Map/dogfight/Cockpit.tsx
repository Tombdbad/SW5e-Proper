// The dogfight's first-person view: the cockpit of the party's ship, drawn over the world. Each look follows the ship's exterior in
// models.tsx (`buildShip`): the X-winged fighter's frame of struts with its cannon tips in view, the Imperial fighter's ball with a round,
// spoked window, the shuttles' wide screens (the Imperial one boxy and heavy), the freighter's saucer with its pilot out in a tube on the
// starboard side and the mandibles to port, the corvette's long bridge slit and the Imperial warship's wedge deck seen from its tower.
// The cockpit is a scene of its own, drawn after the world with the depth cleared, so that nothing of the world cuts into it; it is built
// in the eye's own space (the eye at the origin, looking down -z) and the dash carries a screen with the ship's gauges.
import { createPortal, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ARENA, CLASSES, classIndex, hullSpec, type Dogfight, type DogfightInput, type Vessel } from "@shared/logic/dogfight";
import { isDown, partyOf, weaponSlots } from "@shared/logic/dogfightSim";
import { pickOf, shipClass } from "../models";
import type { ArenaSim } from "./ArenaScene";

export type View = "chase" | "cockpit";
export type CockpitStyle = "fighter" | "fighter-imperial" | "shuttle" | "shuttle-imperial" | "freighter" | "capital" | "capital-imperial";

// Which cockpit a ship has: the look of its exterior model (`shipClass` and the Imperial manner), and the bridge for the ships drawn as
// capital hulls (Large and up)
export function cockpitStyle(v: Pick<Vessel, "cls" | "role" | "imperial">): CockpitStyle {
  if (classIndex(v.cls) >= classIndex("Large")) return v.imperial ? "capital-imperial" : "capital";
  const kind = shipClass({ size: v.cls, role: v.role });
  if (kind === "capital") return v.imperial ? "capital-imperial" : "capital";
  if (kind === "freighter") return "freighter";
  return v.imperial ? (`${kind}-imperial` as CockpitStyle) : kind;
}

// Where the pilot sits, in the model's own units (x ahead, y up, z to starboard; the model is 6 long, drawn at the ship's length / 6): under the
// fighter's canopy, in the ball, behind the shuttles' screens, and in the freighter's tube out to starboard
const MODEL_EYE: Record<string, [number, number, number]> = {
  fighter: [0.4, 0.74, 0],
  "fighter-imperial": [0.1, 0.95, 0],
  shuttle: [1.55, 0.88, 0],
  "shuttle-imperial": [1.15, 0.8, 0],
  freighter: [1.3, 0.62, 1.87],
};
// The eye in the vessel's own frame, in metres. A capital ship's is on its bridge tower.
export function eyeOf(v: Pick<Vessel, "cls" | "role" | "imperial">): [number, number, number] {
  const style = cockpitStyle(v);
  if (style.startsWith("capital")) {
    const spec = hullSpec(v.cls, v.role);
    return [spec.tower[0] + 6, spec.deck + spec.tower[1] + 3, 0];
  }
  const s = CLASSES[v.cls].length / 6;
  const e = MODEL_EYE[style];
  return [e[0] * s, e[1] * s, e[2] * s];
}

// The camera in the pilot's seat: at the eye, looking where the ship's nose points, rolling with it
const QCAM = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
const _e = new THREE.Euler();
const _qs = new THREE.Quaternion();
const _eye = new THREE.Vector3();
export function placeEye(camera: THREE.Camera, v: Vessel, p: [number, number, number], yaw: number, pitch: number, roll: number) {
  _qs.setFromEuler(_e.set(roll, -yaw, pitch, "YZX"));
  const [ex, ey, ez] = eyeOf(v);
  _eye.set(ex, ey, ez).applyQuaternion(_qs);
  camera.position.set(p[0] + _eye.x, p[1] + _eye.y, p[2] + _eye.z);
  camera.quaternion.copy(_qs).multiply(QCAM);
}

// ---------------------------------------------------------------------------------------------
// Colours: the hull paints of the exterior models, and the light of the instruments
// ---------------------------------------------------------------------------------------------
interface Pal { hull: string; dark: string; trim: string; accent: string; glow: string; ink: string; warn: string; shield: string; screen: string; light: string; font: string }
const REPUBLIC: Pal = { hull: "#c3c8cc", dark: "#59636d", trim: "#2b2f36", accent: "#b8473e", glow: "#6fd6ff", ink: "#aeeaff", warn: "#ff6a5a", shield: "#38bdf8", screen: "#06141c", light: "#dfe9ff", font: "600 {n}px ui-sans-serif, system-ui, sans-serif" };
const IMPERIAL: Pal = { hull: "#8d949b", dark: "#2f343a", trim: "#1b1f24", accent: "#3a4048", glow: "#7dffb0", ink: "#a2ffc4", warn: "#ff8a4a", shield: "#5be0ff", screen: "#04100a", light: "#c9d6dc", font: "700 {n}px 'Courier New', ui-monospace, monospace" };
const palOf = (style: CockpitStyle, name: string): Pal => {
  if (style === "freighter") return { ...REPUBLIC, hull: pickOf(["#b9b1a0", "#a9b0b5", "#c2b8a3"], name), dark: "#6b655a", trim: "#34302b", accent: "#c98a3a", glow: "#ffd27a", ink: "#ffe3a0", screen: "#140d04", light: "#ffeccc" };
  return style.endsWith("imperial") ? IMPERIAL : REPUBLIC;
};

const rngOf = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
// A panel texture with its seams and rows of lights, and the same rows alone for the material to glow with
function panelMaps(pal: Pal, seed: number): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const make = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    return [c, c.getContext("2d")!] as const;
  };
  const [c, g] = make();
  const [ec, eg] = make();
  const r = rngOf(seed);
  g.fillStyle = pal.dark;
  g.fillRect(0, 0, 256, 256);
  eg.fillStyle = "#000";
  eg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 16; i++) {
    const x = r() * 220;
    const y = r() * 220;
    const w = 24 + r() * 90;
    const h = 16 + r() * 60;
    g.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "0,0,0"},${0.04 + r() * 0.1})`;
    g.fillRect(x, y, w, h);
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 2;
    g.strokeRect(x, y, w, h);
  }
  const lights = [pal.glow, pal.accent, pal.warn, pal.ink];
  for (let b = 0; b < 7; b++) {
    const x = 8 + r() * 200;
    const y = 8 + r() * 230;
    const cols = 2 + Math.floor(r() * 5);
    const rows = 1 + Math.floor(r() * 3);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (r() < 0.25) continue;
        const col = lights[Math.floor(r() * lights.length)];
        for (const ctx of [g, eg]) {
          ctx.fillStyle = col;
          ctx.fillRect(x + i * 6, y + j * 6, 3, 3);
        }
      }
    }
  }
  const tex = (cv: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return { map: tex(c), glow: tex(ec) };
}

// The gauges on the dash screen: hull and shield, speed and throttle, the active weapon, the target, the warnings
const SW = 512;
const SH = 256;
function drawConsole(g: CanvasRenderingContext2D, s: Dogfight, pal: Pal, t: number) {
  const me = partyOf(s);
  const sheet = me.c.sheet;
  const font = (n: number) => pal.font.replace("{n}", String(n));
  g.fillStyle = pal.screen;
  g.fillRect(0, 0, SW, SH);
  g.strokeStyle = pal.ink + "66";
  g.lineWidth = 3;
  g.strokeRect(5, 5, SW - 10, SH - 10);
  const bar = (x: number, y: number, w: number, label: string, v: number, max: number, color: string, flash = false) => {
    g.fillStyle = pal.ink;
    g.font = font(20);
    g.textAlign = "left";
    g.fillText(label, x, y);
    g.textAlign = "right";
    g.fillText(`${Math.max(0, Math.round(v))}/${Math.round(max)}`, x + w, y);
    g.fillStyle = "#ffffff22";
    g.fillRect(x, y + 6, w, 16);
    g.fillStyle = flash && Math.floor(t * 4) % 2 ? "#ffffff" : color;
    g.fillRect(x, y + 6, w * Math.max(0, Math.min(1, v / (max || 1))), 16);
  };
  const hullFrac = me.c.hull / sheet.hullMax;
  bar(20, 36, 230, "HULL", me.c.hull, sheet.hullMax, hullFrac > 0.6 ? "#4ade80" : hullFrac > 0.3 ? "#facc15" : "#ef4444", hullFrac < 0.3);
  if (sheet.hasShield) bar(20, 92, 230, me.calm > ARENA.partyWait && me.c.shield < sheet.shieldMax ? "SHIELD ↻" : "SHIELD", me.c.shield, sheet.shieldMax, pal.shield);
  // Speed and the throttle
  const speed = s.interior ? s.interior.craft.speed : me.speed;
  g.fillStyle = pal.ink;
  g.textAlign = "right";
  g.font = font(44);
  g.fillText(String(Math.round(speed)), SW - 70, 62);
  g.font = font(18);
  g.textAlign = "left";
  g.fillText("m/s", SW - 62, 62);
  // The throttle's setting is the bar (it holds); a tick on it is where the speed has got to
  const pace = me.top > 0 ? Math.max(0, Math.min(1, speed / me.top)) : 0;
  const setting = s.interior ? pace : s.throttle;
  g.fillStyle = "#ffffff22";
  g.fillRect(272, 78, 220, 14);
  g.fillStyle = pal.glow;
  g.fillRect(272, 78, 220 * setting, 14);
  g.fillStyle = "#ffffff";
  g.fillRect(272 + 220 * pace - 1, 74, 3, 22);
  g.font = font(14);
  g.fillStyle = pal.ink + "cc";
  g.fillText("THR", 272, 110);
  const roll = Math.round((me.roll * 180) / Math.PI);
  if (!s.interior && Math.abs(roll) > 2) g.fillText(`ROLL ${roll > 0 ? "+" : ""}${roll}°`, 372, 110);
  // The active weapon
  const slots = weaponSlots(me);
  const slot = slots[s.slot];
  g.font = font(22);
  g.fillStyle = slot && slot.ammo === 0 ? pal.warn : pal.ink;
  g.textAlign = "left";
  g.fillText(slot ? `▸ ${slot.name}${slot.ammo !== null ? ` ${slot.ammo}/${slot.ammoMax}` : ""}` : "no weapon", 20, 160);
  // The target
  const tv = (s.lock !== null ? s.vessels.find((v) => v.id === s.lock) : null) ?? (s.aim && s.aim.part !== -2 ? s.vessels.find((v) => v.id === s.aim!.vessel) : null);
  g.font = font(20);
  if (tv && !s.interior && !isDown(tv)) {
    g.fillStyle = pal.warn;
    g.fillText(`${tv.name}  ${Math.round(Math.hypot(tv.p[0] - me.p[0], tv.p[1] - me.p[1], tv.p[2] - me.p[2]))} m`, 20, 200);
    g.fillStyle = "#ffffff22";
    g.fillRect(20, 208, 230, 10);
    g.fillStyle = pal.warn;
    g.fillRect(20, 208, 230 * Math.max(0, Math.min(1, tv.c.hull / tv.c.sheet.hullMax)), 10);
  } else {
    g.fillStyle = pal.ink + "88";
    g.fillText(s.interior ? `GATE ${s.interior.gates}/${s.interior.tunnel.gates.length}` : "NO TARGET", 20, 200);
  }
  // Warnings, flashing
  const warn = s.warnings.missile > 0 ? "MISSILE" : s.warnings.outside > 0 ? "LEAVING ARENA" : hullFrac < 0.3 ? "HULL CRITICAL" : "";
  if (warn && Math.floor(t * 3) % 2) {
    g.fillStyle = pal.warn;
    g.fillRect(272, 130, 220, 40);
    g.fillStyle = "#000";
    g.font = font(22);
    g.textAlign = "center";
    g.fillText(warn, 382, 158);
  }
  // The clock
  const left = Math.max(0, s.limit - s.t);
  g.fillStyle = pal.ink;
  g.font = font(24);
  g.textAlign = "right";
  g.fillText(`${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`, SW - 20, 214);
  g.textAlign = "left";
}

// ---------------------------------------------------------------------------------------------
// The shapes
// ---------------------------------------------------------------------------------------------
type V3 = [number, number, number];
type Mat = "hull" | "dark" | "trim" | "accent" | "glow" | "ink" | "warn" | "panel" | "metal";
interface Prim { k: "box" | "cyl" | "sph" | "tor" | "pln" | "scr" | "quad"; p: V3; s: number[]; r?: V3; m?: Mat; seg?: number; pts?: V3[] }
// Things that move with the controls: the stick, the yoke, the throttle levers, the dice on their cord
interface Tool { k: "tool"; tool: "stick" | "yoke" | "levers" | "dice"; p: V3 }
interface Part { p?: V3; r?: V3; items: (Prim | Tool)[] }
interface Look { z: number; depth: number; hole: [number, number][]; parts: Part[] }

const tool = (name: Tool["tool"], p: V3): Tool => ({ k: "tool", tool: name, p });
const box = (p: V3, s: V3, m: Mat, r?: V3): Prim => ({ k: "box", p, s, m, r });
const cyl = (p: V3, rad: number, len: number, m: Mat, r: V3 = [Math.PI / 2, 0, 0], rTop = rad): Prim => ({ k: "cyl", p, s: [rTop, rad, len], m, r });
const sph = (p: V3, rad: number, m: Mat): Prim => ({ k: "sph", p, s: [rad], m });
const pln = (p: V3, w: number, h: number, m: Mat, r?: V3): Prim => ({ k: "pln", p, s: [w, h], m, r });
// A flat four-cornered piece, its corners given in the eye's space
const quad = (pts: V3[], m: Mat): Prim => ({ k: "quad", p: [0, 0, 0], s: [], pts, m });
const scr = (p: V3, w: number, h: number): Prim => ({ k: "scr", p, s: [w, h], r: [-Math.PI / 2, 0, 0] });
// A bar between two points of the plane at depth z
const bar = (a: [number, number], b: [number, number], z: number, w: number, d: number, m: Mat): Prim => ({ k: "box", p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z], s: [Math.hypot(b[0] - a[0], b[1] - a[1]), w, d], r: [0, 0, Math.atan2(b[1] - a[1], b[0] - a[0])], m });
const tor = (p: V3, R: number, tube: number, start: number, arc: number, m: Mat): Prim => ({ k: "tor", p, s: [R, tube, arc], r: [0, 0, start], m });
const ellipse = (a: number, b: number, cx: number, cy: number, n = 40): [number, number][] => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * a, cy + Math.sin((i / n) * Math.PI * 2) * b]);
// A row of small lit switches on a surface (local x from `x0` for `n` steps)
const switches = (x0: number, z: number, n: number, step: number, y: number, m: Mat = "glow"): Prim[] => Array.from({ length: n }, (_, i) => box([x0 + i * step, y, z], [0.045, 0.025, 0.045], i % 3 === 2 ? "accent" : m));
// The dash: a slab tilted toward the eye, with things on its top (local x across, local z toward the eye, its top at y = thick / 2)
const dash = (w: number, d: number, thick: number, at: V3, tilt: number, m: Mat, on: (top: number) => (Prim | Tool)[]): Part => ({
  p: at,
  r: [tilt, 0, 0],
  items: [box([0, 0, 0], [w, thick, d], m), ...on(thick / 2 + 0.004)],
});
const FILL = 7;

// The looks, one for each cockpit style. Depths are in front of the eye; the plate is the cockpit's wall, with the window cut out of it.
function lookOf(style: CockpitStyle): Look {
  switch (style) {
    case "fighter": {
      // A canopy of struts: the window narrows to the top, a short brace from the roof, the wing roots and the four cannon in view
      const Z = -1.55;
      const parts: Part[] = [
        { items: [bar([-1.62, 0.95], [1.62, 0.95], Z + 0.05, 0.13, 0.3, "dark"), bar([0, 0.95], [0, 0.62], Z + 0.05, 0.06, 0.2, "dark"), box([0, 1.7, -1.1], [6, 1.2, 1.6], "hull", [0.25, 0, 0]), box([0, 1.1, -1.25], [3.4, 0.045, 0.5], "accent", [0.25, 0, 0])] },
        // The wings: white slabs with the cannon out at their tips, glowing at the muzzle
        ...[-1, 1].map((sd): Part => ({
          items: [
            box([sd * 2.2, -0.02, -2.2], [1.3, 0.05, 2.6], "hull", [0, 0, sd * 0.45]),
            box([sd * 2.3, 0.1, -2.3], [0.5, 0.05, 1.4], "accent", [0, 0, sd * 0.45]),
            cyl([sd * 1.75, 0.5, -2.3], 0.035, 2.2, "trim"),
            sph([sd * 1.75, 0.5, -3.4], 0.05, "glow"),
            cyl([sd * 1.9, -0.28, -2.2], 0.035, 2.2, "trim"),
            sph([sd * 1.9, -0.28, -3.3], 0.05, "glow"),
          ],
        })),
        dash(3.9, 0.75, 0.28, [0, -0.7, -1.2], 0.38, "panel", (top) => [
          scr([0, top, -0.02], 1.15, 0.58),
          box([0, top - 0.005, -0.5], [3.9, 0.02, 0.1], "accent"),
          cyl([-1.05, top + 0.01, 0.0], 0.11, 0.02, "trim", [0, 0, 0]),
          cyl([-1.05, top + 0.025, 0.0], 0.04, 0.01, "glow", [0, 0, 0]),
          cyl([1.05, top + 0.01, 0.0], 0.11, 0.02, "trim", [0, 0, 0]),
          cyl([1.05, top + 0.025, 0.0], 0.04, 0.01, "ink", [0, 0, 0]),
          ...switches(-1.5, 0.3, 5, 0.1, top + 0.02),
          ...switches(0.95, 0.32, 5, 0.1, top + 0.02, "ink"),
          sph([1.6, top + 0.02, -0.15], 0.1, "glow"),
        ]),
        { items: [tool("stick", [0, -0.95, -0.5])] },
      ];
      return { z: Z, depth: 0.3, hole: [[-2.0, -0.55], [-1.62, 0.95], [1.62, 0.95], [2.0, -0.55]], parts };
    }
    case "fighter-imperial": {
      // A ball: a round window with spokes that stop short of the middle, grips either side of a small dash, consoles on the walls
      const Z = -2.1;
      const R = 1.12;
      const spokes = Array.from({ length: 8 }, (_, i): Prim => {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        return { k: "box", p: [Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78, Z + 0.1], s: [R * 0.5, 0.07, 0.1], r: [0, 0, a], m: "dark" };
      });
      const parts: Part[] = [
        { items: [tor([0, 0, Z + 0.1], R, 0.07, 0, Math.PI * 2, "trim"), tor([0, 0, Z + 0.12], R * 0.42, 0.025, 0, Math.PI * 2, "trim"), ...spokes] },
        { p: [-1.75, -0.2, -1.2], r: [0, 0.5, 0], items: [box([0, 0, 0], [0.14, 1.5, 1.0], "trim"), pln([0.075, 0.1, 0], 0.7, 1.1, "panel", [0, Math.PI / 2, 0])] },
        { p: [1.75, -0.2, -1.2], r: [0, -0.5, 0], items: [box([0, 0, 0], [0.14, 1.5, 1.0], "trim"), pln([-0.075, 0.1, 0], 0.7, 1.1, "panel", [0, -Math.PI / 2, 0])] },
        dash(2.6, 0.7, 0.26, [0, -0.64, -1.3], 0.45, "panel", (top) => [
          scr([0, top, -0.02], 1.0, 0.5),
          ...switches(-1.05, 0.28, 4, 0.1, top + 0.02),
          ...switches(0.65, 0.28, 4, 0.1, top + 0.02, "ink"),
          box([-0.75, top + 0.02, -0.12], [0.07, 0.03, 0.05], "warn"),
        ]),
        { items: [tool("yoke", [0, -0.98, -0.5])] },
      ];
      return { z: Z, depth: 0.5, hole: ellipse(R, R, 0, 0, 56), parts };
    }
    case "shuttle": {
      // A wide screen under a roof beam with a red stripe, two slim pillars and a short mullion, a long dash for two, a roof panel of switches
      const Z = -1.6;
      const parts: Part[] = [
        { items: [bar([-1.5, 0.98], [1.5, 0.98], Z + 0.05, 0.16, 0.3, "dark"), box([0, 1.1, Z + 0.1], [4.6, 0.04, 0.34], "accent"), bar([0, 0.98], [0, 0.66], Z + 0.05, 0.07, 0.2, "dark"), sph([0, 0.9, -0.6], 0.07, "ink")] },
        { p: [0, 1.0, -0.9], r: [-0.25, 0, 0], items: [box([0, 0, 0], [2.6, 0.12, 0.8], "trim"), ...switches(-1.1, 0.1, 10, 0.24, 0.07, "glow")] },
        // The wings forward-swept at the sides, red along their edges
        ...[-1, 1].map((sd): Part => ({ items: [box([sd * 2.4, -0.15, -2.3], [1.2, 0.06, 2.6], "hull", [0, sd * 0.3, sd * 0.2]), box([sd * 1.85, -0.12, -2.3], [0.07, 0.07, 2.6], "accent", [0, sd * 0.3, sd * 0.2])] })),
        dash(4.4, 0.8, 0.28, [0, -0.7, -1.2], 0.38, "panel", (top) => [
          scr([0, top, -0.02], 1.2, 0.56),
          scr([-1.4, top, 0.1], 0.7, 0.35),
          box([0, top - 0.005, -0.55], [4.4, 0.02, 0.12], "accent"),
          ...switches(-2.0, 0.4, 5, 0.12, top + 0.02),
          ...switches(1.05, 0.4, 8, 0.12, top + 0.02, "ink"),
          cyl([1.5, top + 0.02, 0.0], 0.16, 0.02, "trim", [0, 0, 0]),
          cyl([1.5, top + 0.035, 0.0], 0.11, 0.01, "glow", [0, 0, 0]),
        ]),
        { p: [0, -1.0, -0.75], items: [box([0, 0, 0], [0.6, 0.6, 0.9], "dark"), tool("levers", [0, 0.3, -0.1])] },
        { items: [tool("yoke", [0.55, -0.98, -0.5])] },
      ];
      const rr = (x: number, y: number): [number, number] => [x, y];
      return { z: Z, depth: 0.3, hole: [rr(-2.3, -0.5), rr(-2.15, 0.7), rr(-1.6, 0.98), rr(1.6, 0.98), rr(2.15, 0.7), rr(2.3, -0.5)], parts };
    }
    case "shuttle-imperial": {
      // Boxy and heavy: a thick lintel and sill, two dark mullions, a chevron of angled consoles, folded wings standing up at the sides
      const Z = -1.55;
      const parts: Part[] = [
        { items: [bar([-0.95, -0.4], [-0.95, 0.74], Z + 0.05, 0.1, 0.3, "trim"), bar([0.95, -0.4], [0.95, 0.74], Z + 0.05, 0.1, 0.3, "trim")] },
        ...[-1, 1].map((sd): Part => ({ items: [box([sd * 2.6, 0.4, -1.9], [0.14, 2.2, 2.2], "dark", [0, sd * 0.25, sd * 0.3]), box([sd * 2.5, 0.4, -1.9], [0.04, 2.0, 0.3], "accent", [0, sd * 0.25, sd * 0.3])] })),
        dash(1.9, 0.7, 0.28, [0, -0.64, -1.2], 0.42, "panel", (top) => [scr([0, top, -0.02], 1.05, 0.52), ...switches(-0.7, 0.3, 4, 0.1, top + 0.02), ...switches(0.4, 0.3, 4, 0.1, top + 0.02, "ink")]),
        ...[-1, 1].map((sd): Part => ({ p: [sd * 1.5, -0.68, -1.05], r: [0.45, sd * -0.5, 0], items: [box([0, 0, 0], [1.5, 0.3, 0.9], "panel"), ...switches(-0.5, 0.2, 5, 0.2, 0.17, sd < 0 ? "glow" : "ink")] })),
        { items: [tool("levers", [0, -0.9, -0.55])] },
      ];
      return { z: Z, depth: 0.5, hole: [[-1.85, -0.34], [-1.85, 0.62], [-1.6, 0.76], [1.6, 0.76], [1.85, 0.62], [1.85, -0.34]], parts };
    }
    case "freighter": {
      // Out in the tube on the starboard side: a wide round-cornered window crossed by struts, the mandibles of the hull to port, dice hanging
      // from the roof, a crowded dash with pipes
      const Z = -1.6;
      const parts: Part[] = [
        { items: [bar([-1.1, -0.62], [-1.0, 1.1], Z + 0.05, 0.1, 0.25, "dark"), bar([1.1, -0.62], [1.0, 1.1], Z + 0.05, 0.1, 0.25, "dark"), bar([-2.4, 0.58], [2.4, 0.58], Z + 0.05, 0.08, 0.25, "dark")] },
        // The hull's forward mandibles, to port and below
        { items: [box([-1.55, -0.55, -2.8], [0.9, 0.14, 3.6], "hull", [0, 0.02, 0.04]), box([-2.35, -0.5, -2.6], [0.8, 0.14, 3.4], "hull", [0, -0.05, 0.06]), box([-1.55, -0.47, -2.8], [0.05, 0.03, 3.6], "dark"), box([-2.35, -0.42, -2.6], [0.05, 0.03, 3.4], "accent")] },
        dash(4.2, 0.8, 0.3, [0, -0.72, -1.2], 0.38, "panel", (top) => [
          scr([-0.2, top, -0.02], 1.2, 0.56),
          box([-1.3, top + 0.04, -0.1], [0.5, 0.08, 0.35], "dark"),
          box([1.3, top + 0.05, 0.0], [0.7, 0.1, 0.4], "trim"),
          box([1.0, top + 0.1, -0.1], [0.2, 0.1, 0.2], "metal"),
          ...switches(-2.0, 0.42, 8, 0.15, top + 0.02, "accent"),
          ...switches(0.6, 0.42, 7, 0.14, top + 0.02),
          cyl([-2.05, top + 0.1, -0.35], 0.045, 4.0, "metal", [0, 0, Math.PI / 2]),
          cyl([-2.0, top + 0.06, -0.45], 0.03, 3.9, "dark", [0, 0, Math.PI / 2]),
        ]),
        { items: [tool("yoke", [-0.1, -0.98, -0.5]), tool("dice", [0.95, 0.62, -0.9])] },
        { p: [0, 1.0, -0.85], r: [-0.3, 0, 0], items: [box([0, 0, 0], [3.0, 0.14, 0.7], "dark"), ...switches(-1.2, 0.1, 9, 0.3, 0.09, "accent"), cyl([-0.9, -0.2, 0.1], 0.015, 0.4, "warn", [0, 0, 0]), cyl([0.5, -0.2, 0.2], 0.015, 0.45, "ink", [0, 0, 0])] },
      ];
      return { z: Z, depth: 0.3, hole: ellipse(2.5, 1.2, 0, 0.12, 48).filter(([, y]) => y >= -0.62), parts };
    }
    case "capital": {
      // A bridge: a long low window under a brow with a red stripe, mullions, the bow's deck beyond the glass, banks of consoles either side
      const Z = -1.5;
      const parts: Part[] = [
        { items: [...[-2.6, -1.5, 1.5, 2.6].map((x) => box([x, 0.1, Z + 0.05], [0.08, 0.8, 0.2], "dark")), box([0, 0.52, Z + 0.1], [FILL, 0.05, 0.3], "accent"), box([0, -0.32, -4.4], [0.9, 0.2, 4.0], "hull"), box([0, -0.21, -4.4], [0.05, 0.02, 4.0], "accent"), box([0, -0.28, -7.2], [3.4, 0.3, 1.3], "hull"), box([0, -0.12, -7.2], [3.4, 0.02, 0.1], "accent")] },
        ...[-1, 1].map((sd): Part => ({ p: [sd * 2.0, -0.7, -0.95], r: [0.42, sd * -0.35, 0], items: [box([0, 0, 0], [1.7, 0.35, 1.2], "panel"), scr([0, 0.185, 0], 0.9, 0.45), ...switches(-0.7, 0.4, 6, 0.13, 0.19)] })),
        dash(2.2, 0.75, 0.28, [0, -0.72, -1.15], 0.4, "panel", (top) => [scr([0, top, -0.02], 1.1, 0.55), ...switches(-1.0, 0.38, 8, 0.15, top + 0.02), box([0, top - 0.005, -0.45], [2.2, 0.02, 0.1], "accent")]),
        { items: [tool("levers", [0.8, -0.9, -0.6])] },
      ];
      return { z: Z, depth: 0.4, hole: [[-6.4, -0.3], [-6.4, 0.5], [6.4, 0.5], [6.4, -0.3]], parts };
    }
    case "capital-imperial": {
      // The tower of a warship: a tall canted window, the long wedge of the deck narrowing to the bow, crew pits with green screens
      const Z = -1.4;
      const parts: Part[] = [
        { items: [bar([-1.5, -0.45], [-1.5, 0.76], Z + 0.05, 0.1, 0.3, "trim"), bar([1.5, -0.45], [1.5, 0.76], Z + 0.05, 0.1, 0.3, "trim"), box([0, 0.9, Z + 0.1], [FILL, 0.04, 0.3], "accent")] },
        { items: [quad([[-2.2, -0.5, -1.5], [2.2, -0.5, -1.5], [0.6, -1.9, -14], [-0.6, -1.9, -14]], "hull"), quad([[-0.14, -0.49, -1.6], [0.14, -0.49, -1.6], [0.05, -1.89, -14], [-0.05, -1.89, -14]], "trim"), box([0, -0.62, -4.0], [1.0, 0.14, 0.7], "dark"), box([0, -0.7, -6.0], [0.16, 0.45, 0.16], "dark")] },
        ...[-1, 1].map((sd): Part => ({ p: [sd * 1.9, -0.62, -1.0], r: [0.42, sd * -0.45, 0], items: [box([0, 0, 0], [1.4, 0.3, 1.1], "panel"), scr([0, 0.16, 0], 0.8, 0.42), ...switches(-0.55, 0.38, 5, 0.14, 0.17)] })),
        dash(2.4, 0.75, 0.28, [0, -0.72, -1.1], 0.42, "panel", (top) => [scr([0, top, -0.02], 1.1, 0.55), ...switches(-1.0, 0.32, 8, 0.15, top + 0.02, "ink")]),
        { items: [tool("levers", [-0.8, -0.9, -0.55])] },
      ];
      return { z: Z, depth: 0.5, hole: [[-6.4, -0.45], [-2.7, 0.88], [2.7, 0.88], [6.4, -0.45]], parts };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The cockpit as a scene
// ---------------------------------------------------------------------------------------------
function Stick({ kind, p, input }: { kind: "stick" | "yoke" | "levers"; p: V3; input: { current: DogfightInput } }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!g.current) return;
    const st = input.current.steer;
    g.current.rotation.z += (-st.x * 0.45 - g.current.rotation.z) * 0.2;
    g.current.rotation.x += (st.y * 0.35 - g.current.rotation.x) * 0.2;
  });
  return (
    <group position={p}>
      <group ref={g}>
        {kind === "stick" && (
          <>
            <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.025, 0.035, 0.45, 8]} /><meshStandardMaterial color="#2b2f36" roughness={0.6} metalness={0.4} /></mesh>
            <mesh position={[0, 0.46, 0]}><sphereGeometry args={[0.06, 12, 8]} /><meshStandardMaterial color="#1b1f24" roughness={0.5} /></mesh>
            <mesh position={[0.03, 0.49, -0.03]}><sphereGeometry args={[0.018, 8, 6]} /><meshBasicMaterial color="#ff4a3a" /></mesh>
          </>
        )}
        {kind === "yoke" && (
          <>
            <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.03, 0.03, 0.34, 8]} /><meshStandardMaterial color="#2b2f36" roughness={0.6} metalness={0.4} /></mesh>
            <mesh position={[0, 0.34, 0]}><boxGeometry args={[0.62, 0.05, 0.08]} /><meshStandardMaterial color="#1b1f24" roughness={0.5} /></mesh>
            {[-1, 1].map((sd) => (<mesh key={sd} position={[sd * 0.3, 0.4, 0]}><boxGeometry args={[0.07, 0.17, 0.09]} /><meshStandardMaterial color="#14171b" roughness={0.6} /></mesh>))}
          </>
        )}
        {kind === "levers" && (
          <>
            {[-0.14, 0.14].map((x) => (<mesh key={x} position={[x, 0.17, 0]} rotation={[-0.25, 0, 0]}><cylinderGeometry args={[0.02, 0.025, 0.36, 8]} /><meshStandardMaterial color="#2b2f36" roughness={0.6} metalness={0.4} /></mesh>))}
            {[-0.14, 0.14].map((x) => (<mesh key={"k" + x} position={[x, 0.36, -0.05]}><sphereGeometry args={[0.045, 10, 8]} /><meshStandardMaterial color="#8a929a" roughness={0.4} metalness={0.7} /></mesh>))}
          </>
        )}
      </group>
    </group>
  );
}

// Two dice on a cord, swinging with the ship's turns
function Dice({ p, input }: { p: V3; input: { current: DogfightInput } }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.rotation.z = Math.sin(clock.elapsedTime * 1.4) * 0.05 - input.current.steer.x * 0.4;
    g.current.rotation.x = Math.cos(clock.elapsedTime * 1.1) * 0.04 + input.current.steer.y * 0.3;
  });
  return (
    <group ref={g} position={p}>
      <mesh position={[0, -0.07, 0]}><cylinderGeometry args={[0.003, 0.003, 0.14, 4]} /><meshBasicMaterial color="#d8d2c4" /></mesh>
      <mesh position={[0, -0.16, 0]} rotation={[0.4, 0.5, 0.2]}><boxGeometry args={[0.035, 0.035, 0.035]} /><meshStandardMaterial color="#e6c453" roughness={0.3} metalness={0.7} /></mesh>
      <mesh position={[0.05, -0.12, 0.005]} rotation={[0.2, 0.9, 0.5]}><boxGeometry args={[0.03, 0.03, 0.03]} /><meshStandardMaterial color="#e6c453" roughness={0.3} metalness={0.7} /></mesh>
    </group>
  );
}

// A flat piece from its four corners, facing up (the order is round the edge)
function Quad({ pts, material }: { pts: V3[]; material: THREE.Material }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(pts.flatMap((p) => [p[0] * 0.5, p[2] * 0.5]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }, [pts]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={material} />;
}

function Cockpit({ sim, input, style }: { sim: { current: ArenaSim }; input: { current: DogfightInput }; style: CockpitStyle }) {
  const root = useRef<THREE.Group>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const me = partyOf(sim.current.state);
  const pal = useMemo(() => palOf(style, me.name), [style, me.name]);
  const look = useMemo(() => lookOf(style), [style]);
  const maps = useMemo(() => panelMaps(pal, style.length * 97 + 11), [pal, style]);
  // The screen: drawn ten times a second
  const board = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = SW;
    c.height = SH;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { c, t, g: c.getContext("2d")!, last: -1 };
  }, []);
  const mats = useMemo(() => {
    const std = (color: string, rough: number, metal: number) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    const panel = new THREE.MeshStandardMaterial({ color: "#ffffff", map: maps.map, emissive: "#ffffff", emissiveMap: maps.glow, emissiveIntensity: 1.4, roughness: 0.7, metalness: 0.25 });
    const plate = new THREE.MeshStandardMaterial({ color: "#ffffff", map: maps.map, roughness: 0.75, metalness: 0.25 });
    maps.map.repeat.set(0.9, 0.9);
    return {
      hull: std(pal.hull, 0.55, 0.3), dark: std(pal.dark, 0.7, 0.25), trim: std(pal.trim, 0.8, 0.2), accent: std(pal.accent, 0.5, 0.2), metal: std("#8a929a", 0.3, 0.8),
      glow: new THREE.MeshBasicMaterial({ color: pal.glow, toneMapped: false }), ink: new THREE.MeshBasicMaterial({ color: pal.ink, toneMapped: false }), warn: new THREE.MeshBasicMaterial({ color: pal.warn, toneMapped: false }),
      panel, plate, scr: new THREE.MeshBasicMaterial({ map: board.t, toneMapped: false }),
    };
  }, [pal, maps, board]);
  useEffect(() => () => { Object.values(mats).forEach((m) => m.dispose()); maps.map.dispose(); maps.glow.dispose(); board.t.dispose(); }, [mats, maps, board]);
  // The wall with the window in it
  const plateGeo = useMemo(() => {
    const shape = new THREE.Shape([new THREE.Vector2(-FILL, -FILL), new THREE.Vector2(FILL, -FILL), new THREE.Vector2(FILL, FILL), new THREE.Vector2(-FILL, FILL)]);
    shape.holes.push(new THREE.Path(look.hole.map(([x, y]) => new THREE.Vector2(x, y)).reverse()));
    return new THREE.ExtrudeGeometry(shape, { depth: look.depth, bevelEnabled: false });
  }, [look]);
  useEffect(() => () => plateGeo.dispose(), [plateGeo]);

  useFrame(({ clock, size, camera }) => {
    const now = clock.elapsedTime;
    if (root.current) {
      // A narrow screen sees less to the side: the cockpit is drawn narrower so that its frame stays in view (scaling it about the eye
      // would change nothing, the angles being the same)
      root.current.scale.set(Math.max(0.4, Math.min(1, size.width / size.height / 1.78)), 1, 1);
    }
    if (now - board.last > 0.1) {
      board.last = now;
      drawConsole(board.g, sim.current.state, pal, now);
      board.t.needsUpdate = true;
    }
    // The sun lights the cockpit from where it is in the ship's own frame
    if (sun.current) sun.current.position.copy(SUN_DIR).applyQuaternion(_qi.copy(camera.quaternion).invert()).multiplyScalar(10);
  });

  const mat = (m: Mat | undefined) => (m ? (mats as Record<string, THREE.Material>)[m] : mats.hull);
  const item = (it: Part["items"][number], i: number) => {
    if (it.k === "tool") return it.tool === "dice" ? <Dice key={i} p={it.p} input={input} /> : <Stick key={i} kind={it.tool} p={it.p} input={input} />;
    const at = { position: it.p, rotation: it.r as V3 | undefined };
    switch (it.k) {
      case "box": return <mesh key={i} {...at} material={mat(it.m)}><boxGeometry args={it.s as V3} /></mesh>;
      case "cyl": return <mesh key={i} {...at} material={mat(it.m)}><cylinderGeometry args={[it.s[0], it.s[1], it.s[2], it.seg ?? 14]} /></mesh>;
      case "sph": return <mesh key={i} {...at} material={mat(it.m)}><sphereGeometry args={[it.s[0], 14, 10]} /></mesh>;
      case "tor": return <mesh key={i} {...at} material={mat(it.m)}><torusGeometry args={[it.s[0], it.s[1], 8, 56, it.s[2]]} /></mesh>;
      case "pln": return <mesh key={i} {...at} material={mat(it.m)}><planeGeometry args={[it.s[0], it.s[1]]} /></mesh>;
      case "scr": return <mesh key={i} {...at} material={mats.scr}><planeGeometry args={[it.s[0], it.s[1]]} /></mesh>;
      case "quad": return <Quad key={i} pts={it.pts!} material={mat(it.m)} />;
    }
  };
  return (
    <group ref={root}>
      <ambientLight intensity={1.1} color={pal.light} />
      <directionalLight ref={sun} intensity={2.2} color="#fff2dc" />
      <pointLight position={[0, -0.55, -0.55]} intensity={2.4} distance={5} decay={2} color={pal.glow} />
      <mesh geometry={plateGeo} material={mats.plate} position={[0, 0, look.z - look.depth]} />
      {look.parts.map((part, pi) => (
        <group key={pi} position={part.p} rotation={part.r}>
          {part.items.map(item)}
        </group>
      ))}
    </group>
  );
}
const SUN_DIR = new THREE.Vector3(0.55, 0.4, -0.45).normalize();
const _qi = new THREE.Quaternion();

// The pass that draws the world and then, in the cockpit view, the cockpit over it with the depth cleared. Taking over the drawing (a positive
// priority) means this runs in the chase view too.
export function CockpitLayer({ sim, input, view }: { sim: { current: ArenaSim }; input: { current: DogfightInput }; view: { current: View } }) {
  const scene = useMemo(() => new THREE.Scene(), []);
  const cam = useMemo(() => new THREE.PerspectiveCamera(70, 1.78, 0.05, 80), []);
  const style = useMemo(() => cockpitStyle(partyOf(sim.current.state)), [sim]);
  useFrame(({ gl, scene: world, camera, size }) => {
    gl.autoClear = false;
    gl.clear();
    gl.render(world, camera);
    if (view.current !== "cockpit") return;
    const shake = sim.current.shake;
    cam.position.set((Math.random() - 0.5) * shake * 0.05, (Math.random() - 0.5) * shake * 0.05, 0);
    cam.aspect = size.width / size.height;
    cam.fov = (camera as THREE.PerspectiveCamera).fov;
    cam.updateProjectionMatrix();
    gl.clearDepth();
    gl.render(scene, cam);
  }, 1);
  return createPortal(<Cockpit sim={sim} input={input} style={style} />, scene);
}
