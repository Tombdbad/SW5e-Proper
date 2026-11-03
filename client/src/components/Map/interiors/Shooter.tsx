// The shooter mode's fight, inside the walkable map (2026-10-29; the user: real-time first/third person combat on the existing traversal: blasters,
// grenades, animated lightsabre combat; no top-down view). The rules are shared/logic/shooter.ts; this runs them each frame against what the map
// allows (`ShooterCtx`, given by LocalMap's BuildingScene, which owns the party's walking, jumping, hook and pack), draws the enemies with the
// same Figure the rest of the map uses, their bolts, the grenades and the saber, and when the fight is over hands the result to the game the way
// a turn-based fight does (useCombat.finishRealtime), so that loot, experience, ammunition, companions and nemeses are settled by the same code.
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import {
  KEPT, SHOOT, applyGear, monstrous, castPower, cloakedNow, firePlayer, fitsAt, newSim, paceOf, placeUnits, playerOf, reloadPlayer, resultOf, roundsOf, sees, sensesOf, setBlock, step, swingPlayer, throwGrenade,
  type Env, type Event, type FightGear, type Sim, type Unit,
} from "@shared/logic/shooter";
import { Figure, MotionContext, usePartyLook } from "../models";
import { creatureLunge, kickOf, motion, nowSeconds, type Motion } from "./limbs";
import { SIDE_COLORS, tokenOf } from "../sprites";
import { AIM, partyMotion, recoil, rightOf, stance, useView } from "./aim";
import { bindShootKeys, useShoot, type Session } from "./shoot";
import { sfx } from "./fx";
import { useCombat } from "@/lib/stores/useCombat";

export interface Spot { x: number; y: number; h: number }
export interface ShooterCtx {
  // The scene's offset from the grid (a grid square (x, y) is at scene (x - cx, h, y - cz))
  cx: number;
  cz: number;
  env: Env;
  // Where the party's feet are (a square's number; its middle is that + 0.5) and how high, and the way it faces
  feet: () => { x: number; y: number };
  altitude: () => number;
  facing: () => number;
  // The muzzle and the point under the crosshair, in grid units (null when the map is not ready)
  shot: (fresh?: boolean) => { from: Spot; to: Spot } | null;
  moving: () => boolean;
  airborne: () => boolean;
  // How high a swimmer floats where the party is swimming (a fight in the water, 2026-11-02: the party's people on foot swim with it), else null
  swimAt?: () => number | null;
  // Puts the party on a square (a portable teleporter); false when it cannot stand there
  place?: (x: number, y: number) => boolean;
}

const POOL = { bolts: 72, grenades: 6, blasts: 16, mines: 8, fields: 8, lines: 3, decoys: 3, images: 3 };
// What the ground looks like where it burns, and where a gas or acid lingers (and smoke, darkness, caltrops: a power's ground)
const FIELD_COLOR: Record<string, string> = { fire: "#ff7a1a", poison: "#7bd34a", acid: "#b5e61d", cold: "#9ad8ff", lightning: "#c7b8ff", smoke: "#9ca3af", dark: "#111827", kinetic: "#a8a29e", necrotic: "#4c1d95", sonic: "#e8e1c7" };
// What befalls a foe, shown on it (2026-11-03): a ring at its feet by colour, and a net drawn round one held
const STATUS_COLOR: Record<string, string> = { netted: "#d6c79a", held: "#fde047", slowed: "#60a5fa", charmed: "#c084fc", unaware: "#94a3b8", marked: "#f43f5e", turned: "#34d399", disarmed: "#f59e0b" };
const PAGE = 9;
// (an item on the belt: a rocket of a rocketpack is named "Rocketpack: Rocket, ..." and is the rocket that is used up)
const usedName = (g: FightGear) => (g.act.act === "rocket" ? g.name.split(": ").pop()! : g.name);
// What a power looks like where it takes hold
const POWER_COLOR: Record<string, string> = { damage: "#9ad0ff", heal: "#4ade80", stun: "#fde047", fear: "#a78bfa", blind: "#ffffff", push: "#e5e7eb", pull: "#c4b5fd", imbue: "#fb923c", buff: "#7dd3fc", blink: "#a5b4fc", sense: "#f472b6", mark: "#f43f5e", slow: "#60a5fa", restrain: "#fde047", mind: "#c084fc", zone: "#9ca3af", decoy: "#60a5fa", kill: "#111827", revive: "#4ade80", cure: "#86efac", disarm: "#f59e0b", turn: "#34d399", throw: "#93c5fd", dash: "#e0f2fe" };
const BOLT_COLOR = { foe: "#ff3b30", ally: "#5ac8fa", player: "#7dd3fc", reflected: "#ffd60a" };
// What a monster spits or flings looks like, by its damage (a glob of acid, a spine of bone, a gout of fire)
const NATURAL_COLOR: Record<string, string> = { acid: "#9be22d", poison: "#6fcf3a", fire: "#ff7a1a", cold: "#bfe8ff", lightning: "#c7b8ff", necrotic: "#5b4a6b", psychic: "#d68cff", sonic: "#e8e1c7", kinetic: "#d9c9a3", energy: "#ffd27a" };
const nameOf = (s: Sim, id: string) => s.units.find((u) => u.id === id)?.name ?? "A foe";
const isLarge = (size?: string) => /large|huge|gargantuan/i.test(size ?? "");

