// The dogfight's heads-up display: hull and shields, ordnance, the objective (generators, bays, the port, the gates and the core), the target's
// card, warnings; and the markers laid over the view (brackets on the target, diamonds on generators, bays and the port, pips at the screen's
// edge for what is off it). `hudOf` reads the rules' state into a plain snapshot, ten times a second; the markers are moved a frame at a time
// from what the scene projects (`OverlayData`), by the DOM and not through React.
import { useEffect, useRef } from "react";
import { ARENA, CLASSES, isCapital, scenarioOf, type Dogfight, type Vessel } from "@shared/logic/dogfight";
import { isDown, partyOf, shielded, weaponSlots } from "@shared/logic/dogfightSim";

export type MarkKind = "foe" | "big" | "gen" | "bay" | "port" | "locked" | "core" | "turret" | "ally" | "drop";
export interface Mark { x: number; y: number; behind: boolean; kind: MarkKind; label: string; dist: number; frac: number }
// `nose`: where the craft's nose points on the screen (-1 to 1 each way, y up), for the reticule
export interface OverlayData { marks: Mark[]; aim: Mark | null; hullDist: number | null; nose: { x: number; y: number; behind: boolean } | null }
export const emptyOverlay = (): OverlayData => ({ marks: [], aim: null, hullDist: null, nose: null });

export interface HudData {
  title: string;
  hull: number;
  hullMax: number;
  shield: number;
  shieldMax: number;
  // The shield is coming back (a while has passed since the last hit and it is not full)
  recharging: boolean;
  speed: number;
  // The throttle's setting (0 to 1: it holds), and the roll of the craft in degrees (to the right positive)
  throttle: number;
  roll: number;
  // The test build's unlimited hull and weapons are on
  god: boolean;
  // The guns, each ordnance launcher and the bombs, the active one marked (the mouse fires it)
  weapons: { name: string; kind: string; ammo: number | null; ammoMax: number | null; active: boolean }[];
  ord: { name: string; ammo: number; ammoMax: number; kind: string; selected: boolean }[];
  bombs: { name: string; ammo: number; ammoMax: number } | null;
  t: number;
  limit: number;
  objective: string[];
  target: null | { name: string; sub: string; hullFrac: number; note: string; parts: string };
  warn: string[];
  interior: null | { gates: string; boost: number; coreFrac: number; escape: number; phase: string };
  said: string[];
  onTarget: boolean;
  lockOn: boolean;
  foes: number;
  kills: number;
}

const count = (v: Vessel, kind: string) => ({ up: v.parts.filter((p) => p.kind === kind && p.alive).length, all: v.parts.filter((p) => p.kind === kind).length });

