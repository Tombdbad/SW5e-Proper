// What the shooter mode shows over the view (2026-10-29): hit points, the gun's magazine and the pack, grenades, the item belt, the saber's
// focus, hit markers, a flash when the party is hurt, what it suffers (poisoned, burning, blinded) and a foe's grenade coming down near; and the
// phone's buttons for the shots (fire, grenade, the item and the next one, reload, swap, block). Drawn inside the eye views'
// own overlay (ViewRig.tsx), where the stick and the Use button are. interiors/shoot.ts has the keys.
import { useEffect, useRef, useState } from "react";
import { useShoot, type ShootKey } from "./shoot";
import { useNotice } from "./aim";
import { NOTICE, barAt, lockTurn, type HandsPlan } from "@shared/logic/shooter";

const base: React.CSSProperties = { borderRadius: 40, border: "1px solid rgba(255,255,255,0.5)", color: "#fff", font: "600 12px sans-serif", pointerEvents: "auto", touchAction: "none", userSelect: "none", cursor: "pointer" };
const fresh = (at: number, ms: number) => at > 0 && performance.now() - at < ms;
// A touch screen has no keys: the [G] [Z] [T] hints are for a keyboard only (T-007)
const touch = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

export function ShooterHud() {
  const hud = useShoot((s) => s.hud);
  const on = useShoot((s) => !!s.session);
  if (!on) return null;
  const hp = Math.max(0, Math.min(1, hud.hp / Math.max(1, hud.maxHp)));
  const marker = fresh(hud.killAt, 450) ? "#f87171" : fresh(hud.headAt, 250) ? "#facc15" : fresh(hud.hitAt, 180) ? "#ffffff" : null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", font: "600 13px sans-serif", color: "#fff", textShadow: "0 0 3px #000, 0 0 3px #000" }} data-testid="shooter-hud">
      {fresh(hud.hurtAt, 420) && <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 90px 18px rgba(220,38,38,0.65)" }} />}
      {fresh(hud.deflectAt, 220) && <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 60px 8px rgba(250,204,21,0.45)" }} />}
      {/* blinded: the view goes white; burning: an orange edge; poisoned: a green one */}
      {hud.blinded && <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.55)" }} />}
      {hud.burning && <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 80px 14px rgba(255,122,26,0.55)" }} />}
      {hud.poisoned && !hud.burning && <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 70px 10px rgba(123,211,74,0.4)" }} />}
      {fresh(hud.dangerAt, 300) && (
        <div style={{ position: "absolute", left: "50%", top: "34%", transform: "translateX(-50%)", font: "700 20px sans-serif", color: "#fca5a5" }} data-testid="grenade-warning">GRENADE!</div>
      )}
      {marker && (
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
          {[45, -45].map((a) => <div key={a} style={{ position: "absolute", left: -11, top: -1, width: 22, height: 2, background: marker, transform: `rotate(${a}deg)`, boxShadow: "0 0 2px #000" }} />)}
        </div>
      )}
      <div style={{ position: "absolute", left: 14, top: 44, width: touch() ? 125 : 190 }} data-testid="shooter-vitals">
        <div style={{ height: 10, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 5, overflow: "hidden" }}>
          <div style={{ width: `${hp * 100}%`, height: "100%", background: hp > 0.5 ? "#4ade80" : hp > 0.25 ? "#facc15" : "#ef4444" }} />
        </div>
        <div>{hud.hp} / {hud.maxHp}{hud.temp > 0 ? <span style={{ color: "#93c5fd" }}> +{hud.temp}</span> : null}</div>
        {(hud.poisoned || hud.burning || hud.blinded) && (
          <div style={{ fontSize: 12 }} data-testid="shooter-conditions">
            {[hud.poisoned && "Poisoned", hud.burning && "Burning", hud.blinded && "Blinded"].filter(Boolean).join(" · ")}
          </div>
        )}
        {hud.saber && (
          <div style={{ height: 6, marginTop: 2, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 3, overflow: "hidden" }} title="Focus: held up, the saber turns bolts for it">
            <div style={{ width: `${(hud.focus / Math.max(1, hud.focusMax)) * 100}%`, height: "100%", background: hud.blocking ? "#7dd3fc" : "#38bdf8" }} />
          </div>
        )}
        <div style={{ fontSize: 12, opacity: 0.85 }}>Hostiles: {hud.foes}{hud.crouching ? " · crouching" : ""}</div>
        {hud.powers.length > 0 && (
          <div style={{ marginTop: 4, fontSize: 12 }} data-testid="shooter-powers">
            <div style={{ opacity: 0.8 }}>Points: {hud.points}{hud.pages > 1 ? ` · page ${hud.page + 1}/${hud.pages} [0]` : ""}</div>
            {hud.powers.map((w, i) => (
              <div key={`${w.name}-${i}`} style={{ opacity: w.ready ? 1 : 0.45 }}>[{i + 1}] {w.name}{w.cost ? ` (${w.cost})` : ""}</div>
            ))}
          </div>
        )}
        {/* (2026-11-03) what is on the party: its buffs (seconds left; none shown for the whole fight), unseen, anchored, held; foes sensed */}
        {(hud.buffs.length > 0 || hud.states.length > 0 || hud.sensed > 0) && (
          <div style={{ marginTop: 4, fontSize: 12 }} data-testid="shooter-buffs">
            {hud.buffs.map((b) => <div key={b.name} style={{ color: "#7dd3fc" }}>{b.name}{b.t ? ` ${b.t}s` : ""}</div>)}
            {hud.states.map((t) => <div key={t} style={{ color: /Unseen/.test(t) ? "#a5b4fc" : /Held|Slowed|Seen/.test(t) ? "#fca5a5" : "#fde68a" }}>{t}</div>)}
            {hud.sensed > 0 && <div style={{ color: "#f472b6" }}>Sensed: {hud.sensed} beyond sight</div>}
          </div>
        )}
      </div>
      {/* unseen: the view tinted and edged; the zoom: a reticle with the range; shots heard out of sight: an arc at the edge the way they came */}
      {hud.states.includes("Unseen") && <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 120px 30px rgba(99,102,241,0.35)" }} data-testid="cloak-tint" />}
      {hud.zoom > 0 && (
        <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 0 9999px rgba(0,0,0,0)", background: "radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 34%, rgba(0,0,0,0.82) 36%)" }} data-testid="zoom-reticle">
          {/* a scope's picture: a fine cross, the mils along it, and the range */}
          <div style={{ position: "absolute", left: "34%", right: "34%", top: "50%", height: 1, background: "rgba(0,0,0,0.75)" }} />
          <div style={{ position: "absolute", top: "20%", bottom: "20%", left: "50%", width: 1, background: "rgba(0,0,0,0.75)" }} />
          {[-3, -2, -1, 1, 2, 3].map((i) => <div key={i} style={{ position: "absolute", left: `calc(50% + ${i * 22}px)`, top: "calc(50% - 4px)", width: 1, height: 9, background: "rgba(0,0,0,0.75)" }} />)}
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, 40px)", fontSize: 12, color: "#a7f3d0" }}>×{hud.zoom.toFixed(1)} · {hud.range} ft</div>
        </div>
      )}
      {/* aiming: the cone of the shots drawn closing round the crosshair; the sights named */}
      {hud.ads > 0.05 && hud.zoom === 0 && <div style={{ position: "absolute", left: "50%", top: "50%", width: 18, height: 18, marginLeft: -9, marginTop: -9, borderRadius: 9, border: "1px solid rgba(255,255,255,0.7)", opacity: hud.ads, boxShadow: "0 0 2px #000" }} data-testid="sights" />}
      {hud.pings.map((p, i) => (
        <div key={i} style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, transform: `rotate(${p.a}rad)`, opacity: Math.max(0, 1 - (performance.now() - p.at) / 1500) }}>
          <div style={{ position: "absolute", left: -26, top: -170, width: 52, height: 8, borderRadius: 6, background: "rgba(251,191,36,0.85)", boxShadow: "0 0 6px #000" }} />
        </div>
      ))}
      {/* on a phone the ammo sits at the left under the hit points, clear of the buttons and the middle of the view */}
      <div style={touch() ? { position: "absolute", left: 14, top: 100, maxWidth: 125 } : { position: "absolute", left: "50%", bottom: 150, transform: "translateX(-50%)", textAlign: "center", minWidth: 180 }} data-testid="shooter-ammo">
        {hud.weapon === "gun" && hud.hasGun ? (
          <>
            <div>{hud.gun}{hud.optic ? <span style={{ fontSize: 11, opacity: 0.8 }}> · {hud.optic} ×{hud.scope}</span> : null}{hud.ads > 0.9 ? <span style={{ fontSize: 11, color: "#a7f3d0" }}> · aimed</span> : null}</div>
            <div style={{ fontSize: 18 }}>{hud.reloading ? "Reloading…" : `${hud.left} / ${hud.mag}`} <span style={{ fontSize: 12, opacity: 0.8 }}>· {hud.reserve} in the pack</span></div>
          </>
        ) : (
          <div>{hud.saber ? "Lightsaber" : "Blade"} {hud.blocking ? "· guarding" : ""}</div>
        )}
        {hud.grenades > 0 && !touch() && <div style={{ fontSize: 12 }}>Grenades ×{hud.grenades}: {hud.grenade} next{touch() ? null : <span style={{ opacity: 0.7 }}> [G]</span>}</div>}
        {hud.item && !touch() && (
          <div style={{ fontSize: 12 }} data-testid="shooter-item">
            {hud.item} ×{hud.items}{touch() ? (hud.belt > 1 ? ` · ${hud.belt} on the belt` : "") : <span style={{ opacity: 0.7 }}> [Z]{hud.belt > 1 ? ` · ${hud.belt} on the belt [T]` : ""}</span>}
          </div>
        )}
        {hud.note && <div style={{ fontSize: 12, color: "#fde68a" }}>{hud.note}</div>}
      </div>
    </div>
  );
}

