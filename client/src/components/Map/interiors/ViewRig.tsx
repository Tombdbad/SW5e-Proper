// The camera of the over-the-shoulder and first-person views (2026-10-19), in place of the overhead Rig and its OrbitControls: it follows
// the character, turns by dragging (or the arrow keys), walks by W A S D or the stick through the map's own walk (`step`, which queues
// squares into the party's path so that traps, secret ways and arrivals all still happen), and aims with a crosshair at the middle of the
// canvas. What is under it comes from `aimAt` (aim.ts); the action key, button and Enter call the target's own tap handler.
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { paceOf, STICK, useRun } from "./stick";
import { AIM, aimAt, FEET_PER_SQUARE, lookDirection, PITCH, poseOf, rightOf, useReticle, useView, type Aimed, type ViewMode } from "./aim";

type V3 = [number, number, number];

// Stick and action button over the canvas, and the crosshair at its middle (a separate DOM root: the canvas has no DOM children)
function Overlay({ stick, use }: { stick: { current: [number, number] }; use: () => void }) {
  const r = useReticle();
  const run = useRun((x) => x.run);
  const pad = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const box = pad.current!.getBoundingClientRect();
    const [dx, dy] = [e.clientX - (box.left + box.width / 2), e.clientY - (box.top + box.height / 2)];
    const k = Math.min(1, Math.hypot(dx, dy) / STICK.travel);
    const a = Math.atan2(dy, dx);
    stick.current = [Math.cos(a) * k, -Math.sin(a) * k];
    thumb.current!.style.transform = `translate(${Math.cos(a) * k * STICK.travel}px, ${Math.sin(a) * k * STICK.travel}px)`;
  };
  const release = () => {
    stick.current = [0, 0];
    if (thumb.current) thumb.current.style.transform = "translate(0,0)";
  };
  const colour = r.blocked ? "#f87171" : r.kind === "target" ? "#4ade80" : "#ffffff";
  const tick = (style: React.CSSProperties) => <div style={{ position: "absolute", background: colour, opacity: 0.9, boxShadow: "0 0 2px #000", ...style }} />;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", userSelect: "none" }} data-testid="aim-overlay">
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }} data-testid="reticle" data-kind={r.kind} data-blocked={r.blocked ? "1" : "0"}>
        {tick({ left: -1, top: -1, width: 3, height: 3, borderRadius: 2 })}
        {tick({ left: -14, top: -1, width: 8, height: 2 })}
        {tick({ left: 6, top: -1, width: 8, height: 2 })}
        {tick({ left: -1, top: -14, width: 2, height: 8 })}
        {tick({ left: -1, top: 6, width: 2, height: 8 })}
        {r.kind === "target" && <div style={{ position: "absolute", left: -11, top: -11, width: 22, height: 22, border: `2px solid ${colour}`, borderRadius: 12, boxShadow: "0 0 3px #000" }} />}
        {r.blocked && <div style={{ position: "absolute", left: -10, top: -10, width: 20, height: 20, color: colour, font: "bold 22px/20px sans-serif", textAlign: "center", textShadow: "0 0 3px #000" }}>×</div>}
        {(r.label || r.feet !== undefined) && (
          <div style={{ position: "absolute", left: -90, top: 18, width: 180, textAlign: "center", color: colour, font: "600 12px/1.2 sans-serif", textShadow: "0 0 3px #000, 0 0 3px #000" }}>
            {r.label}{r.label && r.feet !== undefined ? " · " : ""}{r.feet !== undefined ? `${r.feet} ft` : ""}{r.note ? ` · ${r.note}` : r.blocked ? " · blocked" : ""}
          </div>
        )}
      </div>
      <div
        ref={pad} data-testid="stick"
        style={{ position: "absolute", left: 14, bottom: 14, width: STICK.size, height: STICK.size, borderRadius: STICK.size / 2, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.35)", pointerEvents: "auto", touchAction: "none" }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={(e) => e.buttons && move(e)}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div ref={thumb} style={{ position: "absolute", left: (STICK.size - STICK.knob) / 2, top: (STICK.size - STICK.knob) / 2, width: STICK.knob, height: STICK.knob, borderRadius: STICK.knob / 2, background: "rgba(255,255,255,0.45)" }} />
      </div>
      <button
        data-testid="use-button" onPointerDown={(e) => { e.preventDefault(); use(); }}
        style={{ position: "absolute", right: 14, bottom: 22, width: 88, height: 88, borderRadius: 44, background: r.kind === "target" && !r.blocked ? "rgba(74,222,128,0.55)" : "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.5)", color: "#fff", font: "600 13px sans-serif", pointerEvents: "auto", touchAction: "none" }}
      >
        Use
      </button>
      <button
        data-testid="run-toggle" onPointerDown={(e) => { e.preventDefault(); useRun.getState().toggle(); }}
        style={{ position: "absolute", right: 24, bottom: 124, width: 68, height: 44, borderRadius: 22, background: run ? "rgba(250,204,21,0.55)" : "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.5)", color: "#fff", font: "600 13px sans-serif", pointerEvents: "auto", touchAction: "none" }}
      >
        {run ? "Run" : "Walk"}
      </button>
    </div>
  );
}