export function hudOf(s: Dogfight, hullDist: number | null = null): HudData {
  const me = partyOf(s);
  const sheet = me.c.sheet;
  const I = s.interior;
  const ord = me.guns.filter((g) => g.kind === "missile" || g.kind === "torpedo" || g.kind === "rocket");
  const sel = ord.length ? ((s.sel % ord.length) + ord.length) % ord.length : -1;
  const bomb = me.guns.find((g) => g.kind === "bomb");
  const foes = s.vessels.filter((v) => v.side === "foe" && !isDown(v));
  const big = foes.filter((v) => isCapital(v.cls) || v.cls === "Large").sort((a, b) => CLASSES[b.cls].length - CLASSES[a.cls].length)[0];
  const objective: string[] = [];
  const warn: string[] = [];
  const A = s.air;
  if (A) {
    const pieces = s.vessels.filter((v) => v.ground);
    const standing = (side: string, kind?: string) => pieces.filter((v) => v.side === side && (!kind || v.ground!.kind === kind) && !isDown(v));
    if (A.goal === "defend") {
      objective.push(`Buildings standing: ${A.total - A.lost} of ${A.total} (half lost loses the fight)`);
      objective.push(`Bombers left: ${foes.filter((v) => v.guns.some((g) => g.kind === "bomb" && g.ammo > 0)).length}`);
    } else if (A.goal === "raid") {
      objective.push(`Targets left: ${pieces.filter((v) => v.side === "foe" && v.ground!.target && !isDown(v)).length} of ${A.total}`);
      objective.push(`Flak: ${standing("foe", "flak").length}`);
    } else if (A.goal === "escort") {
      objective.push(`Convoy: ${A.total - A.lost} of ${A.total} rolling, ${A.arrived} through`);
    } else objective.push(`Convoy: ${A.total - standing("foe", "vehicle").length} of ${A.total} destroyed, ${A.arrived} got away`);
    objective.push(`Altitude ${Math.round(me.p[1])} m`);
    if (me.p[1] < 60 && me.pitch < -0.1) warn.push("PULL UP");
  } else if (I) {
    objective.push(I.phase === "escape" ? "Out through the exhaust shaft!" : `Gate ${Math.min(I.gates, I.tunnel.gates.length)} of ${I.tunnel.gates.length}`);
    if (I.core.hp > 0) objective.push(`Reactor core ${Math.max(0, Math.round((I.core.hp / I.core.hpMax) * 100))}%: put ordnance into it`);
  } else if (big) {
    const gens = count(big, "generator");
    const bays = count(big, "hangar");
    const guns = { b: count(big, "battery"), p: count(big, "pd") };
    objective.push(`${big.name} (${big.cls} ${big.role})`);
    if (gens.all) objective.push(gens.up ? `Shield generators: ${gens.up} of ${gens.all} standing` : "Shields down: the hull can be hurt");
    if (big.cls === "Station") {
      const port = big.parts.find((p) => p.kind === "port");
      objective.push(port && port.open >= 1 ? "The port is open: fly in" : gens.up ? "The port is sealed by the shields" : "The port is opening");
      objective.push("Its armor holds from outside: the reactor is the way");
    } else if (bays.all) objective.push(bays.up ? `Hangar bays: ${bays.up} of ${bays.all} (they launch fighters)` : "Hangar bays destroyed");
    if (guns.b.all + guns.p.all) objective.push(`Guns: ${guns.b.up + guns.p.up} of ${guns.b.all + guns.p.all} (not needed to win)`);
    objective.push(`${foes.length - 1} other foe${foes.length === 2 ? "" : "s"} aloft`);
  } else objective.push(`${foes.length} foe${foes.length === 1 ? "" : "s"} left`);
  if (s.warnings.missile > 0) warn.push(`MISSILE ${Math.round(s.warnings.missile)} m: break hard`);
  if (s.warnings.outside > 0) warn.push(`${A && me.p[1] > A.ceiling ? "The air is too thin" : "Leaving the arena"}: turn back (${Math.max(0, Math.ceil(8 - s.warnings.outside))} s)`);
  if (!I && hullDist !== null && hullDist < 90) warn.push(`Hull ahead ${Math.round(hullDist)} m: pull away`);
  if (me.c.hull / sheet.hullMax < 0.3 && me.c.hull > 0) warn.push("Hull critical");
  // The target card: the locked ship, else what the reticule is on
  const tv = (s.lock !== null ? s.vessels.find((v) => v.id === s.lock) : null) ?? (s.aim && s.aim.part !== -2 ? s.vessels.find((v) => v.id === s.aim!.vessel) : null);
  let target: HudData["target"] = null;
  if (tv && !I) {
    const sh = shielded(tv);
    const part = s.lock === tv.id && s.lockPart >= 0 ? tv.parts[s.lockPart] : s.aim && s.aim.vessel === tv.id && s.aim.part >= 0 ? tv.parts[s.aim.part] : null;
    target = {
      name: tv.name,
      sub: `${tv.cls} ${tv.role}`,
      hullFrac: tv.c.hull / tv.c.sheet.hullMax,
      note: sh ? "SHIELDED by its generators" : isCapital(tv.cls) ? "shields down" : tv.c.sheet.hasShield ? `shield ${Math.round(tv.c.shield)} of ${tv.c.sheet.shieldMax}` : "no shield",
      parts: part ? `${s.lock === tv.id && s.lockPart === part.id ? "TARGET: " : ""}${part.kind} ${Math.round((part.hp / part.hpMax) * 100)}%` : tv.parts.length ? `${count(tv, "generator").up} gen · ${count(tv, "hangar").up} bay · ${count(tv, "battery").up + count(tv, "pd").up} guns` : "",
    };
  }
  return {
    title: scenarioOf(s.scenario).name,
    hull: Math.max(0, Math.round(me.c.hull)),
    hullMax: sheet.hullMax,
    shield: Math.max(0, Math.round(me.c.shield)),
    shieldMax: sheet.shieldMax,
    recharging: sheet.hasShield && me.c.shield < sheet.shieldMax && me.calm > ARENA.partyWait && !I,
    speed: Math.round(I ? I.craft.speed : me.speed),
    throttle: I ? (me.top > 0 ? Math.max(0, Math.min(1, I.craft.speed / me.top)) : 0) : s.throttle,
    roll: I ? 0 : Math.round((me.roll * 180) / Math.PI),
    god: s.god,
    weapons: weaponSlots(me).map((w, i) => ({ name: w.name, kind: w.kind, ammo: w.ammo, ammoMax: w.ammoMax, active: i === s.slot })),
    ord: ord.map((g, i) => ({ name: g.name, ammo: g.ammo, ammoMax: g.ammoMax, kind: g.kind, selected: i === sel })),
    bombs: bomb ? { name: bomb.name, ammo: bomb.ammo, ammoMax: bomb.ammoMax } : null,
    t: s.t,
    limit: s.limit,
    objective,
    target,
    warn,
    interior: I ? { gates: `${Math.min(I.gates, I.tunnel.gates.length)}/${I.tunnel.gates.length}`, boost: I.boost, coreFrac: Math.max(0, I.core.hp / I.core.hpMax), escape: I.escape, phase: I.phase } : null,
    said: s.log.slice(-3),
    onTarget: !!s.aim,
    lockOn: s.lock !== null,
    foes: foes.length,
    kills: Object.values(s.kills).reduce((n, k) => n + k, 0),
  };
}

