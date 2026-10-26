// The dogfight's game body (MinigamePage in FlightScene.tsx supplies the page, the countdown and the end screen): the 3D scene, the HUD,
// the steering pad and the buttons (fire, missile, bomb, faster, slower, target, part), the keys, and the mouse (steering, a cursor the guns
// follow or the reticule instead, the mouse captured so that it cannot leave the screen, and fullscreen). Start the fight from the rules
// with a seed, a scenario and the party's ship sheet; the fight's rules are shared/logic/dogfight.ts and dogfightSim.ts.
import { Canvas, useThree } from "@react-three/fiber";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createRandom } from "@shared/logic";
import { dogfightStart, type AirOptions, type Dogfight, type DogfightInput, type ScenarioId, type StarshipRow } from "@shared/logic/dogfight";
import type { ShipSheet } from "@shared/logic";
import { shaped, STICK } from "../interiors/stick";
import { ArenaScene, type ArenaSim } from "./ArenaScene";
import type { View } from "./Cockpit";
import { emptyOverlay, HudPanels, hudOf, MarkerLayer, Reticule, weaponLabel, type HudData } from "./DogfightHud";

// `air`: the land, the pull and the foe of a fight in the air of a planet (dogfight.ts airStart)
export interface DogfightSpec { title: string; seed: number; scenario: ScenarioId; rows: StarshipRow[]; ship: { sheet: ShipSheet; owner?: string }; view?: View; air?: AirOptions }

// TEST BUILD ONLY: the button for unlimited hull and weapons. It exists only in a page built with VITE_TEST_MENU=1 (deploy/test-plain.sh, as the
// game's test menu), never in the build the game is played on, so nothing here needs commenting out for production. To take it out by hand as
// well, delete the `TEST_TOOLS` lines below (the constant, and the button in DogfightControls).
const TEST_TOOLS = import.meta.env.VITE_TEST_MENU === "1";

const PAD = STICK.radius;
const BUTTON = "h-12 min-w-[4.6rem] rounded-full border border-sky-400/60 bg-gray-900/70 px-3 text-sm font-semibold text-sky-100 select-none touch-none disabled:opacity-40";
const PILL = "h-7 rounded-full border border-sky-400/60 bg-gray-900/70 px-3 text-xs font-semibold text-sky-100 select-none touch-none";

// What a pilot chose last time (the view, whether the mouse steers, and what the guns follow), kept in the browser; the mouse steers by default
// and the guns follow the cursor
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
type Aim = "cursor" | "reticle";

// Fullscreen, with the older WebKit's names (iPhones have none: there the button is not shown)
type FullDoc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void };
type FullEl = HTMLElement & { webkitRequestFullscreen?: () => void };
const fullscreenOn = () => typeof document !== "undefined" && !!((document as FullDoc).fullscreenEnabled || (document as FullDoc).webkitFullscreenEnabled);
const fullscreenNow = () => !!(document.fullscreenElement ?? (document as FullDoc).webkitFullscreenElement);

// The arena is drawn from a frame loop of its own. React Three Fiber runs every canvas of the page from one loop, and a canvas that throws in a
// frame (the map's did, every frame, when a room's motes changed in number) ends that frame for the canvases after it: the arena stood black
// and still, its clock stopped, with the HUD drawn over it. Here each frame is guarded, so that nothing else's fault stops this canvas and a
// fault of its own costs a frame; a canvas that has faulted for a second on end is built again (the fight is in `sim`, not in the canvas).
function OwnLoop({ onFault }: { onFault: (e: unknown, run: number) => void }) {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    let raf = 0;
    let run = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      try {
        advance(t / 1000, false);
        run = 0;
      } catch (err) {
        onFault(err, ++run);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [advance, onFault]);
  return null;
}
// A lost WebGL context (a device short of graphics memory, a driver reset) leaves a black canvas that three may or may not get back: a new canvas
// is made after a moment, or at once when the browser says the context is back. (This is a component so that its listeners are gone before the
// canvas is disposed on purpose, which makes the browser say the context is lost.)
function ContextWatch({ onLost }: { onLost: (why: string) => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lost = () => {
      timer = setTimeout(() => onLost("the WebGL context was lost"), 1500);
    };
    const back = () => {
      clearTimeout(timer);
      onLost("the WebGL context was restored");
    };
    el.addEventListener("webglcontextlost", lost);
    el.addEventListener("webglcontextrestored", back);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("webglcontextlost", lost);
      el.removeEventListener("webglcontextrestored", back);
    };
  }, [gl, onLost]);
  return null;
}
// Catches what the scene's own rendering throws, so that it is built again and not the whole page lost
class SceneGuard extends Component<{ onCrash: (e: unknown) => void; children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onCrash(error);
  }
  render() {
    return this.state.crashed ? null : this.props.children;
  }
}
// What the pilot is told when the view had to be built again, and how many times it is (a fight that keeps failing is left, not looped on)
const REBUILDS = 4;