export function ViewRig({ mode, feet, facing, step, start = 0, fov }: {
  mode: Exclude<ViewMode, "overhead">;
  // Where the character's feet are, in the scene's frame (their height is the floor's)
  feet: () => V3;
  // The yaw the figure is turned to (the camera's), for the figure to take
  facing: { current: number | null };
  // Asks the walk for a step in a direction on the ground (x, z), which it queues or declines
  // (the third is the pace, a fraction of the top speed: the stick's deflection through its curve, less thirty per cent when walking)
  step: (dx: number, dz: number, pace: number) => void;
  // The yaw to begin looking along (the way the figure was facing)
  start?: number;
  fov?: number;
}) {
  const { camera, gl } = useThree();
  const yaw = useRef(facing.current ?? start);
  const pitch = useRef(0);
  const keys = useRef(new Set<string>());
  const stick = useRef<[number, number]>([0, 0]);
  const aimed = useRef<Aimed | null>(null);
  const since = useRef(1);
  const marker = useRef<THREE.Mesh>(null);
  const shown = useRef({ kind: "none", label: "", feet: -1, blocked: false, note: "" });

  // The camera's lens, and giving the overhead one back
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const was = { fov: cam.fov, near: cam.near };
    cam.fov = fov ?? (mode === "first" ? 72 : 62);
    cam.near = 0.05;
    cam.updateProjectionMatrix();
    useView.setState({ eyes: true });
    return () => {
      useView.setState({ eyes: false });
      cam.fov = was.fov;
      cam.near = was.near;
      cam.updateProjectionMatrix();
      facing.current = null;
      useReticle.setState({ kind: "none", label: undefined, feet: undefined, blocked: false, note: undefined });
    };
  }, [mode, camera]);

  // The action picks out what the crosshair is on, as a tap on it does (the game says whether it can be done)
  const use = () => {
    const a = aimed.current;
    if (a?.kind === "target") a.onTap?.();
  };
  const useNow = useRef(use);
  useNow.current = use;

  // Drag to look; a short touch is a tap and goes to what is under the finger as before
  useEffect(() => {
    const el = gl.domElement;
    const oldTouch = el.style.touchAction;
    el.style.touchAction = "none";
    let drag: { id: number; x: number; y: number; looking: boolean } | null = null;
    const down = (e: PointerEvent) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, looking: false }; };
    const moved = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const [dx, dy] = [e.clientX - drag.x, e.clientY - drag.y];
      if (!drag.looking && Math.hypot(dx, dy) < 8) return;
      drag.looking = true;
      [drag.x, drag.y] = [e.clientX, e.clientY];
      yaw.current -= dx * 0.006;
      const [lo, hi] = PITCH[mode];
      pitch.current = Math.max(lo, Math.min(hi, pitch.current - dy * 0.005));
    };
    const up = () => { drag = null; };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", moved);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.style.touchAction = oldTouch;
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", moved);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [gl, mode]);

  // Keys: W A S D and up and down walk, left and right turn, E, Space and Enter act
  useEffect(() => {
    const typing = (e: KeyboardEvent) => /^(input|textarea|select)$/i.test((e.target as HTMLElement)?.tagName ?? "");
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (["KeyE", "Space", "Enter"].includes(e.code)) { if (!e.repeat) useNow.current(); e.preventDefault(); return; }
      if (e.code === "KeyR" && !e.repeat) { useRun.getState().toggle(); return; }
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) { keys.current.add(e.code); e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // The overlay
  useEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) return;
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:40";
    parent.appendChild(host);
    const root = createRoot(host);
    root.render(<Overlay stick={stick} use={() => useNow.current()} />);
    return () => {
      root.unmount();
      host.remove();
    };
  }, [gl]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const k = keys.current;
    const turn = (k.has("ArrowLeft") ? 1 : 0) - (k.has("ArrowRight") ? 1 : 0);
    yaw.current += turn * 2 * dt;
    const forward = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) + stick.current[1];
    const strafe = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0) + stick.current[0];
    facing.current = yaw.current;
    const deflection = Math.min(1, Math.hypot(forward, strafe));
    const pace = paceOf(deflection, useRun.getState().run);
    if (pace > 0) {
      const f = lookDirection(yaw.current, 0);
      const r = rightOf(yaw.current);
      step(f.x * forward + r.x * strafe, f.z * forward + r.z * strafe, pace);
    }
    const at = feet();
    const pose = poseOf(mode, new THREE.Vector3(...at), yaw.current, pitch.current, AIM.solids);
    camera.position.copy(pose.position);
    camera.lookAt(pose.look);
    since.current += dt;
    if (since.current < 0.1) return;
    since.current = 0;
    const a = aimAt(camera, at[1], mode === "shoulder" ? pose.muzzle : undefined);
    aimed.current = a;
    const label = a.kind === "target" ? a.label ?? "" : "";
    // The game's own word on the target, where it has one (reach, range and cover in a fight)
    const plan = a.kind === "target" ? a.plan?.() : undefined;
    const ft = plan?.feet ?? (a.kind === "none" ? -1 : Math.round(a.point.distanceTo(new THREE.Vector3(at[0], at[1], at[2])) * FEET_PER_SQUARE));
    const blocked = !!a.blocked || (plan ? !plan.ok : false);
    const note = plan?.text ?? "";
    const now = { kind: a.kind, label, feet: ft, blocked, note };
    const was = shown.current;
    if (now.kind !== was.kind || now.label !== was.label || now.feet !== was.feet || now.blocked !== was.blocked || now.note !== was.note) {
      shown.current = now;
      useReticle.setState({ kind: a.kind, label: label || undefined, feet: ft >= 0 ? ft : undefined, blocked, note: note || undefined });
    }
    // Where the shot would land, seen from over the shoulder (the crosshair is the same point, so the two agree)
    if (marker.current) {
      marker.current.visible = mode === "shoulder" && a.kind !== "none";
      marker.current.position.copy(a.blocked ?? a.point);
      marker.current.quaternion.copy(camera.quaternion);
      marker.current.scale.setScalar(Math.max(0.05, a.distance * 0.018));
      (marker.current.material as THREE.MeshBasicMaterial).color.set(shown.current.blocked ? "#f87171" : a.kind === "target" ? "#4ade80" : "#ffffff");
    }
  });
  return (
    <mesh ref={marker} visible={false} renderOrder={10} raycast={() => null}>
      <ringGeometry args={[0.6, 1, 20]} />
      <meshBasicMaterial transparent opacity={0.85} depthTest={false} />
    </mesh>
  );
}