// The eye over the crosshair (2026-11-15, the user: Skyrim's opening eye; house rule, shooter.ts NOTICE): shut while nobody is aware of the
// party, opening as the most aware watcher fills, amber once it is looking (`caution`), wide and red once it has seen the party. Shown while
// sneaking, and whenever someone who matters is looking; not in a fight (the fight has begun).
export function NoticeEye() {
  const { level, show, who } = useNotice();
  const fighting = useShoot((s) => !!s.session);
  if (!show || fighting) return null;
  const k = Math.max(0, Math.min(1, level));
  const seen = k >= 1;
  const looking = k >= NOTICE.caution;
  const colour = seen ? "#ef4444" : looking ? "#fbbf24" : "#e5e7eb";
  // (the lids part by how aware the watcher is: a slit when nobody is, wide open when seen)
  const lid = 1.5 + 13 * k;
  const shape = `M11 20 Q32 ${20 - lid * 1.4} 53 20 Q32 ${20 + lid * 1.4} 11 20 Z`;
  return (
    <div style={{ position: "absolute", left: "50%", top: "calc(50% - 74px)", transform: "translateX(-50%)", textAlign: "center", pointerEvents: "none", filter: "drop-shadow(0 0 2px #000)" }} data-testid="notice-eye" data-level={k.toFixed(2)} data-state={seen ? "seen" : looking ? "looking" : "hidden"}>
      <svg width={64} height={40} viewBox="0 0 64 40" style={{ display: "block", margin: "0 auto", opacity: 0.55 + 0.43 * k }}>
        <defs>
          <clipPath id="notice-eye-clip"><path d={shape} /></clipPath>
        </defs>
        {/* the brackets, as Skyrim's: they close in on the eye as it opens */}
        <path d={`M${2 + 3 * k + 6} 6 L${2 + 3 * k} 20 L${2 + 3 * k + 6} 34`} fill="none" stroke={colour} strokeWidth={2} opacity={0.8} />
        <path d={`M${62 - 3 * k - 6} 6 L${62 - 3 * k} 20 L${62 - 3 * k - 6} 34`} fill="none" stroke={colour} strokeWidth={2} opacity={0.8} />
        <path d={shape} fill="rgba(0,0,0,0.45)" stroke={colour} strokeWidth={2} />
        <g clipPath="url(#notice-eye-clip)">
          <circle cx={32} cy={20} r={8} fill={colour} opacity={0.85} />
          <circle cx={32} cy={20} r={3.5} fill="#111" />
        </g>
      </svg>
      <div style={{ font: "600 11px sans-serif", color: colour, textShadow: "0 0 3px #000, 0 0 3px #000", marginTop: 2 }}>
        {seen ? `Seen${who ? ` by ${who}` : ""}` : looking ? `${who ?? "Someone"} is looking` : "Hidden"}
      </div>
    </div>
  );
}