// `shell`: the page the fight is in, which is what goes fullscreen (so that the countdown and the end screen go with it)
export function DogfightGame({ spec, go, controls, shell, onFinish }: { spec: DogfightSpec; go: { current: boolean }; controls: boolean; shell?: { current: HTMLElement | null }; onFinish: (s: Dogfight) => void }) {
  const sim = useRef<ArenaSim>(null as unknown as ArenaSim);
  if (!sim.current) {
    const state = dogfightStart({ seed: spec.seed, scenario: spec.scenario, rows: spec.rows, ship: spec.ship, air: spec.air });
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
  // What the guns follow: the cursor, or the reticule (the nose). Where the cursor is on the screen goes to the scene (`aimAt`, -1 to 1 each way,
  // y up) while the guns follow it; `follows` says so for what is drawn. The cursor is a point in the arena's pixels (`spot`) that the pointer
  // moves: with the mouse captured (pointer lock) by its movement, so that it never leaves the screen; otherwise it is the pointer, held at the
  // edge when the pointer goes past it.
  const [aim, setAimState] = useState<Aim>(() => (saved("aim") === "reticle" ? "reticle" : "cursor"));
  const aimRef = useRef(aim);
  const aimAt = useRef<{ x: number; y: number } | null>(null);
  const spot = useRef<{ x: number; y: number } | null>(null);
  const [follows, setFollows] = useState(false);
  const followsRef = useRef(false);
  const [captured, setCaptured] = useState(false);
  const [mouseSeen, setMouseSeen] = useState(false);
  const [full, setFull] = useState(false);
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const place = useRef(() => {});
  const [god, setGodState] = useState(false);
  // The canvas is built again when its WebGL context is lost or it keeps faulting: `epoch` is its key
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState("");
  const rebuilds = useRef(0);
  const rebuild = useCallback((why: string) => {
    if (rebuilds.current >= REBUILDS) {
      setNotice("The 3D view keeps failing on this device: leave the fight and come back, or lower the detail.");
      return;
    }
    rebuilds.current++;
    console.warn("dogfight: rebuilding the view,", why);
    setNotice("The view was lost and has been drawn again.");
    setEpoch((n) => n + 1);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice((n) => (n.startsWith("The 3D view keeps failing") ? n : "")), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const fault = useCallback((e: unknown, run: number) => {
    if (run === 1) console.warn("dogfight: a frame failed:", e);
    if (run === 60) rebuild("a second of failed frames");
  }, [rebuild]);
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
      releaseMouse();
    }
    place.current();
  };
  const setAim = (a: Aim) => {
    aimRef.current = a;
    setAimState(a);
    remember("aim", a);
    place.current();
  };
  const releaseMouse = () => {
    if (document.pointerLockElement) document.exitPointerLock();
  };
  const toggleFull = () => {
    const d = document as FullDoc;
    const target = (shell?.current ?? root.current) as FullEl | null;
    if (fullscreenNow()) (document.exitFullscreen ?? d.webkitExitFullscreen)?.call(document);
    else if (target) {
      try {
        const asked = (target.requestFullscreen ?? target.webkitRequestFullscreen)?.call(target) as Promise<void> | undefined;
        asked?.catch?.(() => {});
      } catch {}
    }
  };
  const setGod = (on: boolean) => {
    input.current.god = on;
    setGodState(on);
  };
  const bump = (key: "cycle" | "retarget" | "subtarget" | "pick") => (input.current[key] = (input.current[key] ?? 0) + 1);
  // The latest of these for the key handler, which is set up once
  const act = useRef({ toggleView: () => {}, toggleMouse: () => {}, toggleAim: () => {}, toggleFull: () => {} });
  act.current = {
    toggleView: () => setView(viewRef.current === "cockpit" ? "chase" : "cockpit"),
    toggleMouse: () => setMouse(!mouseRef.current),
    toggleAim: () => setAim(aimRef.current === "cursor" ? "reticle" : "cursor"),
    toggleFull,
  };

  useEffect(() => {
    const timer = setInterval(() => setHud(hudOf(sim.current.state, overlay.current.hullDist)), 100);
    // For test scripts, as the map's window.__map3d and the race's window.__race
    (window as unknown as { __dogfight?: unknown }).__dogfight = { state: () => sim.current.state, input, setView: (v: View) => setView(v), view: viewRef, sources, aimAt, spot, aim: aimRef };
    return () => clearInterval(timer);
  }, []);

  // The keys: W and S the throttle (it holds where it is left), A and D roll, the arrows yaw and pitch (up climbs), space fires, M a missile, B a
  // bomb, T the next target, Y the next part of the target, Q the next ordnance, E the next weapon, C the view (chase or cockpit), V the mouse,
  // X what the guns follow (cursor or reticule), F fullscreen
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
      if (!e.repeat && e.code === "KeyX") act.current.toggleAim();
      if (!e.repeat && e.code === "KeyF") act.current.toggleFull();
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

  // The mouse: where the cursor is on the screen is where the craft's nose turns toward, in yaw and pitch and never roll (a stick that is the
  // whole screen: the middle is straight on, 40% of the shorter side is full turn), however far the cursor goes (it is held at the screen's
  // edge, over the buttons and the page's title bar too, and when the mouse is captured it cannot go past it); and, while the guns follow the
  // cursor, it is where they fire. The left button fires the active weapon (and the first click captures the mouse: Esc lets go), the right
  // button makes the next weapon the active one, the wheel moves the throttle (up for more). Over the buttons the buttons are what a click
  // reaches, and the guns are on the reticule.
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
    // The pointer is somewhere over a button, or outside the arena (its title bar, say): the cursor is not drawn there and does not aim
    let away = false;
    const held = () => document.pointerLockElement === el;
    // Everything that follows from where the cursor is: where it is drawn, the steering and the aim
    const here = () => {
      const p = spot.current;
      const box = el.getBoundingClientRect();
      if (p) {
        p.x = Math.max(0, Math.min(box.width, p.x));
        p.y = Math.max(0, Math.min(box.height, p.y));
      }
      const drawn = !!p && controlsRef.current && (mouseRef.current || aimRef.current === "cursor") && (held() || !away);
      if (cursor.current) {
        cursor.current.style.display = drawn ? "block" : "none";
        if (p) cursor.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
      }
      if (p && mouseRef.current) {
        const reach = Math.min(box.width, box.height) * 0.4;
        const dx = (p.x - box.width / 2) / reach;
        const dy = (p.y - box.height / 2) / reach;
        const d = Math.hypot(dx, dy);
        const mag = d > 0 ? shaped(Math.min(1, d), 0.35, 0.04, 1) / d : 0;
        sources.current.mouse = { x: dx * mag, y: dy * mag };
        mix();
      } else steerOff();
      const aimed = drawn && aimRef.current === "cursor" && p && box.width > 0 && box.height > 0 ? { x: (p.x / box.width) * 2 - 1, y: 1 - (p.y / box.height) * 2 } : null;
      aimAt.current = aimed;
      if (!!aimed !== followsRef.current) {
        followsRef.current = !!aimed;
        setFollows(!!aimed);
      }
    };
    place.current = here;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const box = el.getBoundingClientRect();
      if (held()) {
        // (the first movement after the capture can be a wild jump)
        if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
        const p = spot.current ?? { x: box.width / 2, y: box.height / 2 };
        spot.current = { x: p.x + e.movementX, y: p.y + e.movementY };
        away = false;
      } else {
        spot.current = { x: e.clientX - box.left, y: e.clientY - box.top };
        away = onUi(e.target) || e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
      }
      setMouseSeen(true);
      here();
    };
    // The mouse is captured by a click while it steers (a pointer that leaves the window stops sending its place): it goes when the browser
    // lets go (Esc), when the fight is over and the buttons are needed, and when the mouse is turned off
    const capture = () => {
      if (held() || !mouseRef.current || !controlsRef.current || typeof el.requestPointerLock !== "function") return;
      try {
        (el.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
      } catch {}
    };
    const lockChange = () => {
      setCaptured(held());
      here();
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || onUi(e.target)) return;
      if (e.button === 0) {
        // A captured mouse has no pointer to click with: a click on a button under the cursor (drawn there) presses it, and does not fire
        const p = spot.current;
        if (held() && p) {
          const box = el.getBoundingClientRect();
          const tap = document.elementsFromPoint(box.left + p.x, box.top + p.y).find((n) => n instanceof HTMLElement && n.dataset.tap !== undefined) as HTMLElement | undefined;
          if (tap) return tap.click();
        }
        input.current.trigger = true;
        capture();
      } else if (e.button === 2) bump("cycle");
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
    const fullChange = () => {
      setFull(fullscreenNow());
      here();
    };
    // (on the window and not the arena: the cursor goes on steering over the buttons and the title bar)
    window.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", down);
    el.addEventListener("contextmenu", menu);
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("resize", here);
    document.addEventListener("pointerlockchange", lockChange);
    document.addEventListener("fullscreenchange", fullChange);
    document.addEventListener("webkitfullscreenchange", fullChange);
    return () => {
      window.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("contextmenu", menu);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("resize", here);
      document.removeEventListener("pointerlockchange", lockChange);
      document.removeEventListener("fullscreenchange", fullChange);
      document.removeEventListener("webkitfullscreenchange", fullChange);
      place.current = () => {};
      if (document.pointerLockElement === el) document.exitPointerLock();
    };
  }, []);
  // The end screen and the countdown need the pointer (their buttons): the mouse is let go
  useEffect(() => {
    if (!controls) releaseMouse();
    place.current();
  }, [controls]);

  // The guns are on the cursor (in the station's tunnel they never are: the craft is flown straight and fires at the reticule)
  const guns = follows && !hud.interior;
  return (
    <div
      ref={root}
      className="absolute inset-0"
      style={{ cursor: (mouse || aim === "cursor") && controls && mouseSeen ? "none" : undefined }}
      data-testid="dogfight-root"
      data-view={view}
      data-mouse={mouse ? "on" : "off"}
      data-aim={follows ? "cursor" : "reticle"}
      data-captured={captured ? "true" : "false"}
    >
      <SceneGuard key={epoch} onCrash={(e) => rebuild(`the scene threw: ${String((e as Error)?.message ?? e).slice(0, 120)}`)}>
        <Canvas
          frameloop="never"
          camera={{ position: [0, 6, -22], fov: 65, near: 1, far: 16000 }}
          dpr={[1, 1.5]}
          onCreated={({ gl }) => gl.setClearColor("#02040a")}
        >
          <OwnLoop onFault={fault} />
          <ContextWatch onLost={rebuild} />
          <ArenaScene
            sim={sim}
            go={go}
            input={input}
            overlay={overlay}
            view={viewRef}
            cursor={aimAt}
            onFrame={() => {}}
            onFinish={(s) => {
              if (finished.current) return;
              finished.current = true;
              onFinish(s);
            }}
          />
        </Canvas>
      </SceneGuard>
      {notice && <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded bg-amber-900/80 px-3 py-1 text-xs font-semibold text-amber-100" data-testid="dogfight-notice">{notice}</div>}
      <MarkerLayer overlay={overlay} />
      <Reticule overlay={overlay} locked={hud.onTarget} guns={!guns} />
      <div ref={cursor} className="pointer-events-none absolute left-0 top-0 hidden" data-testid="aim-cursor" data-guns={guns ? "true" : "false"} data-locked={guns && hud.onTarget ? "true" : "false"}>
        <div className="absolute -left-4 -top-4 h-8 w-8 rounded-full border-2" style={{ borderColor: guns && hud.onTarget ? "#ff3b3b" : "#7dd3fc", boxShadow: `0 0 6px ${guns && hud.onTarget ? "#ff3b3b" : "#7dd3fc"}` }} />
        <div className="absolute -left-0.5 -top-0.5 h-1 w-1 rounded-full" style={{ background: guns && hud.onTarget ? "#ff9a9a" : "#bae6fd" }} />
        {guns && (
          <>
            <div className="absolute -top-6 -left-px h-2 w-0.5" style={{ background: hud.onTarget ? "#ff3b3b" : "#7dd3fc" }} />
            <div className="absolute -left-px top-4 h-2 w-0.5" style={{ background: hud.onTarget ? "#ff3b3b" : "#7dd3fc" }} />
            <div className="absolute -left-6 -top-px h-0.5 w-2" style={{ background: hud.onTarget ? "#ff3b3b" : "#7dd3fc" }} />
            <div className="absolute -top-px left-4 h-0.5 w-2" style={{ background: hud.onTarget ? "#ff3b3b" : "#7dd3fc" }} />
          </>
        )}
      </div>
      {mouse && controls && mouseSeen && !captured && typeof document !== "undefined" && "pointerLockElement" in document && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-gray-900/70 px-2 py-0.5 text-[11px] text-sky-100" data-testid="dogfight-capture">
          Click the view to capture the mouse (Esc lets go)
        </div>
      )}
      <HudPanels hud={hud} high={view === "cockpit"} />
      {controls && (
        <DogfightControls
          input={input}
          sources={sources}
          mix={mix}
          hud={hud}
          view={view}
          mouse={mouse}
          captured={captured}
          aim={aim}
          full={full}
          god={god}
          onView={() => act.current.toggleView()}
          onMouse={() => act.current.toggleMouse()}
          onAim={() => act.current.toggleAim()}
          onFull={() => act.current.toggleFull()}
          onWeapon={() => bump("cycle")}
          onPart={() => bump("subtarget")}
          onGod={() => setGod(!god)}
        />
      )}
    </div>
  );
}

