// The dogfight's game body (MinigamePage in FlightScene.tsx supplies the page, the countdown and the end screen): the 3D scene, the HUD,
// the steering pad and the buttons (fire, missile, bomb, faster, slower, target, part), the keys, and the mouse. Start the fight from the rules
// with a seed, a scenario and the party's ship sheet; the fight's rules are shared/logic/dogfight.ts and dogfightSim.ts.
import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { createRandom } from "@shared/logic";
import { dogfightStart, type Dogfight, type DogfightInput, type ScenarioId, type StarshipRow } from "@shared/logic/dogfight";
import type { ShipSheet } from "@shared/logic";
import { shaped, STICK } from "../interiors/stick";
import { ArenaScene, type ArenaSim } from "./ArenaScene";
import type { View } from "./Cockpit";
import { emptyOverlay, HudPanels, hudOf, MarkerLayer, Reticule, weaponLabel, type HudData } from "./DogfightHud";

export interface DogfightSpec { title: string; seed: number; scenario: ScenarioId; rows: StarshipRow[]; ship: { sheet: ShipSheet; owner?: string }; view?: View }

// TEST BUILD ONLY: the button for unlimited hull and weapons. It exists only in a page built with VITE_TEST_MENU=1 (deploy/test-plain.sh, as the
// game's test menu), never in the build the game is played on, so nothing here needs commenting out for production. To take it out by hand as
// well, delete the `TEST_TOOLS` lines below (the constant, and the button in DogfightControls).
const TEST_TOOLS = import.meta.env.VITE_TEST_MENU === "1";

const PAD = STICK.radius;
const BUTTON = "h-12 min-w-[4.6rem] rounded-full border border-sky-400/60 bg-gray-900/70 px-3 text-sm font-semibold text-sky-100 select-none touch-none disabled:opacity-40";
const PILL = "h-7 rounded-full border border-sky-400/60 bg-gray-900/70 px-3 text-xs font-semibold text-sky-100 select-none touch-none";

// What a pilot chose last time (the view, and whether the mouse steers), kept in the browser; the mouse steers by default
const saved = (key: string): string | null => {
  try {
    return localStorage.getItem(`sw5e.dogfight.${key}`);
  } catch {
    return null;
  }
};
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(`sw5e.dogfight.${key}`, value);
  } catch {}
};

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
type Source = { x: number; y: number };