// What is done by hand in the shooter (2026-11-15; house rule, shooter.ts handsPlan): a lock on a dial, as Skyrim's (move the pick, hold Turn:
// in the sweet spot the lock turns all the way; beside it, part of the way, and holding on strains the pick until it slips), or a bar whose
// cursor is stopped in the lit window (slicing, a strain, quick hands). The world goes on meanwhile: the watchers still look (the eye).
// `onDone` is told whether it was done and how many windows were hit, or null when it is called off (Esc).
export interface HandsResult { won: boolean; done: number }
const HANDS_TITLE: Record<HandsPlan["kind"], string> = { pick: "Pick the lock", slice: "Slice", strain: "Heave", nimble: "Steady hands" };
const HANDS_HINT: Record<HandsPlan["kind"], string> = {
  pick: "Move the pick (mouse, drag, or A / D), then hold Turn (Space). Where it turns all the way, the lock opens; where it sticks, let go before the pick slips.",
  slice: "Stop the cursor in the lit window (Space, click or tap Now), once for each node.",
  strain: "Put your weight in as the swing reaches the lit window (Space, click or tap Now).",
  nimble: "Move when the cursor is in the lit window (Space, click or tap Now).",
};
export function HandsGame({ what, plan, onDone }: { what: string; plan: HandsPlan; onDone: (r: HandsResult | null) => void }) {
  const [, redraw] = useState(0);
  const s = useRef({ pick: 0, spot: (Math.random() * 2 - 1) * 78, turn: 0, strain: 0, holding: false, slipped: 0, t: Math.random() * 2, at: Math.random() * 0.6 + 0.2, done: 0, misses: 0, speed: plan.speed, keys: new Set<string>(), flash: "", flashAt: 0, over: false });
  const dial = useRef<SVGSVGElement>(null);
  const finish = (r: HandsResult | null) => {
    if (s.current.over) return;
    s.current.over = true;
    setTimeout(() => onDone(r), r ? 450 : 0);
  };
  const say = (text: string) => Object.assign(s.current, { flash: text, flashAt: performance.now() });
  // A window of the bar, inside it and clear of its ends
  const nextSpot = () => plan.window / 2 + Math.random() * (1 - plan.window);
  const press = () => {
    const g = s.current;
    if (g.over || plan.kind === "pick") return;
    if (Math.abs(barAt({ ...plan, speed: g.speed }, g.t) - g.at) <= plan.window / 2) {
      g.done += 1;
      g.speed *= 1.12;
      g.at = nextSpot();
      say(g.done >= plan.nodes ? "Done!" : "Got it");
      if (g.done >= plan.nodes) finish({ won: true, done: g.done });
    } else {
      g.misses += 1;
      say("Missed");
      if (g.misses >= plan.misses) finish({ won: false, done: g.done });
    }
  };
  useEffect(() => {
    // (the mouse is let go of, so the pick and the buttons can be used)
    if (document.pointerLockElement) document.exitPointerLock?.();
    // The game's keys are its own while it is open (caught before the walk and the jump see them; letting go still reaches them)
    const own = ["Space", "KeyA", "KeyD", "ArrowLeft", "ArrowRight", "KeyW", "ArrowUp", "Escape", "KeyS", "ArrowDown", "KeyE", "Enter"];
    const down = (e: KeyboardEvent) => {
      if (!own.includes(e.code)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === "Escape") return finish(null);
      if (e.repeat) return;
      s.current.keys.add(e.code);
      if (["Space", "Enter", "KeyE"].includes(e.code)) press();
    };
    const up = (e: KeyboardEvent) => { s.current.keys.delete(e.code); };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      // (real time, even at a few frames a second: a slow phone's lock turns as fast as a fast one's; a long gap, a hidden tab, is cut short)
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      const g = s.current;
      if (!g.over) {
        if (plan.kind === "pick") {
          const k = g.keys;
          const nudge = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
          if (nudge && g.turn < 0.05) g.pick = Math.max(-90, Math.min(90, g.pick + nudge * 70 * dt));
          const holding = g.holding || k.has("Space") || k.has("KeyW") || k.has("ArrowUp");
          const max = lockTurn(plan, g.pick, g.spot);
          if (holding) {
            g.turn = Math.min(max, g.turn + 2.2 * dt);
            if (g.turn >= 0.999) finish({ won: true, done: 1 });
            else if (g.turn >= max - 0.01) {
              g.strain += dt;
              if (g.strain > 0.8) {
                g.slipped += 1;
                g.strain = 0;
                g.turn = 0;
                g.holding = false;
                k.delete("Space"); k.delete("KeyW"); k.delete("ArrowUp");
                say(g.slipped >= plan.misses ? "The pick slips once too often" : "The pick slips");
                if (g.slipped >= plan.misses) finish({ won: false, done: 0 });
              }
            }
          } else {
            g.turn = Math.max(0, g.turn - 3 * dt);
            g.strain = Math.max(0, g.strain - 2 * dt);
          }
        } else g.t += dt;
      }
      redraw((n) => (n + 1) % 1e6);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, []);
  const g = s.current;
  const aim = (e: React.PointerEvent) => {
    const box = dial.current?.getBoundingClientRect();
    if (!box || g.turn >= 0.05) return;
    g.pick = Math.max(-90, Math.min(90, ((e.clientX - box.left) / box.width - 0.5) * 200));
  };
  const flash = g.flash && performance.now() - g.flashAt < 900 ? g.flash : "";
  const btn: React.CSSProperties = { ...base, padding: "8px 16px", background: "rgba(255,255,255,0.15)" };
  const cursor = barAt({ ...plan, speed: g.speed }, g.t);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 90, pointerEvents: "none" }}>
      <div role="dialog" aria-label={HANDS_TITLE[plan.kind]} data-testid="hands-game" data-kind={plan.kind} style={{ pointerEvents: "auto", width: "min(360px, calc(100vw - 32px))", background: "rgba(10,14,22,0.86)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 10, padding: 12, color: "#fff", font: "600 13px sans-serif", textAlign: "center", touchAction: "none", userSelect: "none" }}>
        <div style={{ color: "#fde68a" }}>{HANDS_TITLE[plan.kind]}: {what}</div>
        {plan.kind === "pick" ? (
          <>
            <svg ref={dial} viewBox="-120 -110 240 180" style={{ width: "100%", height: 190, display: "block", marginTop: 6, cursor: "ew-resize" }} onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); aim(e); }} onPointerMove={(e) => (e.buttons || e.pointerType === "mouse") && aim(e)} data-testid="hands-dial">
              {/* the lock's face, turned by how far the cylinder has gone (a quarter turn opens it), and the keyhole */}
              <g transform={`rotate(${g.turn * 90 + (g.strain > 0 ? Math.sin(performance.now() / 25) * 2.5 * g.strain : 0)})`}>
                <circle r={62} fill="#334155" stroke="#94a3b8" strokeWidth={3} />
                <circle r={40} fill="#1e293b" stroke="#64748b" strokeWidth={2} />
                <rect x={-5} y={-26} width={10} height={30} rx={4} fill="#0f172a" />
              </g>
              {/* the pick, from the keyhole out at its angle */}
              <line x1={0} y1={0} x2={Math.sin((g.pick * Math.PI) / 180) * 104} y2={-Math.cos((g.pick * Math.PI) / 180) * 104} stroke={g.strain > 0.3 ? "#f87171" : "#e5e7eb"} strokeWidth={3} strokeLinecap="round" />
              <path d="M-104 0 A104 104 0 0 1 104 0" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
            </svg>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Slips left: {Math.max(0, plan.misses - g.slipped)}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 6 }}>
              <button style={{ ...btn, background: "rgba(250,204,21,0.45)" }} data-testid="hands-turn"
                onPointerDown={(e) => { e.preventDefault(); g.holding = true; }} onPointerUp={() => { g.holding = false; }} onPointerCancel={() => { g.holding = false; }} onPointerLeave={() => { g.holding = false; }}>Turn (hold)</button>
              <button style={btn} data-testid="hands-cancel" onClick={() => finish(null)}>Stop (Esc)</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ position: "relative", height: 28, margin: "12px 4px 6px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 5, overflow: "hidden" }} onPointerDown={(e) => { e.preventDefault(); press(); }} data-testid="hands-bar">
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(g.at - plan.window / 2) * 100}%`, width: `${plan.window * 100}%`, background: "rgba(74,222,128,0.6)" }} />
              <div style={{ position: "absolute", top: -2, bottom: -2, left: `calc(${cursor * 100}% - 2px)`, width: 4, background: "#fde68a", boxShadow: "0 0 4px #000" }} />
            </div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              {Array.from({ length: plan.nodes }, (_, i) => (i < g.done ? "●" : "○")).join(" ")} · misses left {Math.max(0, plan.misses - g.misses)}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 6 }}>
              <button style={{ ...btn, background: "rgba(74,222,128,0.45)" }} data-testid="hands-now" onPointerDown={(e) => { e.preventDefault(); press(); }}>Now</button>
              <button style={btn} data-testid="hands-cancel" onClick={() => finish(null)}>Stop (Esc)</button>
            </div>
          </>
        )}
        <div style={{ minHeight: 16, marginTop: 4, color: /Got|Done/.test(flash) ? "#86efac" : "#fca5a5" }}>{flash}</div>
        <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.75 }}>{HANDS_HINT[plan.kind]}</div>
      </div>
    </div>
  );
}

export function ShootButtons() {
  const hud = useShoot((s) => s.hud);
  const on = useShoot((s) => !!s.session);
  if (!on) return null;
  const hold = (key: ShootKey) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); useShoot.getState().down(key); },
    onPointerUp: () => useShoot.getState().up(key),
    onPointerCancel: () => useShoot.getState().up(key),
    onLostPointerCapture: () => useShoot.getState().up(key),
  });
  // on a phone the small buttons are smaller still, so that a tall stack of them fits the view in two or three columns
  const sec: React.CSSProperties = touch() ? { width: 58, height: 30, padding: 0, font: "600 10px sans-serif" } : {};
  return (
    // top: 64 keeps the column under the compass; a column too tall for the view carries on in a second one to its left (T-007)
    <div style={{ position: "absolute", right: 14, bottom: 176, top: 64, display: "flex", flexDirection: "column-reverse", flexWrap: "wrap-reverse", alignContent: "flex-start", alignItems: "flex-end", gap: 6, pointerEvents: "none" }} data-testid="shoot-buttons">
      <button data-testid="fire-button" {...hold("fire")} style={{ ...base, width: 80, height: 80, background: "rgba(239,68,68,0.55)", font: "700 14px sans-serif" }}>{hud.weapon === "blade" ? "Swing" : "Fire"}</button>
      {hud.grenades > 0 && <button data-testid="grenade-button" {...hold("grenade")} style={{ ...base, width: 70, height: 40, ...sec, background: "rgba(163,230,53,0.45)" }}>{touch() ? `Grenade ×${hud.grenades}` : "Grenade"}</button>}
      {hud.item && (
        <div style={{ display: "flex", gap: 4 }}>
          {hud.belt > 1 && <button data-testid="next-item-button" {...hold("next")} style={{ ...base, width: touch() ? 24 : 32, height: 40, padding: 0, ...(sec.height ? { height: sec.height } : {}), background: "rgba(255,255,255,0.2)" }}>›</button>}
          <button data-testid="item-button" {...hold("item")} style={{ ...base, width: 70, height: 40, ...sec, background: "rgba(74,222,128,0.4)", font: "600 10px sans-serif" }}>{touch() ? `${hud.item.length > 7 ? `${hud.item.slice(0, 6)}…` : hud.item} ×${hud.items}` : hud.item.length > 12 ? `${hud.item.slice(0, 11)}…` : hud.item}</button>
        </div>
      )}
      {hud.hasGun && hud.weapon === "gun" && <button data-testid="aim-button" {...hold("aim")} style={{ ...base, width: 70, height: 40, ...sec, background: hud.ads > 0.5 ? "rgba(16,185,129,0.55)" : "rgba(255,255,255,0.2)" }}>{hud.scope ? `Aim ×${hud.scope}` : "Aim"}</button>}
      {hud.hasGun && <button data-testid="reload-button" {...hold("reload")} style={{ ...base, width: 70, height: 40, ...sec, background: "rgba(255,255,255,0.2)" }}>Reload</button>}
      {hud.hasGun && hud.hasBlade && <button data-testid="swap-button" {...hold("swap")} style={{ ...base, width: 70, height: 40, ...sec, background: "rgba(255,255,255,0.2)" }}>{hud.weapon === "gun" ? "Saber" : "Gun"}</button>}
      {hud.saber && <button data-testid="block-button" {...hold("block")} style={{ ...base, width: 70, height: 40, ...sec, background: "rgba(56,189,248,0.45)" }}>Guard</button>}
      <button data-testid="crouch-button" {...hold("crouch")} style={{ ...base, width: 70, height: 40, ...sec, background: hud.crouching ? "rgba(250,204,21,0.55)" : "rgba(255,255,255,0.2)" }}>Crouch</button>
      {hud.powers.map((w, i) => (
        <button key={`${w.name}-${i}`} data-testid={`power-button-${i}`} {...hold(`power${i}` as ShootKey)} style={{ ...base, width: 70, height: 34, ...sec, opacity: w.ready ? 1 : 0.5, background: "rgba(167,139,250,0.5)", font: "600 10px sans-serif" }}>{w.name.length > 12 ? `${w.name.slice(0, 11)}…` : w.name}</button>
      ))}
      {hud.pages > 1 && <button data-testid="power-page-button" {...hold("page")} style={{ ...base, width: 70, height: 30, ...sec, background: "rgba(167,139,250,0.3)", font: "600 10px sans-serif" }}>Powers {hud.page + 1}/{hud.pages}</button>}
      <button data-testid="zoom-button" {...hold("zoom")} style={{ ...base, width: 70, height: 30, ...sec, background: hud.zoom ? "rgba(16,185,129,0.55)" : "rgba(255,255,255,0.15)", font: "600 10px sans-serif" }}>Zoom</button>
    </div>
  );
}