function DogfightControls({ input, sources, mix, hud, view, mouse, captured, aim, full, god, onView, onMouse, onAim, onFull, onWeapon, onPart, onGod }: {
  input: { current: DogfightInput };
  sources: { current: { pad: Source } };
  mix: () => void;
  hud: HudData;
  view: View;
  mouse: boolean;
  captured: boolean;
  aim: Aim;
  full: boolean;
  god: boolean;
  onView: () => void;
  onMouse: () => void;
  onAim: () => void;
  onFull: () => void;
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
          <button type="button" data-testid="dogfight-god" data-tap aria-pressed={god} className={`${PILL} ${god ? "border-fuchsia-300 bg-fuchsia-900/70 text-fuchsia-100" : "border-fuchsia-400/60"}`} onClick={onGod} title="Test build only">
            Test: unlimited hull and weapons {god ? "on" : "off"}
          </button>
        )}
        <button type="button" data-testid="dogfight-weapon" data-tap className={PILL} onClick={onWeapon} title="Right click or E">
          Weapon: {active ? `${weaponLabel(active.name, active.kind)}${active.ammo !== null ? " " + active.ammo : ""}` : "none"}
        </button>
        <button type="button" data-testid="dogfight-view" data-tap className={PILL} onClick={onView} title="C">{view === "cockpit" ? "Cockpit view" : "Chase view"}</button>
        <button type="button" data-testid="dogfight-mouse" data-tap aria-pressed={mouse} className={`${PILL} ${mouse ? "border-yellow-300 text-yellow-100" : ""}`} onClick={onMouse} title="V">Mouse steering {mouse ? (captured ? "on (captured)" : "on") : "off"}</button>
        <button type="button" data-testid="dogfight-aim" data-tap data-aim={aim} className={PILL} onClick={onAim} title="X: the guns fire at the cursor, or along the nose at the reticule">Aim: {aim === "cursor" ? "cursor" : "reticule"}</button>
        {fullscreenOn() && <button type="button" data-testid="dogfight-full" data-tap aria-pressed={full} className={PILL} onClick={onFull} title="F">{full ? "Leave fullscreen" : "Fullscreen"}</button>}
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
        <button type="button" data-testid="flight-target" data-tap className={`${BUTTON} ${hud.lockOn ? "border-red-400 text-red-200" : ""}`} onClick={() => (input.current.retarget = (input.current.retarget ?? 0) + 1)}>Target</button>
        <button type="button" data-testid="flight-part" data-tap className={BUTTON} title="The next turret, generator or bay of the target (Y)" onClick={onPart}>Part</button>
        {hud.ord.length > 1 ? (
          <button type="button" data-testid="flight-pick" data-tap className={`${BUTTON} h-12 text-xs`} onClick={() => (input.current.pick = (input.current.pick ?? 0) + 1)}>Switch ordnance</button>
        ) : <span />}
      </div>
    </>
  );
}