export function DogfightGame({ spec, go, controls, onFinish }: { spec: DogfightSpec; go: { current: boolean }; controls: boolean; onFinish: (s: Dogfight) => void }) {
  const sim = useRef<ArenaSim>(null as unknown as ArenaSim);
  if (!sim.current) {
    const state = dogfightStart({ seed: spec.seed, scenario: spec.scenario, rows: spec.rows, ship: spec.ship });
    sim.current = { state, roll: createRandom((spec.seed | 0) + 1).next, shake: 0, lastHull: state.vessels[0].c.hull + state.vessels[0].c.shield };
  }
  const input = useRef<DogfightInput>({ steer: { x: 0, y: 0 }, throttle: 0, roll: 0, dial: 0, retarget: 0, subtarget: 0, pick: 0, cycle: 0 });
  // The steering comes from three places at once, and is the sum of them: the keys (the arrows), the pad, and the mouse
  const sources = useRef<{ key: Source; pad: Source; mouse: Source }>({ key: { x: 0, y: 0 }, pad: { x: 0, y: 0 }, mouse: { x: 0, y: 0 } });
  const mix = () => {
    const s = sources.current;
    input.current.steer = { x: clamp1(s.key.x + s.pad.x + s.mouse.x), y: clamp1(s.key.y + s.pad.y + s.mouse.y) };
  };
  const overlay = useRef(emptyOverlay());
  const [hud, setHud] = useState<HudData>(() => hudOf(sim.current.state));
  const finished = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const [view, setViewState] = useState<View>(() => spec.view ?? (saved("view") === "cockpit" ? "cockpit" : "chase"));
  const viewRef = useRef<View>(view);
  const [mouse, setMouseState] = useState<boolean>(() => saved("mouse") !== "0");
  const mouseRef = useRef(mouse);
  const [god, setGodState] = useState(false);
  const setView = (v: View) => {
    viewRef.current = v;
    setViewState(v);
    remember("view", v);
  };
  const setMouse = (on: boolean) => {
    mouseRef.current = on;
    setMouseState(on);
    remember("mouse", on ? "1" : "0");
    if (!on) {
      sources.current.mouse = { x: 0, y: 0 };
      mix();
      if (cursor.current) cursor.current.style.display = "none";
    }
  };
  const setGod = (on: boolean) => {
    input.current.god = on;
    setGodState(on);
  };
  const bump = (key: "cycle" | "retarget" | "subtarget" | "pick") => (input.current[key] = (input.current[key] ?? 0) + 1);
  // The latest of these for the key handler, which is set up once
  const act = useRef({ toggleView: () => {}, toggleMouse: () => {} });
  act.current = { toggleView: () => setView(viewRef.current === "cockpit" ? "chase" : "cockpit"), toggleMouse: () => setMouse(!mouseRef.current) };

  useEffect(() => {
    const timer = setInterval(() => setHud(hudOf(sim.current.state, overlay.current.hullDist)), 100);
    // For test scripts, as the map's window.__map3d and the race's window.__race
    (window as unknown as { __dogfight?: unknown }).__dogfight = { state: () => sim.current.state, input, setView: (v: View) => setView(v), view: viewRef, sources };
    return () => clearInterval(timer);
  }, []);

  // The keys: W and S the throttle (it holds where it is left), A and D roll, the arrows yaw and pitch (up climbs), space fires, M a missile, B a
  // bomb, T the next target, Y the next part of the target, Q the next ordnance, E the next weapon, C the view (chase or cockpit), V the mouse
  useEffect(() => {
    const held = new Set<string>();
    const KEYS = ["KeyW", "KeyS", "KeyA", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyM", "KeyB"];
    const apply = () => {
      const c = input.current;
      c.throttle = held.has("KeyW") ? 1 : held.has("KeyS") ? -1 : 0;
      c.roll = (held.has("KeyD") ? 1 : 0) - (held.has("KeyA") ? 1 : 0);
      sources.current.key = {
        x: (held.has("ArrowRight") ? 1 : 0) - (held.has("ArrowLeft") ? 1 : 0),
        y: (held.has("ArrowDown") ? 1 : 0) - (held.has("ArrowUp") ? 1 : 0),
      };
      mix();
      c.fire = held.has("Space");
      c.missile = held.has("KeyM");
      c.bomb = held.has("KeyB");
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === "KeyT") bump("retarget");
      if (e.code === "KeyY") bump("subtarget");
      if (e.code === "KeyQ") bump("pick");
      if (e.code === "KeyE") bump("cycle");
      if (!e.repeat && e.code === "KeyC") act.current.toggleView();
      if (!e.repeat && e.code === "KeyV") act.current.toggleMouse();
      if (!KEYS.includes(e.code)) return;
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      held.add(e.code);
      apply();
    };
    const up = (e: KeyboardEvent) => {
      if (!KEYS.includes(e.code)) return;
      held.delete(e.code);
      apply();
    };
    const blur = () => {
      held.clear();
      const c = input.current;
      sources.current = { key: { x: 0, y: 0 }, pad: { x: 0, y: 0 }, mouse: { x: 0, y: 0 } };
      mix();
      c.throttle = 0;
      c.roll = 0;
      c.fire = c.missile = c.bomb = c.trigger = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // The mouse: where it is on the screen is where the craft's nose turns toward, in yaw and pitch (a stick that is the whole screen: the middle
  // is straight on, 40% of the shorter side is full turn); the left button fires the active weapon, the right button makes the next weapon the
  // active one, the wheel moves the throttle (up for more). Over the buttons it does none of that.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onUi = (t: EventTarget | null) => t instanceof Element && !!t.closest("[data-hud-ui]");
    const steerOff = () => {
      if (sources.current.mouse.x || sources.current.mouse.y) {
        sources.current.mouse = { x: 0, y: 0 };
        mix();
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const box = el.getBoundingClientRect();
      const over = onUi(e.target);
      if (cursor.current) {
        cursor.current.style.transform = `translate(${e.clientX - box.left}px, ${e.clientY - box.top}px)`;
        cursor.current.style.display = mouseRef.current && !over ? "block" : "none";
      }
      if (!mouseRef.current || over) return steerOff();
      const reach = Math.min(box.width, box.height) * 0.4;
      const dx = (e.clientX - (box.left + box.width / 2)) / reach;
      const dy = (e.clientY - (box.top + box.height / 2)) / reach;
      const d = Math.hypot(dx, dy);
      const mag = d > 0 ? shaped(Math.min(1, d), 0.35, 0.04, 1) / d : 0;
      sources.current.mouse = { x: dx * mag, y: dy * mag };
      mix();
    };
    const leave = () => {
      if (cursor.current) cursor.current.style.display = "none";
      steerOff();
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || onUi(e.target)) return;
      if (e.button === 0) input.current.trigger = true;
      else if (e.button === 2) bump("cycle");
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button === 0) input.current.trigger = false;
    };
    const menu = (e: Event) => e.preventDefault();
    // A notch of the wheel is a hundred units of delta, and a smooth wheel or a touchpad sends it in pieces
    let notches = 0;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      notches += (e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY) / 100;
      const whole = Math.trunc(notches);
      if (!whole) return;
      notches -= whole;
      input.current.dial = (input.current.dial ?? 0) - whole;
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointerdown", down);
    el.addEventListener("contextmenu", menu);
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("contextmenu", menu);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  return (
    <div ref={root} className="absolute inset-0" style={{ cursor: mouse && controls ? "none" : undefined }} data-testid="dogfight-root" data-view={view} data-mouse={mouse ? "on" : "off"}>
      <Canvas camera={{ position: [0, 6, -22], fov: 65, near: 1, far: 16000 }} dpr={[1, 1.5]} onCreated={({ gl }) => gl.setClearColor("#02040a")}>
        <ArenaScene
          sim={sim}
          go={go}
          input={input}
          overlay={overlay}
          view={viewRef}
          onFrame={() => {}}
          onFinish={(s) => {
            if (finished.current) return;
            finished.current = true;
            onFinish(s);
          }}
        />
      </Canvas>
      <MarkerLayer overlay={overlay} />
      <Reticule locked={hud.onTarget} />
      <div ref={cursor} className="pointer-events-none absolute left-0 top-0 hidden" data-testid="aim-cursor">
        <div className="absolute -left-4 -top-4 h-8 w-8 rounded-full border-2 border-sky-300/90" style={{ boxShadow: "0 0 6px #7dd3fc" }} />
        <div className="absolute -left-0.5 -top-0.5 h-1 w-1 rounded-full bg-sky-200" />
      </div>
      <HudPanels hud={hud} high={view === "cockpit"} />
      {controls && (
        <DogfightControls
          input={input}
          sources={sources}
          mix={mix}
          hud={hud}
          view={view}
          mouse={mouse}
          god={god}
          onView={() => act.current.toggleView()}
          onMouse={() => act.current.toggleMouse()}
          onWeapon={() => bump("cycle")}
          onPart={() => bump("subtarget")}
          onGod={() => setGod(!god)}
        />
      )}
    </div>
  );
}

function DogfightControls({ input, sources, mix, hud, view, mouse, god, onView, onMouse, onWeapon, onPart, onGod }: {
  input: { current: DogfightInput };
  sources: { current: { pad: Source } };
  mix: () => void;
  hud: HudData;
  view: View;
  mouse: boolean;
  god: boolean;
  onView: () => void;
  onMouse: () => void;
  onWeapon: () => void;
  onPart: () => void;
  onGod: () => void;
}) {
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const steer = (e: React.PointerEvent) => {
    const box = pad.current!.getBoundingClientRect();
    const dx = Math.max(-1, Math.min(1, (e.clientX - (box.left + box.width / 2)) / PAD));
    const dy = Math.max(-1, Math.min(1, (e.clientY - (box.top + box.height / 2)) / PAD));
    sources.current.pad = { x: dx, y: dy };
    mix();
    setKnob({ x: dx, y: dy });
  };
  const release = () => {
    sources.current.pad = { x: 0, y: 0 };
    mix();
    setKnob({ x: 0, y: 0 });
  };
  const hold = (set: (down: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      set(true);
    },
    onPointerUp: () => set(false),
    onPointerCancel: () => set(false),
    onLostPointerCapture: () => set(false),
  });
  const ord = hud.ord.find((o) => o.selected) ?? hud.ord[0];
  const left = hud.ord.reduce((n, o) => n + o.ammo, 0);
  const active = hud.weapons.find((w) => w.active);
  return (
    <>
      <div data-hud-ui className="absolute left-4 flex flex-col items-start gap-1" style={{ bottom: STICK.size + 28 }}>
        {TEST_TOOLS && (
          <button type="button" data-testid="dogfight-god" aria-pressed={god} className={`${PILL} ${god ? "border-fuchsia-300 bg-fuchsia-900/70 text-fuchsia-100" : "border-fuchsia-400/60"}`} onClick={onGod} title="Test build only">
            Test: unlimited hull and weapons {god ? "on" : "off"}
          </button>
        )}
        <button type="button" data-testid="dogfight-weapon" className={PILL} onClick={onWeapon} title="Right click or E">
          Weapon: {active ? `${weaponLabel(active.name, active.kind)}${active.ammo !== null ? " " + active.ammo : ""}` : "none"}
        </button>
        <button type="button" data-testid="dogfight-view" className={PILL} onClick={onView} title="C">{view === "cockpit" ? "Cockpit view" : "Chase view"}</button>
        <button type="button" data-testid="dogfight-mouse" aria-pressed={mouse} className={`${PILL} ${mouse ? "border-yellow-300 text-yellow-100" : ""}`} onClick={onMouse} title="V">Mouse steering {mouse ? "on" : "off"}</button>
      </div>
      <div
        ref={pad}
        data-hud-ui
        data-testid="flight-pad"
        className="absolute bottom-4 left-4 touch-none rounded-full border-2 border-sky-400/60 bg-gray-900/50"
        style={{ width: STICK.size, height: STICK.size }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); steer(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) steer(e); }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className="absolute rounded-full bg-sky-300/80" style={{ width: STICK.knob, height: STICK.knob, left: `calc(50% + ${knob.x * STICK.travel}px - ${STICK.knob / 2}px)`, top: `calc(50% + ${knob.y * STICK.travel}px - ${STICK.knob / 2}px)` }} />
      </div>
      <div data-hud-ui className="absolute bottom-3 right-3 grid grid-cols-2 gap-2">
        <button type="button" data-testid="flight-fire" className={BUTTON} {...hold((d) => (input.current.fire = d))}>Fire</button>
        <button type="button" data-testid="flight-boost" className={BUTTON} title="Throttle up (W)" {...hold((d) => (input.current.throttle = d ? 1 : 0))}>Faster</button>
        {hud.ord.length > 0 ? (
          <button type="button" data-testid="flight-missile" disabled={left === 0} className={BUTTON} {...hold((d) => (input.current.missile = d))}>
            {ord?.kind === "torpedo" ? "Torpedo" : ord?.kind === "rocket" ? "Rocket" : "Missile"} {ord?.ammo ?? 0}
          </button>
        ) : <span />}
        <button type="button" data-testid="flight-brake" className={BUTTON} title="Throttle down (S)" {...hold((d) => (input.current.throttle = d ? -1 : 0))}>Slower</button>
        {hud.bombs ? (
          <button type="button" data-testid="flight-bomb" disabled={hud.bombs.ammo === 0} className={BUTTON} {...hold((d) => (input.current.bomb = d))}>Bomb {hud.bombs.ammo}</button>
        ) : <span />}
        <button type="button" data-testid="flight-target" className={`${BUTTON} ${hud.lockOn ? "border-red-400 text-red-200" : ""}`} onClick={() => (input.current.retarget = (input.current.retarget ?? 0) + 1)}>Target</button>
        <button type="button" data-testid="flight-part" className={BUTTON} title="The next turret, generator or bay of the target (Y)" onClick={onPart}>Part</button>
        {hud.ord.length > 1 ? (
          <button type="button" data-testid="flight-pick" className={`${BUTTON} h-12 text-xs`} onClick={() => (input.current.pick = (input.current.pick ?? 0) + 1)}>Switch ordnance</button>
        ) : <span />}
      </div>
    </>
  );
}