// A bar with its label and numbers above it, two of them side by side in the panel
function Gauge({ label, value, max, color, testid, pulse, reading }: { label: string; value: number; max: number; color: string; testid?: string; pulse?: boolean; reading?: string }) {
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div data-testid={testid} data-value={Math.round(value)} data-max={Math.round(max)} data-recharging={pulse ? "true" : "false"}>
      <div className="flex justify-between text-[10px] uppercase tracking-wide text-sky-200/80">
        <span>{label}{pulse ? " ↻" : ""}</span>
        <span className="tabular-nums text-sky-100">{reading ?? `${Math.round(value)}/${Math.round(max)}`}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-700/80">
        <div className={`h-full rounded-full ${pulse ? "animate-pulse" : ""}`} style={{ width: `${share * 100}%`, background: color }} />
      </div>
    </div>
  );
}
function Bar({ label, value, max, color, testid }: { label: string; value: number; max: number; color: string; testid?: string }) {
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="flex items-center gap-1.5" data-testid={testid} data-value={Math.round(value)} data-max={Math.round(max)}>
      <span className="w-9 text-[10px] uppercase tracking-wide text-sky-200/80">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-700/80">
        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: color }} />
      </div>
      <span className="w-12 text-right text-[10px] tabular-nums text-sky-100">{Math.round(value)}/{Math.round(max)}</span>
    </div>
  );
}
export const weaponLabel = (name: string, kind: string) => (kind === "bomb" ? name.replace(/ (deployer|layer)$/i, "") : name.replace(/ launcher$/i, ""));
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// `high`: the log is lifted clear of the cockpit's dash
export function HudPanels({ hud, high }: { hud: HudData; high?: boolean }) {
  const hullColor = hud.hull / hud.hullMax > 0.6 ? "#4ade80" : hud.hull / hud.hullMax > 0.3 ? "#facc15" : "#ef4444";
  return (
    <>
      <div className="pointer-events-none absolute left-2 top-2 w-[50vw] max-w-64 space-y-1 rounded bg-gray-900/75 px-2 py-1.5 text-xs text-sky-100" data-testid="dogfight-hud">
        <div className="flex justify-between font-semibold">
          <span>{hud.title}</span>
          <span className="tabular-nums">{clock(Math.max(0, hud.limit - hud.t))}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-2">
          <Gauge label="Hull" value={hud.hull} max={hud.hullMax} color={hullColor} testid="dogfight-hull" />
          {hud.shieldMax > 0 ? <Gauge label="Shield" value={hud.shield} max={hud.shieldMax} color="#38bdf8" testid="dogfight-shield" pulse={hud.recharging} /> : <span />}
        </div>
        <Gauge label="Throttle" value={hud.throttle * 100} max={100} color="#a3e635" testid="dogfight-throttle" reading={`${hud.speed} m/s`} />
        {hud.interior && <Bar label="Boost" value={hud.interior.boost * 100} max={100} color="#7dd3fc" />}
        <div className="flex flex-wrap gap-x-2 text-[11px] text-sky-200/90" data-testid="dogfight-weapons">
          {hud.weapons.map((w, i) => (
            <span key={i} data-active={w.active ? "true" : "false"} className={w.active ? "font-semibold text-yellow-200" : w.ammo === 0 ? "text-sky-200/40" : ""}>
              {w.active ? "▸ " : ""}{weaponLabel(w.name, w.kind)}{w.ammo !== null ? ` ${w.ammo}/${w.ammoMax}` : ""}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between text-[11px] text-sky-200/80">
          <span className="flex items-center gap-1" data-testid="dogfight-roll" data-roll={hud.roll} title="Roll: A and D">
            <span className="relative inline-block h-4 w-4 rounded-full border border-sky-300/70">
              <span className="absolute left-0 top-1/2 h-px w-full bg-sky-200" style={{ transform: `rotate(${hud.roll}deg)` }} />
              <span className="absolute left-1/2 top-0 h-1 w-px -translate-x-1/2 bg-sky-300/70" />
            </span>
            {Math.abs(hud.roll) > 2 ? `${hud.roll > 0 ? "+" : ""}${hud.roll}°` : "level"}
          </span>
          <span>{hud.kills} down · {hud.foes} left</span>
        </div>
        {hud.god && <div className="rounded bg-fuchsia-900/70 px-1 text-center text-[10px] font-semibold text-fuchsia-100" data-testid="dogfight-god-badge">TEST: unlimited hull and weapons</div>}
      </div>
      <div className="pointer-events-none absolute right-2 top-2 w-[46vw] max-w-52 space-y-1 text-[11px] leading-4 text-sky-100">
        <div className="rounded bg-gray-900/70 px-2 py-1" data-testid="dogfight-objective">
          {hud.objective.map((l, i) => (
            <div key={i} className={i === 0 ? "font-semibold text-yellow-200" : ""}>{l}</div>
          ))}
        </div>
        {hud.target && (
          <div className="rounded bg-gray-900/70 px-2 py-1" data-testid="dogfight-target">
            <div className="font-semibold">{hud.target.name} <span className="font-normal text-sky-300/80">{hud.target.sub}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-700/80"><div className="h-full bg-red-400" style={{ width: `${Math.max(0, Math.min(1, hud.target.hullFrac)) * 100}%` }} /></div>
            <div className={hud.target.note.startsWith("SHIELDED") ? "text-sky-300" : "text-sky-200/80"}>{hud.target.note}</div>
            {hud.target.parts && <div className="text-sky-200/70">{hud.target.parts}</div>}
          </div>
        )}
      </div>
      {hud.warn.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 space-y-0.5 text-center" data-testid="dogfight-warn">
          {hud.warn.map((w, i) => (
            <div key={i} className="animate-pulse rounded bg-red-900/75 px-2 py-0.5 text-xs font-semibold text-red-100">{w}</div>
          ))}
        </div>
      )}
      {hud.interior?.phase === "escape" && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded bg-red-900/80 px-4 py-1 text-3xl font-bold tabular-nums text-red-100" data-testid="dogfight-escape">{Math.ceil(hud.interior.escape)}</div>
      )}
      <div className={`pointer-events-none absolute ${high ? "bottom-64" : "bottom-44"} left-1/2 w-[70vw] max-w-64 -translate-x-1/2 space-y-0.5 text-center text-[11px] text-sky-100/90`} data-testid="dogfight-log">
        {hud.said.map((l, i) => (
          <div key={i} className="truncate rounded bg-gray-900/45 px-1" style={{ opacity: 0.5 + (i + 1) / hud.said.length / 2 }}>{l}</div>
        ))}
      </div>
    </>
  );
}

// The reticule, where the craft's nose points (the chase camera is above the craft, so that is a little above the middle of the view), red when
// something is on it. When the guns follow the cursor (`guns` false) it only marks the nose, small and dim: the cursor is what the guns are on.
export function Reticule({ overlay, locked, guns }: { overlay: { current: OverlayData }; locked: boolean; guns: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const el = ref.current;
      const n = overlay.current.nose;
      if (!el) return;
      if (!n || n.behind) {
        el.style.display = "none";
        return;
      }
      el.style.display = "block";
      el.style.left = `${50 + Math.max(-0.95, Math.min(0.95, n.x)) * 50}%`;
      el.style.top = `${50 - Math.max(-0.9, Math.min(0.9, n.y)) * 50}%`;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [overlay]);
  const hot = locked && guns;
  const c = hot ? "#ff3b3b" : "#d6f3ff";
  return (
    <div
      ref={ref}
      className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${guns ? "h-10 w-10 border-2" : "h-5 w-5 border opacity-60"}`}
      style={{ borderColor: c, boxShadow: hot ? "0 0 8px #ff3b3b" : "none" }}
      data-testid="reticule"
      data-locked={locked ? "true" : "false"}
      data-guns={guns ? "true" : "false"}
    >
      {guns && (
        <>
          <div className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2" style={{ background: c }} />
          <div className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2" style={{ background: c }} />
          <div className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2" style={{ background: c }} />
          <div className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2" style={{ background: c }} />
        </>
      )}
    </div>
  );
}

const COLORS: Record<MarkKind, string> = { foe: "#ff6a5a", big: "#ff9a5a", gen: "#6fe6ff", bay: "#ffcf66", port: "#7dffc0", locked: "#ff3b3b", core: "#ffb04a", turret: "#ff8a3a", ally: "#5ee08a", drop: "#ffe066" };
const POOL = 36;

// The markers: moved every frame from `overlay`, with no React render. Off the screen a mark is a pip at its edge pointing the way.
export function MarkerLayer({ overlay }: { overlay: { current: OverlayData } }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const box = root.current;
      if (!box) return;
      const { marks, aim } = overlay.current;
      const list = aim ? [aim, ...marks] : marks;
      const kids = box.children;
      for (let i = 0; i < POOL; i++) {
        const el = kids[i] as HTMLElement | undefined;
        if (!el) continue;
        const m = list[i];
        if (!m) {
          el.style.display = "none";
          continue;
        }
        const off = m.behind || Math.abs(m.x) > 0.94 || Math.abs(m.y) > 0.9;
        let x = m.x;
        let y = m.y;
        if (m.behind) {
          x = -x;
          y = -y;
        }
        let rot = 0;
        if (off) {
          const l = Math.max(Math.abs(x) / 0.94, Math.abs(y) / 0.9, 1e-6);
          rot = (Math.atan2(-y, x) * 180) / Math.PI;
          x /= l;
          y /= l;
        }
        el.style.display = "block";
        el.style.left = `${50 + x * 50}%`;
        el.style.top = `${50 - y * 50}%`;
        el.style.color = COLORS[m.kind];
        const body = el.firstElementChild as HTMLElement;
        const label = el.lastElementChild as HTMLElement;
        if (off) {
          body.textContent = "▲";
          body.style.transform = `translate(-50%, -50%) rotate(${rot + 90}deg)`;
          body.style.border = "0";
          body.style.width = "auto";
          body.style.height = "auto";
          body.style.fontSize = "14px";
          label.textContent = m.kind === "foe" || m.kind === "big" ? "" : m.label;
          el.dataset.testid = "foe-pip";
        } else {
          body.textContent = "";
          const size = m.kind === "foe" ? 26 : m.kind === "big" ? 38 : m.kind === "turret" ? 12 : 18;
          body.style.width = `${size}px`;
          body.style.height = `${size}px`;
          body.style.fontSize = "0";
          body.style.border = m.kind === "locked" || m.kind === "foe" || m.kind === "big" ? "2px solid currentColor" : "2px solid currentColor";
          body.style.borderRadius = m.kind === "gen" || m.kind === "bay" || m.kind === "port" || m.kind === "core" ? "0" : m.kind === "turret" || m.kind === "drop" ? "50%" : "2px";
          body.style.transform = m.kind === "gen" || m.kind === "bay" || m.kind === "port" || m.kind === "core" ? "translate(-50%, -50%) rotate(45deg)" : "translate(-50%, -50%)";
          // Far marks stay unlabelled but for the nearest few, so that a crowded sky stays readable
          label.textContent = m.kind === "turret" ? "" : i < 5 || m.dist < 600 ? `${m.label} ${m.dist >= 1000 ? (m.dist / 1000).toFixed(1) + " km" : Math.round(m.dist) + " m"}` : "";
          el.dataset.testid = "";
        }
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [overlay]);
  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: POOL }, (_, i) => (
        <div key={i} className="absolute" style={{ display: "none" }} data-mark>
          <div className="absolute left-0 top-0" />
          <div className="absolute left-3 top-2 whitespace-nowrap text-[10px] font-semibold text-current" style={{ textShadow: "0 0 3px #000" }} />
        </div>
      ))}
    </div>
  );
}