export function ShooterLayer({ session, ctx }: { session: Session; ctx: { current: ShooterCtx } }) {
  const { camera } = useThree();
  const sim = useRef<Sim>(null as unknown as Sim);
  if (!sim.current || (sim.current as any)._session !== session.id) {
    sim.current = newSim(session.units, { seed: session.seed, surprise: session.surprise });
    (sim.current as any)._session = session.id;
    // (the powers on the keys, and the points to cast them with)
    const me = playerOf(sim.current);
    me.powers = session.powers ?? [];
    me.points = session.points ?? 0;
    // (test hook: the live fight, for a script to look at or to bring to its end)
    if (typeof window !== "undefined") (window as any).__shooter = sim.current;
  }
  const state = useRef({
    seen: { fire: 0, grenade: 0, reload: 0, block: 0, swap: 0, crouch: 0, item: 0, next: 0, power0: 0, power1: 0, power2: 0, power3: 0, power4: 0, power5: 0, power6: 0, power7: 0, power8: 0, page: 0, zoom: 0 },
    // (2026-11-03) the page of powers on the keys, what each foe is under (its ring and the word over it), lines drawn (a harpoon's), shots heard
    page: 0,
    status: {} as Record<string, { text: string; at: number }>,
    lines: [] as { x: number; y: number; h: number; tx: number; ty: number; th: number; t: number }[],
    pings: [] as { a: number; at: number }[],
    zoom: 1,
    crouch: false,
    // the belt: what is carried to use, and the one shown (Z uses it)
    gear: (session.gear ?? []).map((g) => ({ ...g })),
    pick: 0,
    pickName: "",
    noteAt: 0,
    // when each fallen unit went down, and when each unit last swung (the figures fall and swing over a moment, not at once)
    died: {} as Record<string, number>,
    swung: {} as Record<string, number>,
    // what each foe began with its hands, when, and for how long (a monster's rearing and lunging is drawn from these: limbs.ts creatureLunge)
    acts: {} as Record<string, { at: number; for: number }>,
    weapon: (session.units.find((u) => u.side === "player")?.gun ? "gun" : "blade") as "gun" | "blade",
    placed: false,
    used: {} as Record<string, number>,
    sync: 0,
    ending: 0,
    done: false,
    firedAt: 0,
    swungAt: -9,
    swingCombo: 0,
    blasts: [] as { x: number; y: number; h: number; t: number; r: number; life: number; c: string }[],
    note: "",
  });
  const group = useRef<Record<string, THREE.Group | null>>({});
  const bars = useRef<Record<string, THREE.Mesh | null>>({});
  const tele = useRef<Record<string, THREE.Mesh | null>>({});
  const boltMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const grenadeMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const blastMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const mineMeshes = useRef<(THREE.Group | null)[]>([]);
  const fieldMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const flash = useRef<THREE.Mesh>(null);
  // (2026-11-03) a foe's state: the ring at its feet, the net round one held, the word over it, the marker seen through walls by a sense; lines
  // (a harpoon's cable, a chain's arc); holograms; the smoke or darkness of a power's ground; the party's own shield bubble and duplicates;
  // its light
  const rings = useRef<Record<string, THREE.Mesh | null>>({});
  const nets = useRef<Record<string, THREE.Mesh | null>>({});
  const words = useRef<Record<string, any>>({});
  const sensed = useRef<Record<string, THREE.Mesh | null>>({});
  const lineMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const decoyMeshes = useRef<(THREE.Group | null)[]>([]);
  const fogMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const bubble = useRef<THREE.Mesh>(null);
  const imageMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const lamp = useRef<THREE.SpotLight>(null);
  const lampTarget = useMemo(() => new THREE.Object3D(), []);
  // What each figure is doing (interiors/limbs.ts Motion): ready to fight, the kick of each shot, each blade's strike, each blow taken
  const motions = useRef(new Map<string, { current: Motion }>());
  const motionOf = (u: Unit) => {
    let m = motions.current.get(u.id);
    if (!m) { m = { current: motion({ ready: true, kick: u.gun ? kickOf(u.name, u.gun.damage) : 0.4 }) }; motions.current.set(u.id, m); }
    return m;
  };
  const saber = useRef<THREE.Group>(null);
  const saberBlade = useRef<THREE.Group>(null);
  const blaster = useRef<THREE.Group>(null);
  const bladeColor = usePartyLook((s) => s.blade) ?? "#5aa9ff";
  const view = useView((v) => v.mode);

  // Keys for the fight; the aim targets of the foes, so that the crosshair names and colours them
  useEffect(() => bindShootKeys(), []);
  const hitBoxes = useRef<Record<string, THREE.Mesh | null>>({});
  useEffect(() => {
    const list = Object.entries(hitBoxes.current).filter(([, m]) => m);
    for (const [id, m] of list) {
      const u = sim.current.units.find((x) => x.id === id)!;
      m!.userData.aim = { label: u.name, onTap: () => {}, plan: () => ({ ok: true, text: `${Math.max(0, u.hp)}/${u.maxHp}` }) };
      m!.userData.person = true;
      AIM.targets.add(m!);
    }
    return () => { for (const [, m] of list) AIM.targets.delete(m!); };
  }, [session.id]);

  const tempV = useMemo(() => new THREE.Vector3(), []);
  const tempQ = useMemo(() => new THREE.Quaternion(), []);
  const Z = useMemo(() => new THREE.Vector3(0, 0, 1), []);

  const finish = (s: Sim, abandoned = false) => {
    const st = state.current;
    if (st.done) return;
    st.done = true;
    const p = playerOf(s);
    const result = abandoned ? "ongoing" : resultOf(s);
    const now = useCombat.getState();
    const mine = now.combatants.find((c) => c.isPlayer);
    const patch: Record<string, Partial<import("@/lib/stores/useCombat").Combatant>> = {};
    for (const u of s.units) {
      if (u.side === "player") continue;
      // (one taken alive is out of the fight as one beaten: at the party's mercy, a nemesis's grudge and all)
      patch[u.id] = { hp: u.fled || u.bound ? 0 : Math.max(0, Math.round(u.hp)), fled: u.fled || undefined, ...(u.side === "foe" ? { struck: u.struck } : {}) };
    }
    if (mine) {
      const a = mine.ammo;
      patch[String(mine.id)] = {
        hp: Math.max(0, Math.round(p.hp)), lastHitBy: s.lastHitOnPlayer,
        ...(p.points !== undefined && mine.powerPoints !== undefined ? { powerPoints: Math.max(0, p.points) } : {}),
        // (a launcher's shots are the grenades used, counted on the belt)
        ...(a && p.gun && !p.gun.launcher ? { ammo: { ...a, left: p.gun.left }, spentAmmo: { ...(mine.spentAmmo ?? {}), [a.round ?? a.plain]: (mine.spentAmmo?.[a.round ?? a.plain] ?? 0) + p.gun.spent } } : {}),
      };
    }
    // Mines and charges left set on the ground are picked up again (house rule, as on the tabletop): not used up
    for (const m of s.mines) if (m.side === "player" && st.used[m.name]) st.used[m.name]--;
    useShoot.getState().end(st.used);
    now.finishRealtime(abandoned ? "left" : result === "victory" ? "victory" : "stable", roundsOf(s), patch);
  };

  useFrame((_, delta) => {
    const s = sim.current;
    const c = ctx.current;
    const st = state.current;
    if (st.done || !c) return;
    const store = useShoot.getState();
    const p = playerOf(s);
    const now = performance.now();
    const f = c.feet();
    const me = { x: f.x + 0.5, y: f.y + 0.5, h: c.altitude(), facing: c.facing(), moving: c.moving(), airborne: c.airborne() };
    const dt = Math.min(delta, 0.1);
    const events: Event[] = [];
    // (a line on the screen for three seconds)
    const say = (text: string) => { st.note = text; st.noteAt = now; };
    if (st.note && st.noteAt && now - st.noteAt > 3000) { st.note = ""; st.noteAt = 0; }
    // Everyone is put on ground a body can stand on before the first frame is played
    if (!st.placed) {
      st.placed = true;
      placeUnits(s, c.env, { x: me.x, y: me.y, facing: me.facing });
    }
    // What was pressed since the last frame
    const edge = (k: "grenade" | "reload" | "swap" | "crouch" | "item" | "next" | "power0" | "power1" | "power2" | "power3" | "power4" | "power5" | "power6" | "power7" | "power8" | "page") => {
      const n = store.taps[k];
      const fresh = n !== st.seen[k];
      st.seen[k] = n;
      return fresh;
    };
    // (the crosshair is cast afresh for a shot or a throw, and otherwise a few times a second: it is a ray through every wall)
    const shot = c.shot(store.held.fire || store.taps.grenade !== st.seen.grenade || store.taps.item !== st.seen.item);
    if (shot) s.aim = shot.to;
    // The belt: what is left to use, the one shown, and the grenades (G throws the first; a launcher fires it)
    const belt = st.gear.filter((g) => g.count > 0);
    // (the one shown stays shown while there is any of it; when it runs out, the next one along)
    const at = belt.findIndex((g) => g.name === st.pickName);
    if (at >= 0) st.pick = at;
    const shown = belt.length ? belt[st.pick % belt.length] : undefined;
    st.pickName = shown?.name ?? "";
    const throwable = st.gear.find((g) => g.act.act === "throw" && g.count > 0);
    // (a net or bolas is picked up again after the fight: `keep`; what is spent for the rest is counted the same, and the game routes it)
    const spend = (g: FightGear) => {
      g.count--;
      if (!g.keep) st.used[usedName(g)] = (st.used[usedName(g)] ?? 0) + 1;
    };
    if (p.gun?.launcher) p.gun.shell = throwable?.act.act === "throw" ? throwable.act.blast : undefined;
    if (!p.dead && !st.ending) {
      if (edge("next") && belt.length) {
        st.pick = (st.pick + 1) % belt.length;
        st.pickName = belt[st.pick].name;
      }
      if (edge("item")) {
        if (!shown) say("Nothing to use");
        else {
          const why = applyGear(s, shown, c.env, events, shot?.to, c.place);
          if (!why) spend(shown);
          else if (why !== KEPT) say(why);
        }
      }
      if (edge("swap") && p.gun && p.blade) {
        st.weapon = st.weapon === "gun" ? "blade" : "gun";
        setBlock(s, false);
        st.note = st.weapon === "gun" ? `${p.gun.name} drawn` : `${p.blade.name} drawn`;
      }
      if (edge("reload") && st.weapon === "gun" && !reloadPlayer(s, events)) st.note = p.gun && p.gun.left >= p.gun.mag ? "" : p.gun && p.gun.reserve <= 0 && p.gun.left < p.gun.mag ? "No ammunition left to reload with" : "";
      if (edge("crouch")) {
        st.crouch = !st.crouch;
        p.crouch = st.crouch;
      }
      // (1 to 9 cast the page shown; 0 turns the page)
      const pages = Math.max(1, Math.ceil((p.powers?.length ?? 0) / PAGE));
      if (edge("page")) { st.page = (st.page + 1) % pages; st.note = pages > 1 ? `Powers ${st.page * PAGE + 1}–${Math.min(p.powers?.length ?? 0, (st.page + 1) * PAGE)}` : ""; }
      for (const [i, key] of (["power0", "power1", "power2", "power3", "power4", "power5", "power6", "power7", "power8"] as const).entries()) {
        if (!edge(key)) continue;
        const at = st.page * PAGE + i;
        const why = castPower(s, at, c.env, events, shot?.to, c.place);
        if (why) st.note = why;
        else if (p.powers?.[at]) st.note = "";
      }
      if (edge("grenade")) {
        const g = throwable;
        if (g && shot && g.act.act === "throw") {
          const d: [number, number, number] = [shot.to.x - shot.from.x, shot.to.y - shot.from.y, (shot.to.h - shot.from.h) / Math.max(1, Math.hypot(shot.to.x - shot.from.x, shot.to.y - shot.from.y))];
          const len = Math.hypot(d[0], d[1]) || 1;
          throwGrenade(s, g.act.blast, shot.from, [d[0] / len, d[1] / len, d[2]]);
          spend(g);
        } else if (!g) st.note = "You carry no grenades";
      }
      if (store.held.fire && shot) {
        if (st.weapon === "gun") {
          if (p.gun?.launcher && !p.gun.shell && p.fire <= 0) st.note = "No grenades for the launcher";
          if (firePlayer(s, shot.from, shot.to, events, me.moving, me.airborne)) {
            if (p.gun?.launcher && throwable) spend(throwable);
            st.firedAt = now;
            const kick = p.gun?.kick ?? 0.4;
            Object.assign(partyMotion.current, { firedAt: now / 1000, kick });
            // (the view climbs with the kick, less crouched)
            recoil.up += (0.008 + kick * 0.035) * (st.crouch ? 0.6 : 1);
          }
          else if (p.gun && p.gun.left <= 0 && p.reloading === 0 && p.fire <= 0) {
            if (p.gun.reserve > 0) reloadPlayer(s, events);
            else st.note = "Out of ammunition";
          }
        } else if (swingPlayer(s, events)) {
          st.swungAt = now;
          st.swingCombo = p.combo;
          partyMotion.current.swingAt = now / 1000;
          partyMotion.current.swing++;
        }
      }
      setBlock(s, store.held.block && st.weapon === "blade");
    } else setBlock(s, false);
    partyMotion.current.blocking = p.blocking && !p.dead;
    // (the gun is held up to where the crosshair is: its rise over the ground ahead)
    if (shot) partyMotion.current.pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(shot.to.h - shot.from.h, Math.hypot(shot.to.x - shot.from.x, shot.to.y - shot.from.y))));

    // The world, in steps no longer than a twentieth of a second
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(left, 0.05);
      events.push(...step(s, h, c.env, me));
      left -= h;
    }
    // (the party's pace in the fight, for the map that walks it: interiors/aim.ts stance)
    stance.pace = p.dead ? 1 : paceOf(p);
    const senses = sensesOf(p);
    const ear = senses.hearing;
    for (const e of events) {
      // (2026-11-03) A once-a-rest feature spent (counted by the game), what befell a foe, a line, a reel, a hologram, a duplicate struck, the
      // party seen; a shot heard from out of sight
      if (e.type === "once") { st.used[e.name] = (st.used[e.name] ?? 0) + 1; continue; }
      if (e.type === "status") {
        st.status[e.id] = { text: e.text, at: now };
        if (e.id !== "me") say(`${nameOf(s, e.id)} is ${e.text}`);
        sfx.power("stun");
        continue;
      }
      if (e.type === "line") { st.lines.push({ ...e, t: 0 }); continue; }
      if (e.type === "reel") {
        // (reeled along the cable to the last free square before where it bit)
        const d = Math.hypot(e.x - me.x, e.y - me.y);
        for (let k = d - 0.7; k >= 1; k -= 0.5) {
          const [x, y] = [me.x + ((e.x - me.x) / d) * k, me.y + ((e.y - me.y) / d) * k];
          if (fitsAt(c.env, Math.floor(x) + 0.5, Math.floor(y) + 0.5) && c.place?.(Math.floor(x), Math.floor(y))) { say("Reeled in"); break; }
        }
        continue;
      }
      if (e.type === "decoy") { say("A hologram flickers into being"); sfx.power("blind"); continue; }
      if (e.type === "image") { say("A duplicate takes the blow and vanishes"); st.blasts.push({ x: me.x, y: me.y, h: me.h + 1, t: 0, r: 0.5, life: 0.3, c: "#a5b4fc" }); continue; }
      if (e.type === "revealed") { say("You are seen!"); continue; }
      if (e.type === "shot" && e.from !== "me" && ear > 0 && Math.hypot(e.x - me.x, e.y - me.y) <= ear && !sees(c.env, { x: me.x, y: me.y, h: me.h }, e)) st.pings.push({ a: Math.atan2(e.x - me.x, e.y - me.y) - me.facing, at: now });
      if (e.type === "hit") {
        const struck = s.units.find((u) => u.id === e.target);
        if (struck) (struck.side === "player" ? partyMotion : motionOf(struck)).current.hitAt = now / 1000;
        if (e.target === "me") { store.setHud({ hurtAt: now }); sfx.hurt(); }
        else if (e.by === "me") { store.setHud({ hitAt: now, ...(e.head ? { headAt: now } : {}) }); sfx.hit(); }
        else sfx.hit();
        st.blasts.push({ x: e.x, y: e.y, h: e.h, t: 0, r: 0.2, life: 0.16, c: e.target === "me" ? "#ff5a4a" : "#ffe9a8" });
      } else if (e.type === "down" && e.id !== "me" && e.by === "me") { store.setHud({ killAt: now }); sfx.hit(true); }
      else if (e.type === "deflect") { store.setHud({ deflectAt: now }); sfx.deflect(); }
      else if (e.type === "explode") { st.blasts.push({ x: e.x, y: e.y, h: e.h, t: 0, r: e.radius, life: 0.5, c: "#ffb347" }); sfx.boom(); }
      else if (e.type === "shot" && e.from !== "me" && s.units.find((u) => u.id === e.from)) motionOf(s.units.find((u) => u.id === e.from)!).current.firedAt = now / 1000;
      if (e.type === "shot") sfx.shot(e.from === "me", Math.max(-1, Math.min(1, Math.sin(Math.atan2(e.x - me.x, e.y - me.y) - me.facing) * 0.8)));
      else if (e.type === "impact") { st.blasts.push({ x: e.x, y: e.y, h: e.h, t: 0, r: 0.18, life: 0.14, c: "#ffd27a" }); sfx.impact(); }
      else if (e.type === "swing") {
        st.swung[e.id] = now;
        sfx.swing();
        const u = s.units.find((x) => x.id === e.id);
        if (u && u.side !== "player") { const m = motionOf(u).current; m.swingAt = now / 1000; m.swing++; }
      }
      else if (e.type === "blocked") sfx.deflect();
      else if (e.type === "reload") sfx.reload();
      else if (e.type === "power") {
        sfx.power(e.kind);
        st.blasts.push({ x: e.tx, y: e.ty, h: e.th, t: 0, r: 0.6, life: 0.4, c: POWER_COLOR[e.kind] ?? "#ffffff" });
        if (e.kind === "damage") for (let i = 1; i <= 4; i++) st.blasts.push({ x: e.x + (e.tx - e.x) * (i / 5), y: e.y + (e.ty - e.y) * (i / 5), h: e.h + (e.th - e.h) * (i / 5), t: 0, r: 0.3, life: 0.3, c: POWER_COLOR.damage });
        store.setHud({ note: `${e.name}` });
      }
      // Items, and what the foes do with theirs: said on the screen for a moment
      else if (e.type === "use") {
        const who = s.units.find((u) => u.id === e.id);
        say(e.id === "me" ? `${e.name}${e.text ? `: ${e.text}` : ""}` : `${who?.name ?? "A foe"} uses a ${e.name.toLowerCase()}${e.text ? ` (${e.text})` : ""}`);
        if (who) st.blasts.push({ x: who.x, y: who.y, h: who.h + 1, t: 0, r: 0.45, life: 0.35, c: /medpac|stim|kit|heal/i.test(e.name) ? "#4ade80" : "#e5e7eb" });
        if (who && who.side !== "player") motionOf(who).current.posture = 1;
      } else if (e.type === "spray") {
        // a cone of fire (or acid, or lightning) from the foe's hands
        const c2 = FIELD_COLOR[e.dmgType] ?? "#ffd27a";
        for (let i = 1; i <= 6; i++) st.blasts.push({ x: e.x + (e.tx - e.x) * (i / 6), y: e.y + (e.ty - e.y) * (i / 6), h: e.h + (e.th - e.h) * (i / 6), t: -i * 0.03, r: 0.25 + i * 0.12, life: 0.45, c: c2 });
        sfx.boom();
        say(`${s.units.find((u) => u.id === e.id)?.name ?? "A foe"}: ${e.name}`);
      } else if (e.type === "lob") say(e.natural ? `${nameOf(s, e.id)} spits!` : `${nameOf(s, e.id)} throws a grenade!`);
      else if (e.type === "call") {
        say(e.jammed ? `${nameOf(s, e.id)} calls for help: jammed` : `${nameOf(s, e.id)} calls for backup!`);
        // (rings going out from the comlink: blue when the call gets through, grey when the jammer eats it)
        const who = s.units.find((u) => u.id === e.id);
        if (who) for (let i = 0; i < 3; i++) st.blasts.push({ x: who.x, y: who.y, h: who.h + 1.6, t: -i * 0.18, r: 0.35 + i * 0.25, life: 0.6, c: e.jammed ? "#9ca3af" : "#5ac8fa" });
      } else if (e.type === "arrive") {
        say("Their backup arrives");
        const who = s.units.find((u) => u.id === e.id);
        if (who) st.blasts.push({ x: who.x, y: who.y, h: who.h + 0.9, t: 0, r: 0.8, life: 0.5, c: "#f87171" });
      }
      // A foe begins a throw, a spray or breath, a call or a medpac: its figure plays the wind-up (a person: limbs.ts humanPose's act; a
      // monster rears back: creatureLunge), and the party is told, so that it can strike first and stop it
      else if (e.type === "act") {
        const who = s.units.find((u) => u.id === e.id);
        if (!who) continue;
        st.acts[e.id] = { at: now / 1000, for: e.seconds };
        Object.assign(motionOf(who).current, { act: e.act, actAt: nowSeconds(), actFor: e.seconds });
        const beast = monstrous(session.meta[e.id] ?? {});
        if (e.act === "throw") say(beast ? `${who.name} rears back to spit` : `${who.name} pulls a grenade`);
        else if (e.act === "spray") say(beast ? `${who.name} draws breath` : `${who.name} levels a sprayer`);
        else if (e.act === "call") say(`${who.name} reaches for a comlink`);
        else say(`${who.name} kneels over a medpac`);
      } else if (e.type === "broken") {
        const who = s.units.find((u) => u.id === e.id);
        if (who) { delete st.acts[e.id]; motionOf(who).current.act = undefined; }
        say(`${nameOf(s, e.id)} is stopped short`);
      } else if (e.type === "miss") {
        // (a blow that comes to nothing: a puff of air where it passed)
        const t = s.units.find((u) => u.id === e.target);
        if (t) st.blasts.push({ x: t.x, y: t.y, h: t.h + 1, t: 0, r: 0.3, life: 0.18, c: "#cbd5e1" });
      }
    }
    // A foe's grenade coming down near the party: the warning flashes
    if (s.grenades.some((g) => g.side !== "player" && !g.natural && Math.hypot(g.x - me.x, g.y - me.y) < g.kind.radius + 1.5)) store.setHud({ dangerAt: now });
    // The party's stance: down behind cover, leaning into a swing (the camera, the muzzle and the figure follow it: interiors/aim.ts)
    stance.k += ((st.crouch && !p.dead ? 1 : 0) - stance.k) * Math.min(1, dt * 10);
    stance.lunge = p.swing > 0 ? Math.sin(Math.PI * (1 - p.swing / SHOOT.saber.swing)) * 0.32 : 0;

    // ---- what is seen
    for (const u of s.units) {
      if (u.side === "player") continue;
      const g = group.current[u.id];
      if (!g) continue;
      g.position.set(u.x - c.cx, u.h, u.y - c.cz);
      // (the party's people on foot swim as it does: low in the water, in the swimming pose; beasts and droids are as they are)
      const meta = session.meta[u.id] ?? {};
      const swimAt = u.side === "ally" && !u.dead && !/beast|droid|construct/i.test(meta.creature ?? "") && !/droid|wildlife|beast/i.test(meta.role ?? "") ? c.swimAt?.() ?? null : null;
      // (bound, it lies on its front; kneeling over a medpac, it crouches)
      g.visible = u.mode !== "gone" || !!u.bound;
      motionOf(u).current.posture = swimAt !== null ? 3 : u.bound ? 2 : u.using ? 1 : 0;
      if (swimAt !== null) g.position.y = swimAt;
      if (u.dead) {
        // (it falls over in about a third of a second, and does not snap flat)
        st.died[u.id] ??= now;
        const k = Math.min(1, (now - st.died[u.id]) / 340);
        const ease = k * k * (3 - 2 * k);
        g.rotation.set(-Math.PI / 2 * ease, u.facing * (1 - ease), 0.4 * ease, "YXZ");
        g.position.y = u.h + 0.14 * ease;
      } else if (monstrous(meta)) {
        // (a monster has no hands to show it: it rears back to spit or breathe and lunges into its blow)
        const a = st.acts[u.id];
        const l = creatureLunge(now / 1000, (st.swung[u.id] ?? -1e9) / 1000, SHOOT.melee.windup, a?.at ?? -99, a?.for ?? 0);
        g.rotation.set(l.pitch, u.facing, 0, "YXZ");
        g.position.x += Math.sin(u.facing) * l.reach;
        g.position.z += Math.cos(u.facing) * l.reach;
        g.position.y += l.rise;
      } else {
        g.rotation.set(0, u.facing, 0, "YXZ");
      }
      const bar = bars.current[u.id];
      if (bar) {
        const k = Math.max(0.001, Math.min(1, u.hp / u.maxHp));
        bar.scale.x = k;
        bar.position.x = -0.45 * (1 - k);
        bar.parent!.visible = !u.dead && !u.bound;
      }
      const t = tele.current[u.id];
      if (t) {
        t.visible = u.aiming > 0 && !u.dead;
        if (t.visible) t.scale.setScalar(0.8 + 0.5 * Math.sin(now / 40));
      }
      // (2026-11-03) What it is under: a ring at its feet by colour (held, slowed, charmed, unaware, marked, turned, disarmed), a net round one
      // netted or held, the word over its head; a sensed foe's marker drawn through the walls
      const state = u.dead ? "" : (u.held ?? 0) > 0 ? (st.status[u.id]?.text === "netted" ? "netted" : "held") : (u.charmed ?? 0) > 0 ? "charmed" : (u.turned ?? 0) > 0 ? "turned" : (u.oblivious ?? 0) > 0 ? "unaware" : (u.slowed ?? 0) > 0 ? "slowed" : u.mark ? "marked" : u.disarmed ? "disarmed" : "";
      const ring = rings.current[u.id];
      if (ring) {
        ring.visible = !!state;
        if (state) {
          (ring.material as THREE.MeshBasicMaterial).color.set(STATUS_COLOR[state] ?? "#ffffff");
          ring.rotation.z = now / 600;
          ring.scale.setScalar(1 + 0.08 * Math.sin(now / 160));
        }
      }
      const net = nets.current[u.id];
      if (net) net.visible = state === "netted" || state === "held";
      const word = words.current[u.id];
      if (word && word.text !== state) word.text = state;
      const mark = sensed.current[u.id];
      if (mark) {
        const near = (sp: { x: number; y: number }, r: number) => Math.hypot(u.x - sp.x, u.y - sp.y) <= r;
        const felt = !u.dead && u.mode !== "gone" && u.side === "foe" && ((senses.through > 0 && near(me, senses.through)) || (!!s.eye && near(s.eye, 6)));
        mark.visible = felt;
        if (felt) mark.scale.setScalar(0.9 + 0.15 * Math.sin(now / 120));
      }
    }
    // Holograms (a decoy power's): ghostly figures where they stand, flickering
    const decoys = s.units.filter((u) => u.decoy && !u.dead);
    decoyMeshes.current.forEach((m, i) => {
      if (!m) return;
      const d = decoys[i];
      m.visible = !!d;
      if (!d) return;
      m.position.set(d.x - c.cx, d.h, d.y - c.cz);
      m.rotation.y = d.facing;
      m.scale.y = 1 + 0.03 * Math.sin(now / 37);
    });
    // The smoke, fog or darkness of a power's ground: a dome over it
    const fogs = s.fields.filter((f) => f.obscure);
    fogMeshes.current.forEach((m, i) => {
      if (!m) return;
      const f = fogs[i];
      m.visible = !!f;
      if (!f) return;
      m.position.set(f.x - c.cx, f.h, f.y - c.cz);
      m.scale.set(f.radius, f.radius * 0.6, f.radius);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.set(FIELD_COLOR[f.type] ?? "#9ca3af");
      mat.opacity = Math.min(0.75, f.t / 3) * (f.type === "dark" ? 0.95 : 0.6);
    });
    // Lines: a harpoon's cable, a chained shot's arc, for a moment
    st.lines = st.lines.filter((l) => (l.t += dt) < 0.45).slice(-POOL.lines);
    lineMeshes.current.forEach((m, i) => {
      if (!m) return;
      const l = st.lines[i];
      m.visible = !!l;
      if (!l) return;
      const a = new THREE.Vector3(l.x - c.cx, l.h, l.y - c.cz);
      const b = new THREE.Vector3(l.tx - c.cx, l.th, l.ty - c.cz);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.scale.set(1, 1, Math.max(0.01, a.distanceTo(b)));
      m.lookAt(b);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - l.t / 0.45);
    });
    // The party's own: a shield's bubble (temporary hit points from a power, a ward, AC), its duplicates, seen from behind; its light
    const shielded = !p.dead && (p.buffs ?? []).some((b) => b.temp || b.ac || b.resist || b.immune || b.retort || b.orbit);
    if (bubble.current) {
      bubble.current.visible = shielded && view !== "first";
      bubble.current.position.set(me.x - c.cx, me.h + 0.9, me.y - c.cz);
      const bb = (p.buffs ?? []).find((b) => b.orbit || b.retort || b.immune || b.resist || b.temp || b.ac);
      (bubble.current.material as THREE.MeshBasicMaterial).color.set(bb?.orbit ? "#38bdf8" : bb?.retort ? "#c7b8ff" : bb?.immune ? "#facc15" : "#7dd3fc");
      (bubble.current.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.05 * Math.sin(now / 200);
    }
    const images = (p.buffs ?? []).find((b) => (b.images ?? 0) > 0)?.images ?? 0;
    imageMeshes.current.forEach((m, i) => {
      if (!m) return;
      m.visible = i < images && !p.dead && view !== "first";
      const a = now / 700 + (i * Math.PI * 2) / 3;
      m.position.set(me.x - c.cx + Math.sin(a) * 0.7, me.h + 0.8, me.y - c.cz + Math.cos(a) * 0.7);
    });
    if (lamp.current) {
      lamp.current.visible = !!s.lit && !p.dead;
      lamp.current.position.copy(camera.position);
      lampTarget.position.copy(camera.position).add(new THREE.Vector3(0, 0, -6).applyQuaternion(camera.quaternion));
      lampTarget.updateMatrixWorld();
    }
    // The zoom held (macrobinoculars, a scope, a far eye: sensesOf zoom), eased in and out
    const want = store.held.zoom && senses.zoom > 0 ? senses.zoom : 1;
    st.zoom += (want - st.zoom) * Math.min(1, dt * 8);
    const cam = camera as THREE.PerspectiveCamera;
    if (Math.abs(cam.zoom - st.zoom) > 0.001) { cam.zoom = st.zoom; cam.updateProjectionMatrix(); }
    boltMeshes.current.forEach((m, i) => {
      if (!m) return;
      const b = s.bolts[i];
      m.visible = !!b;
      if (!b) return;
      m.position.set(b.x - c.cx, b.h, b.y - c.cz);
      tempV.set(b.vx, b.vh, b.vy).normalize();
      m.quaternion.copy(tempQ.setFromUnitVectors(Z, tempV));
      (m.material as THREE.MeshBasicMaterial).color.set(b.reflected ? BOLT_COLOR.reflected : b.blade ? bladeColor : b.harpoon ? "#cbd5e1" : b.natural ? NATURAL_COLOR[b.type] ?? NATURAL_COLOR.kinetic : BOLT_COLOR[b.side]);
      // (a spine or a glob is short and thick, a bolt a long streak; a thrown blade spins end over end, a harpoon is a dart)
      if (b.blade) { m.scale.set(1.6, 1.6, 1.4); m.rotateX(now / 40); }
      else m.scale.set(b.natural ? 2.2 : b.harpoon ? 1.4 : 1, b.natural ? 2.2 : b.harpoon ? 1.4 : 1, b.natural ? 0.35 : b.harpoon ? 0.6 : 1);
    });
    grenadeMeshes.current.forEach((m, i) => {
      if (!m) return;
      const g = s.grenades[i];
      m.visible = !!g;
      if (!g) return;
      m.position.set(g.x - c.cx, g.h, g.y - c.cz);
      // (a foe's is lit red; a monster's glob glows the colour of what it is)
      const mat = m.material as THREE.MeshStandardMaterial;
      const glob = g.natural ? NATURAL_COLOR[g.kind.type] ?? NATURAL_COLOR.kinetic : undefined;
      mat.emissive.set(glob ?? (g.side === "player" ? "#000000" : "#a01010"));
      mat.color.set(glob ?? "#3f4a36");
      m.scale.setScalar(glob ? 1.3 : 1);
    });
    // Mines and charges on the ground: a light that blinks once armed; the ground that burns or holds gas
    mineMeshes.current.forEach((m, i) => {
      if (!m) return;
      const x = s.mines[i];
      m.visible = !!x;
      if (!x) return;
      m.position.set(x.x - c.cx, x.h + 0.03, x.y - c.cz);
      m.rotation.y = x.facing;
      const light = m.children[1] as THREE.Mesh | undefined;
      if (light) light.visible = x.arm > 0 || Math.floor(now / (x.timer !== undefined ? 150 : 450)) % 2 === 0;
    });
    fieldMeshes.current.forEach((m, i) => {
      if (!m) return;
      const f = s.fields[i];
      m.visible = !!f;
      if (!f) return;
      m.position.set(f.x - c.cx, f.h + 0.04, f.y - c.cz);
      m.scale.set(f.radius, f.radius, 1);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.set(FIELD_COLOR[f.type] ?? "#ffb347");
      mat.opacity = Math.min(0.5, f.t / 4) * (0.75 + 0.25 * Math.sin(now / 90 + i));
    });
    st.blasts = st.blasts.filter((b) => (b.t += dt) < b.life).slice(-POOL.blasts);
    blastMeshes.current.forEach((m, i) => {
      if (!m) return;
      const b = st.blasts[i];
      m.visible = !!b && b.t >= 0;
      if (!b || b.t < 0) return;
      m.position.set(b.x - c.cx, b.h, b.y - c.cz);
      m.scale.setScalar(Math.max(0.05, b.r * (0.3 + 1.6 * (b.t / b.life))));
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.75 * (1 - b.t / b.life);
      mat.color.set(b.c);
    });

    // ---- what the party holds
    const yaw = me.facing;
    const base = tempV.set(me.x - c.cx, me.h + 1.0, me.y - c.cz);
    const right = rightOf(yaw);
    const eyes = view === "first";
    const kick = Math.max(0, 1 - (now - st.firedAt) / 90);
    if (flash.current) {
      flash.current.visible = kick > 0 && st.weapon === "gun" && !!shot;
      if (shot) flash.current.position.set(shot.from.x - c.cx, shot.from.h, shot.from.y - c.cz);
    }
    if (eyes) {
      // (a weapon drawn from the camera: first person has no body to show it on)
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const at = camera.position.clone().add(r.multiplyScalar(0.3)).add(up.multiplyScalar(-0.26)).add(fwd.clone().multiplyScalar(0.7 - kick * 0.05));
      if (blaster.current) { blaster.current.visible = st.weapon === "gun"; blaster.current.position.copy(at); blaster.current.quaternion.copy(camera.quaternion); blaster.current.scale.setScalar(0.55); }
      placeSaber(saber.current, saberBlade.current, at, camera.quaternion, st, p, now, true);
    } else {
      if (blaster.current) blaster.current.visible = false;
      const at = base.clone().add(right.clone().multiplyScalar(0.3));
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
      placeSaber(saber.current, saberBlade.current, at, q, st, p, now, false);
    }

    // ---- the numbers on the screen, and the roll the game keeps
    st.sync += dt;
    if (st.sync >= 0.12) {
      st.sync = 0;
      const g = p.gun;
      const throws = st.gear.filter((x) => x.act.act === "throw" && x.count > 0);
      store.setHud({
        hp: Math.max(0, Math.round(p.hp)), maxHp: p.maxHp, weapon: st.weapon, hasGun: !!g, hasBlade: !!p.blade, saber: !!p.blade?.saber, gun: g?.name,
        left: g?.launcher ? throws.reduce((n, x) => n + x.count, 0) : g?.left ?? 0, mag: g?.mag ?? 0, reserve: g?.launcher ? 0 : g?.reserve ?? 0, reloading: p.reloading > 0, grenade: throws[0]?.name, grenades: throws.reduce((n, x) => n + x.count, 0),
        item: shown?.name, items: shown?.count ?? 0, belt: belt.length,
        poisoned: p.poisoned > 0, burning: p.burning > 0, blinded: p.blind > 0, temp: Math.round(p.temp),
        focus: Math.round(p.focus), focusMax: SHOOT.focus.max, blocking: p.blocking, foes: s.units.filter((u) => u.side === "foe" && !u.dead && u.mode !== "gone").length, note: st.note,
        points: p.points ?? 0, crouching: st.crouch,
        powers: (p.powers ?? []).slice(st.page * PAGE, st.page * PAGE + PAGE).map((w) => ({ name: w.name, cost: w.cost, ready: (p.points ?? 0) >= w.cost && (p.powerCd ?? 0) <= 0 })),
        page: st.page, pages: Math.max(1, Math.ceil((p.powers?.length ?? 0) / PAGE)),
        buffs: (p.buffs ?? []).filter((b) => b.t < 590).map((b) => ({ name: b.name, t: Math.ceil(b.t) })).concat((p.buffs ?? []).filter((b) => b.t >= 590).map((b) => ({ name: b.name, t: 0 }))),
        states: [cloakedNow(p) && "Unseen", p.cloaked && !cloakedNow(p) && "Seen (a shot gave you away)", p.anchored && "Anchored", (p.held ?? 0) > 0 && "Held", (p.slowed ?? 0) > 0 && "Slowed", p.imbue && `Next hit +${Math.round(p.imbue.damage)} ${p.imbue.type}`, s.lit && "Light on", s.eye && "Eye out"].filter(Boolean) as string[],
        sensed: s.units.filter((u) => u.side === "foe" && !u.dead && u.mode !== "gone" && ((senses.through > 0 && Math.hypot(u.x - me.x, u.y - me.y) <= senses.through) || (!!s.eye && Math.hypot(u.x - s.eye.x, u.y - s.eye.y) <= 6))).length,
        zoom: st.zoom > 1.05 ? st.zoom : 0, range: shot ? Math.round(Math.hypot(shot.to.x - me.x, shot.to.y - me.y) * 5) : 0,
        pings: (st.pings = st.pings.filter((x) => now - x.at < 1500)).slice(-6),
      });
      useCombat.getState().syncRealtime({
        ...Object.fromEntries(s.units.filter((u) => u.side !== "player").map((u) => [u.id, { hp: u.fled ? 0 : Math.max(0, Math.round(u.hp)) }])),
        ...(useCombat.getState().combatants.find((x) => x.isPlayer) ? { [String(useCombat.getState().combatants.find((x) => x.isPlayer)!.id)]: { hp: Math.max(0, Math.round(p.hp)), ...(p.points !== undefined && useCombat.getState().combatants.find((x) => x.isPlayer)!.powerPoints !== undefined ? { powerPoints: Math.max(0, p.points) } : {}) } } : {}),
      });
    }
    // The fight is over a moment after its last blow
    if (resultOf(s) !== "ongoing") {
      st.ending += dt;
      if (st.ending > 1.4) finish(s);
    }
  });

  // The map is gone in the middle of a fight (the party left, the scene was rebuilt): the game must not be left "in combat" with nothing
  // running, so the fight ends as one the party left. (Deferred, so that a scene that is only built again, as the dev build does twice, goes on.)
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stance.k = 0;
      stance.lunge = 0;
      stance.pace = 1;
      const cam = camera as THREE.PerspectiveCamera;
      if (cam.zoom !== 1) { cam.zoom = 1; cam.updateProjectionMatrix(); }
      setTimeout(() => { if (!mounted.current && !state.current.done && useCombat.getState().realtime) finish(sim.current, true); }, 60);
    };
  }, []);

  const units = session.units.filter((u) => u.side !== "player");
  return (
    <group>
      {units.map((u) => {
        const meta = session.meta[u.id] ?? {};
        const large = isLarge(meta.size);
        return (
          <group key={u.id} ref={(g) => { group.current[u.id] = g; }}>
            {/* (a fighter with a saber holds it, and strikes and parries with the arms and body: interiors/limbs.ts) */}
            <MotionContext.Provider value={motionOf(u)}>
              <Figure kind={tokenOf({ name: u.name, role: meta.role ?? "", creature: meta.creature, isPlayer: false, forceUser: meta.role === "force" })} ring={meta.ring ?? (u.side === "ally" ? SIDE_COLORS.friendly : SIDE_COLORS.hostile)} name={u.name} large={large} species={meta.species} role={meta.role} creature={meta.creature} size={meta.size} fighting wield={u.blade?.saber ? "saber" : !u.gun && u.blade ? "vibro" : undefined} />
            </MotionContext.Provider>
            <mesh ref={(m) => { hitBoxes.current[u.id] = m; }} position={[0, 0.65, 0]}>
              <boxGeometry args={[0.7, 1.3, 0.7]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <Billboard position={[0, large ? 2.5 : 1.85, 0]}>
              <mesh><planeGeometry args={[0.9, 0.1]} /><meshBasicMaterial color="#111111" /></mesh>
              <mesh ref={(m) => { bars.current[u.id] = m; }} position={[0, 0, 0.001]}><planeGeometry args={[0.9, 0.1]} /><meshBasicMaterial color={u.side === "ally" ? "#4ade80" : "#f87171"} /></mesh>
              <Text position={[0, 0.24, 0]} fontSize={0.2} color={u.side === "ally" ? SIDE_COLORS.friendly : SIDE_COLORS.hostile} anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">{u.name}</Text>
            </Billboard>
            {/* a foe taking aim: a red glint at its weapon */}
            <mesh ref={(m) => { tele.current[u.id] = m; }} position={[0.2, 0.95, 0.4]} visible={false}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshBasicMaterial color="#ff2a1a" />
            </mesh>
            {/* what it is under: a ring at its feet, a net round it, the word over its head, and a marker a sense shows through the walls */}
            <mesh ref={(m) => { rings.current[u.id] = m; }} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} visible={false} renderOrder={4}>
              <ringGeometry args={[large ? 0.75 : 0.42, large ? 0.9 : 0.52, 24, 1, 0, Math.PI * 1.7]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.85} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            <mesh ref={(m) => { nets.current[u.id] = m; }} position={[0, large ? 1.1 : 0.75, 0]} visible={false}>
              <icosahedronGeometry args={[large ? 1.2 : 0.7, 1]} />
              <meshBasicMaterial color="#d6c79a" wireframe transparent opacity={0.8} />
            </mesh>
            <Billboard position={[0, large ? 2.85 : 2.2, 0]}>
              <Text ref={(t: any) => { words.current[u.id] = t; }} fontSize={0.16} color="#fde68a" anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">{""}</Text>
            </Billboard>
            <mesh ref={(m) => { sensed.current[u.id] = m; }} position={[0, large ? 1.6 : 1.1, 0]} visible={false} renderOrder={12}>
              <octahedronGeometry args={[0.16, 0]} />
              <meshBasicMaterial color="#f472b6" transparent opacity={0.85} depthTest={false} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
      {Array.from({ length: POOL.bolts }, (_, i) => (
        <mesh key={`b${i}`} ref={(m) => { boltMeshes.current[i] = m; }} visible={false} renderOrder={5}>
          <boxGeometry args={[0.05, 0.05, 0.8]} />
          <meshBasicMaterial color="#ff3b30" toneMapped={false} />
        </mesh>
      ))}
      {Array.from({ length: POOL.grenades }, (_, i) => (
        <mesh key={`g${i}`} ref={(m) => { grenadeMeshes.current[i] = m; }} visible={false}>
          <sphereGeometry args={[0.11, 10, 10]} />
          <meshStandardMaterial color="#3f4a36" />
        </mesh>
      ))}
      {Array.from({ length: POOL.mines }, (_, i) => (
        <group key={`m${i}`} ref={(m) => { mineMeshes.current[i] = m; }} visible={false}>
          <mesh><cylinderGeometry args={[0.16, 0.19, 0.07, 12]} /><meshStandardMaterial color="#3a3f36" metalness={0.5} roughness={0.5} /></mesh>
          <mesh position={[0, 0.05, 0.08]}><sphereGeometry args={[0.035, 8, 8]} /><meshBasicMaterial color="#ff2a1a" toneMapped={false} /></mesh>
        </group>
      ))}
      {Array.from({ length: POOL.fields }, (_, i) => (
        <mesh key={`f${i}`} ref={(m) => { fieldMeshes.current[i] = m; }} visible={false} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
          <circleGeometry args={[1, 28]} />
          <meshBasicMaterial color="#ff7a1a" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      {Array.from({ length: POOL.blasts }, (_, i) => (
        <mesh key={`x${i}`} ref={(m) => { blastMeshes.current[i] = m; }} visible={false} renderOrder={6}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshBasicMaterial color="#ffb347" transparent opacity={0.7} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh ref={flash} visible={false} renderOrder={7}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial color="#fff2b0" toneMapped={false} />
      </mesh>
      {/* (2026-11-03) lines (a harpoon's cable), holograms, smoke and darkness, the party's shield bubble and duplicates, its light */}
      {Array.from({ length: POOL.lines }, (_, i) => (
        <mesh key={`l${i}`} ref={(m) => { lineMeshes.current[i] = m; }} visible={false} renderOrder={6}>
          <boxGeometry args={[0.025, 0.025, 1]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.9} toneMapped={false} />
        </mesh>
      ))}
      {Array.from({ length: POOL.decoys }, (_, i) => (
        <group key={`d${i}`} ref={(g) => { decoyMeshes.current[i] = g; }} visible={false}>
          <mesh position={[0, 0.55, 0]}><capsuleGeometry args={[0.24, 0.6, 4, 10]} /><meshBasicMaterial color="#60a5fa" transparent opacity={0.45} depthWrite={false} toneMapped={false} /></mesh>
          <mesh position={[0, 1.25, 0]}><sphereGeometry args={[0.16, 10, 10]} /><meshBasicMaterial color="#93c5fd" transparent opacity={0.5} depthWrite={false} toneMapped={false} /></mesh>
        </group>
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={`o${i}`} ref={(m) => { fogMeshes.current[i] = m; }} visible={false} renderOrder={5}>
          <sphereGeometry args={[1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshBasicMaterial color="#9ca3af" transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh ref={bubble} visible={false} renderOrder={6}>
        <sphereGeometry args={[0.85, 20, 14]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0.15} depthWrite={false} toneMapped={false} />
      </mesh>
      {Array.from({ length: POOL.images }, (_, i) => (
        <mesh key={`i${i}`} ref={(m) => { imageMeshes.current[i] = m; }} visible={false}>
          <capsuleGeometry args={[0.22, 0.7, 4, 10]} />
          <meshBasicMaterial color="#a5b4fc" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <primitive object={lampTarget} />
      <spotLight ref={lamp} visible={false} intensity={40} distance={30} angle={0.45} penumbra={0.5} color="#fff7e0" target={lampTarget} />
      {/* the field meshes are reused for a power's ground (smoke, caltrops) too */}
      {/* the blaster in the hand, seen from the eyes */}
      <group ref={blaster} visible={false} renderOrder={8}>
        <mesh position={[0, 0, -0.1]}><boxGeometry args={[0.07, 0.1, 0.4]} /><meshStandardMaterial color="#2b2f36" metalness={0.6} roughness={0.4} /></mesh>
        <mesh position={[0, -0.09, 0.02]}><boxGeometry args={[0.05, 0.12, 0.07]} /><meshStandardMaterial color="#1c1f24" /></mesh>
        <mesh position={[0, 0.01, -0.34]}><boxGeometry args={[0.03, 0.03, 0.14]} /><meshStandardMaterial color="#14161a" /></mesh>
      </group>
      {/* the lightsaber: hilt and blade, swung and held up (see placeSaber) */}
      <group ref={saber} visible={false}>
        <group ref={saberBlade}>
          <mesh position={[0, 0.06, 0]}><cylinderGeometry args={[0.022, 0.026, 0.2, 10]} /><meshStandardMaterial color="#8a8f98" metalness={0.8} roughness={0.3} /></mesh>
          <mesh position={[0, 0.62, 0]}><cylinderGeometry args={[0.018, 0.018, 1.08, 10]} /><meshBasicMaterial color={bladeColor} toneMapped={false} /></mesh>
          <mesh position={[0, 0.62, 0]}><cylinderGeometry args={[0.05, 0.05, 1.12, 10]} /><meshBasicMaterial color={bladeColor} transparent opacity={0.28} depthWrite={false} toneMapped={false} /></mesh>
        </group>
      </group>
    </group>
  );
}

// The saber's pose: carried low in front; swung in an arc (a slash from the left, one from the right, then an overhead cut: the chain's third);
// held up across the front when blocking. `p` is the party's unit (its timers say where in the swing it is).
function placeSaber(g: THREE.Group | null, blade: THREE.Group | null, at: THREE.Vector3, q: THREE.Quaternion, st: { weapon: "gun" | "blade"; swingCombo: number }, p: Unit, now: number, eyes: boolean) {
  if (!g || !blade) return;
  const draw = st.weapon === "blade" && !!p.blade && !p.dead && eyes;
  g.visible = draw;
  if (!draw) return;
  g.position.copy(at);
  g.quaternion.copy(q);
  // (held close to the camera it is drawn smaller, or it would fill the view)
  g.scale.setScalar(eyes ? 0.5 : 1);
  const swinging = p.swing > 0;
  const k = swinging ? 1 - p.swing / SHOOT.saber.swing : 0;
  const ease = k * k * (3 - 2 * k);
  const chain = st.swingCombo % 3;
  let sweep = 0;
  let tilt = eyes ? 0.9 : 1.0;
  let roll = 0;
  if (p.blocking) {
    sweep = -0.35;
    tilt = 0.45;
    roll = 0.25;
  } else if (swinging) {
    if (chain === 0) { sweep = 1.25 - 2.5 * ease; tilt = 1.35; }
    else if (chain === 1) { sweep = -1.25 + 2.5 * ease; tilt = 1.35; roll = 0.3; }
    else { sweep = 0; tilt = -0.7 + 2.5 * ease; }
  } else {
    // idle: a slow sway
    sweep = Math.sin(now / 900) * 0.05;
    tilt = 1.0 + Math.sin(now / 1200) * 0.04;
  }
  // (the camera looks down its own -z, a figure along +z: the tilt forward and the lean change sign, the sweep to the left does not)
  blade.rotation.set(eyes ? -tilt : tilt, sweep, eyes ? -roll : roll, "YXZ");
}
