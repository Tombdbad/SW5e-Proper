// An on-screen compass (2026-10-21): a dial that turns with the map's camera so that N is always the top of the plan (the north wall of a room,
// the edge at y = 0), with the point the top of the screen faces beside it. `CompassRig` goes inside the Canvas and turns the dial from the
// camera each frame through the DOM (no state, so the page is not redrawn 60 times a second); `Compass` is the dial over the map.
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { bearingOf, pointOf } from "./interiors/compass";

const dial: { turn: HTMLDivElement | null; word: HTMLSpanElement | null; last: number } = { turn: null, word: null, last: NaN };

export function CompassRig() {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3());
  useFrame(() => {
    if (!dial.turn) return;
    camera.getWorldDirection(look.current);
    up.current.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const bearing = bearingOf({ x: look.current.x, z: look.current.z }, { x: up.current.x, z: up.current.z });
    if (Math.abs(bearing - dial.last) < 0.004) return;
    dial.last = bearing;
    dial.turn.style.transform = `rotate(${-bearing}rad)`;
    if (dial.word) dial.word.textContent = pointOf(bearing);
  });
  return null;
}

export function Compass() {
  return (
    <div className="pointer-events-none absolute right-1.5 top-1.5 z-10 flex flex-col items-center" data-testid="compass" aria-label="Compass: N is the top of a room's plan">
      <div className="relative h-14 w-14 rounded-full border border-white/40 bg-black/45">
        <div ref={(el) => { dial.turn = el; dial.last = NaN; }} className="absolute inset-0" style={{ transition: "none" }}>
          <span className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[11px] font-bold leading-none text-red-400">N</span>
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-semibold leading-none text-white/80">E</span>
          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold leading-none text-white/80">S</span>
          <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-semibold leading-none text-white/80">W</span>
          <div className="absolute left-1/2 top-1/2 h-9 w-px -translate-x-1/2 -translate-y-1/2 bg-white/25" />
          <div className="absolute left-1/2 top-1/2 h-px w-9 -translate-x-1/2 -translate-y-1/2 bg-white/25" />
        </div>
        {/* The top of the screen */}
        <div className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-yellow-300" />
      </div>
      <span ref={(el) => { dial.word = el; }} className="mt-0.5 rounded bg-black/45 px-1 text-[10px] font-semibold leading-tight text-yellow-200" data-testid="compass-point">N</span>
    </div>
  );
}
