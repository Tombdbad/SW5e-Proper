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
  SHOOT, castPower, firePlayer, newSim, placeUnits, playerOf, reloadPlayer, resultOf, roundsOf, setBlock, step, swingPlayer, throwGrenade,
  type Env, type Event, type Sim, type Unit,
} from "@shared/logic/shooter";
import { Figure, usePartyLook } from "../models";
import { SIDE_COLORS, tokenOf } from "../sprites";
import { AIM, rightOf, stance, useView } from "./aim";
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
}

const POOL = { bolts: 72, grenades: 6, blasts: 16 };
// What a power looks like where it takes hold
const POWER_COLOR: Record<string, string> = { damage: "#9ad0ff", heal: "#4ade80", stun: "#fde047", fear: "#a78bfa", blind: "#ffffff", push: "#e5e7eb", pull: "#c4b5fd" };
const BOLT_COLOR = { foe: "#ff3b30", ally: "#5ac8fa", player: "#7dd3fc", reflected: "#ffd60a" };
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
    seen: { fire: 0, grenade: 0, reload: 0, block: 0, swap: 0, crouch: 0, power0: 0, power1: 0, power2: 0, power3: 0 },
    crouch: false,
    // when each fallen unit went down, and when each unit last swung (the figures fall and swing over a moment, not at once)
    died: {} as Record<string, number>,
    swung: {} as Record<string, number>,
    weapon: (session.units.find((u) => u.side === "player")?.gun ? "gun" : "blade") as "gun" | "blade",
    grenades: session.grenades.map((g) => ({ ...g })),
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
  const flash = useRef<THREE.Mesh>(null);
  const foeSabers = useRef<Record<string, THREE.Group | null>>({});
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
      patch[u.id] = { hp: u.fled ? 0 : Math.max(0, Math.round(u.hp)), fled: u.fled || undefined, ...(u.side === "foe" ? { struck: u.struck } : {}) };
    }
    if (mine) {
      const a = mine.ammo;
      patch[String(mine.id)] = {
        hp: Math.max(0, Math.round(p.hp)), lastHitBy: s.lastHitOnPlayer,
        ...(p.points !== undefined && mine.powerPoints !== undefined ? { powerPoints: Math.max(0, p.points) } : {}),
        ...(a && p.gun ? { ammo: { ...a, left: p.gun.left }, spentAmmo: { ...(mine.spentAmmo ?? {}), [a.round ?? a.plain]: (mine.spentAmmo?.[a.round ?? a.plain] ?? 0) + p.gun.spent } } : {}),
      };
    }
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
    // Everyone is put on ground a body can stand on before the first frame is played
    if (!st.placed) {
      st.placed = true;
      placeUnits(s, c.env, { x: me.x, y: me.y, facing: me.facing });
    }
    // What was pressed since the last frame
    const edge = (k: "grenade" | "reload" | "swap" | "crouch" | "power0" | "power1" | "power2" | "power3") => {
      const n = store.taps[k];
      const fresh = n !== st.seen[k];
      st.seen[k] = n;
      return fresh;
    };
    // (the crosshair is cast afresh for a shot or a throw, and otherwise a few times a second: it is a ray through every wall)
    const shot = c.shot(store.held.fire || store.taps.grenade !== st.seen.grenade);
    if (shot) s.aim = shot.to;
    if (!p.dead && !st.ending) {
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
      for (const [i, key] of (["power0", "power1", "power2", "power3"] as const).entries()) {
        if (!edge(key)) continue;
        const why = castPower(s, i, c.env, events);
        if (why) st.note = why;
        else if (p.powers?.[i]) st.note = "";
      }
      if (edge("grenade")) {
        const g = st.grenades.find((x) => x.count > 0);
        if (g && shot) {
          const d: [number, number, number] = [shot.to.x - shot.from.x, shot.to.y - shot.from.y, (shot.to.h - shot.from.h) / Math.max(1, Math.hypot(shot.to.x - shot.from.x, shot.to.y - shot.from.y))];
          const len = Math.hypot(d[0], d[1]) || 1;
          throwGrenade(s, g.kind, shot.from, [d[0] / len, d[1] / len, d[2]]);
          g.count--;
          st.used[g.kind.name] = (st.used[g.kind.name] ?? 0) + 1;
        } else if (!g) st.note = "You carry no grenades";
      }
      if (store.held.fire && shot) {
        if (st.weapon === "gun") {
          if (firePlayer(s, shot.from, shot.to, events, me.moving, me.airborne)) st.firedAt = now;
          else if (p.gun && p.gun.left <= 0 && p.reloading === 0 && p.fire <= 0) {
            if (p.gun.reserve > 0) reloadPlayer(s, events);
            else st.note = "Out of ammunition";
          }
        } else if (swingPlayer(s, events)) {
          st.swungAt = now;
          st.swingCombo = p.combo;
        }
      }
      setBlock(s, store.held.block && st.weapon === "blade");
    } else setBlock(s, false);

    // The world, in steps no longer than a twentieth of a second
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(left, 0.05);
      events.push(...step(s, h, c.env, me));
      left -= h;
    }
    for (const e of events) {
      if (e.type === "hit") {
        if (e.target === "me") { store.setHud({ hurtAt: now }); sfx.hurt(); }
        else if (e.by === "me") { store.setHud({ hitAt: now, ...(e.head ? { headAt: now } : {}) }); sfx.hit(); }
        else sfx.hit();
        st.blasts.push({ x: e.x, y: e.y, h: e.h, t: 0, r: 0.2, life: 0.16, c: e.target === "me" ? "#ff5a4a" : "#ffe9a8" });
      } else if (e.type === "down" && e.id !== "me" && e.by === "me") { store.setHud({ killAt: now }); sfx.hit(true); }
      else if (e.type === "deflect") { store.setHud({ deflectAt: now }); sfx.deflect(); }
      else if (e.type === "explode") { st.blasts.push({ x: e.x, y: e.y, h: e.h, t: 0, r: e.radius, life: 0.5, c: "#ffb347" }); sfx.boom(); }
      else if (e.type === "shot") sfx.shot(e.from === "me", Math.max(-1, Math.min(1, Math.sin(Math.atan2(e.x - me.x, e.y - me.y) - me.facing) * 0.8)));
      else if (e.type === "impact") { st.blasts.push({ x: e.x, y: e.y, h: e.h, t: 0, r: 0.18, life: 0.14, c: "#ffd27a" }); sfx.impact(); }
      else if (e.type === "swing") { st.swung[e.id] = now; sfx.swing(); }
      else if (e.type === "blocked") sfx.deflect();
      else if (e.type === "reload") sfx.reload();
      else if (e.type === "power") {
        sfx.power(e.kind);
        st.blasts.push({ x: e.tx, y: e.ty, h: e.th, t: 0, r: 0.6, life: 0.4, c: POWER_COLOR[e.kind] ?? "#ffffff" });
        if (e.kind === "damage") for (let i = 1; i <= 4; i++) st.blasts.push({ x: e.x + (e.tx - e.x) * (i / 5), y: e.y + (e.ty - e.y) * (i / 5), h: e.h + (e.th - e.h) * (i / 5), t: 0, r: 0.3, life: 0.3, c: POWER_COLOR.damage });
        store.setHud({ note: `${e.name}` });
      }
    }
    // The party's stance: down behind cover, leaning into a swing (the camera, the muzzle and the figure follow it: interiors/aim.ts)
    stance.k += ((st.crouch && !p.dead ? 1 : 0) - stance.k) * Math.min(1, dt * 10);
    stance.lunge = p.swing > 0 ? Math.sin(Math.PI * (1 - p.swing / SHOOT.saber.swing)) * 0.32 : 0;

    // ---- what is seen
    for (const u of s.units) {
      if (u.side === "player") continue;
      const g = group.current[u.id];
      if (!g) continue;
      g.visible = u.mode !== "gone";
      g.position.set(u.x - c.cx, u.h, u.y - c.cz);
      if (u.dead) {
        // (it falls over in about a third of a second, and does not snap flat)
        st.died[u.id] ??= now;
        const k = Math.min(1, (now - st.died[u.id]) / 340);
        const ease = k * k * (3 - 2 * k);
        g.rotation.set(-Math.PI / 2 * ease, u.facing * (1 - ease), 0.4 * ease, "YXZ");
        g.position.y = u.h + 0.14 * ease;
      } else {
        g.rotation.set(0, u.facing, 0, "YXZ");
      }
      // A foe's saber: carried low, and swung across in an arc when it strikes (its blow is felt at the same moment: shooter.ts)
      const fs = foeSabers.current[u.id];
      if (fs) {
        const since = (now - (st.swung[u.id] ?? -9999)) / 450;
        fs.visible = !u.dead;
        const swinging = since >= 0 && since < 1;
        fs.rotation.set(swinging ? 1.35 : 1.0, swinging ? 1.25 - 2.5 * since : 0, 0);
      }
      const bar = bars.current[u.id];
      if (bar) {
        const k = Math.max(0.001, Math.min(1, u.hp / u.maxHp));
        bar.scale.x = k;
        bar.position.x = -0.45 * (1 - k);
        bar.parent!.visible = !u.dead;
      }
      const t = tele.current[u.id];
      if (t) {
        t.visible = u.aiming > 0 && !u.dead;
        if (t.visible) t.scale.setScalar(0.8 + 0.5 * Math.sin(now / 40));
      }
    }
    boltMeshes.current.forEach((m, i) => {
      if (!m) return;
      const b = s.bolts[i];
      m.visible = !!b;
      if (!b) return;
      m.position.set(b.x - c.cx, b.h, b.y - c.cz);
      tempV.set(b.vx, b.vh, b.vy).normalize();
      m.quaternion.copy(tempQ.setFromUnitVectors(Z, tempV));
      (m.material as THREE.MeshBasicMaterial).color.set(b.reflected ? BOLT_COLOR.reflected : BOLT_COLOR[b.side]);
    });
    grenadeMeshes.current.forEach((m, i) => {
      if (!m) return;
      const g = s.grenades[i];
      m.visible = !!g;
      if (g) m.position.set(g.x - c.cx, g.h, g.y - c.cz);
    });
    st.blasts = st.blasts.filter((b) => (b.t += dt) < b.life).slice(-POOL.blasts);
    blastMeshes.current.forEach((m, i) => {
      if (!m) return;
      const b = st.blasts[i];
      m.visible = !!b;
      if (!b) return;
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
      const gr = st.grenades.find((x) => x.count > 0);
      store.setHud({
        hp: Math.max(0, Math.round(p.hp)), maxHp: p.maxHp, weapon: st.weapon, hasGun: !!g, hasBlade: !!p.blade, saber: !!p.blade?.saber, gun: g?.name,
        left: g?.left ?? 0, mag: g?.mag ?? 0, reserve: g?.reserve ?? 0, reloading: p.reloading > 0, grenade: gr?.kind.name, grenades: st.grenades.reduce((n, x) => n + x.count, 0),
        focus: Math.round(p.focus), focusMax: SHOOT.focus.max, blocking: p.blocking, foes: s.units.filter((u) => u.side === "foe" && !u.dead && u.mode !== "gone").length, note: st.note,
        points: p.points ?? 0, crouching: st.crouch,
        powers: (p.powers ?? []).map((w) => ({ name: w.name, cost: w.cost, ready: (p.points ?? 0) >= w.cost && (p.powerCd ?? 0) <= 0 })),
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
            <Figure kind={tokenOf({ name: u.name, role: meta.role ?? "", creature: meta.creature, isPlayer: false, forceUser: meta.role === "force" })} ring={meta.ring ?? (u.side === "ally" ? SIDE_COLORS.friendly : SIDE_COLORS.hostile)} name={u.name} large={large} species={meta.species} role={meta.role} creature={meta.creature} size={meta.size} fighting />
            {u.blade?.saber && (
              <group position={[0.28, 0.95, 0.12]} ref={(g) => { foeSabers.current[u.id] = g; }} rotation={[1.0, 0, 0]}>
                <mesh position={[0, 0.06, 0]}><cylinderGeometry args={[0.022, 0.026, 0.2, 8]} /><meshStandardMaterial color="#8a8f98" metalness={0.8} roughness={0.3} /></mesh>
                <mesh position={[0, 0.62, 0]}><cylinderGeometry args={[0.018, 0.018, 1.08, 8]} /><meshBasicMaterial color={u.name && /sith|inquisitor|dark/i.test(`${u.name} ${meta.role ?? ""}`) ? "#ff3030" : "#5aa9ff"} toneMapped={false} /></mesh>
              </group>
            )}
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
  const draw = st.weapon === "blade" && !!p.blade && !p.dead;
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
