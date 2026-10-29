// What the shooter mode shows over the view (2026-10-29): hit points, the gun's magazine and the pack, grenades, the saber's focus, hit markers
// and a flash when the party is hurt; and the phone's buttons for the shots (fire, grenade, reload, swap, block). Drawn inside the eye views'
// own overlay (ViewRig.tsx), where the stick and the Use button are. interiors/shoot.ts has the keys.
import { useShoot, type ShootKey } from "./shoot";

const base: React.CSSProperties = { borderRadius: 40, border: "1px solid rgba(255,255,255,0.5)", color: "#fff", font: "600 12px sans-serif", pointerEvents: "auto", touchAction: "none", userSelect: "none", cursor: "pointer" };
const fresh = (at: number, ms: number) => at > 0 && performance.now() - at < ms;

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
      {marker && (
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
          {[45, -45].map((a) => <div key={a} style={{ position: "absolute", left: -11, top: -1, width: 22, height: 2, background: marker, transform: `rotate(${a}deg)`, boxShadow: "0 0 2px #000" }} />)}
        </div>
      )}
      <div style={{ position: "absolute", left: 14, top: 44, width: 190 }} data-testid="shooter-vitals">
        <div style={{ height: 10, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 5, overflow: "hidden" }}>
          <div style={{ width: `${hp * 100}%`, height: "100%", background: hp > 0.5 ? "#4ade80" : hp > 0.25 ? "#facc15" : "#ef4444" }} />
        </div>
        <div>{hud.hp} / {hud.maxHp}</div>
        {hud.saber && (
          <div style={{ height: 6, marginTop: 2, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 3, overflow: "hidden" }} title="Focus: held up, the saber turns bolts for it">
            <div style={{ width: `${(hud.focus / Math.max(1, hud.focusMax)) * 100}%`, height: "100%", background: hud.blocking ? "#7dd3fc" : "#38bdf8" }} />
          </div>
        )}
        <div style={{ fontSize: 12, opacity: 0.85 }}>Hostiles: {hud.foes}</div>
      </div>
      <div style={{ position: "absolute", left: "50%", bottom: 150, transform: "translateX(-50%)", textAlign: "center", minWidth: 180 }} data-testid="shooter-ammo">
        {hud.weapon === "gun" && hud.hasGun ? (
          <>
            <div>{hud.gun}</div>
            <div style={{ fontSize: 18 }}>{hud.reloading ? "Reloading…" : `${hud.left} / ${hud.mag}`} <span style={{ fontSize: 12, opacity: 0.8 }}>· {hud.reserve} in the pack</span></div>
          </>
        ) : (
          <div>{hud.saber ? "Lightsaber" : "Blade"} {hud.blocking ? "· guarding" : ""}</div>
        )}
        {hud.grenades > 0 && <div style={{ fontSize: 12 }}>{hud.grenade} ×{hud.grenades} <span style={{ opacity: 0.7 }}>[G]</span></div>}
        {hud.note && <div style={{ fontSize: 12, color: "#fde68a" }}>{hud.note}</div>}
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
  return (
    <div style={{ position: "absolute", right: 14, bottom: 176, display: "flex", flexDirection: "column-reverse", alignItems: "flex-end", gap: 6, pointerEvents: "none" }} data-testid="shoot-buttons">
      <button data-testid="fire-button" {...hold("fire")} style={{ ...base, width: 80, height: 80, background: "rgba(239,68,68,0.55)", font: "700 14px sans-serif" }}>{hud.weapon === "blade" ? "Swing" : "Fire"}</button>
      {hud.grenades > 0 && <button data-testid="grenade-button" {...hold("grenade")} style={{ ...base, width: 70, height: 40, background: "rgba(163,230,53,0.45)" }}>Grenade</button>}
      {hud.hasGun && <button data-testid="reload-button" {...hold("reload")} style={{ ...base, width: 70, height: 40, background: "rgba(255,255,255,0.2)" }}>Reload</button>}
      {hud.hasGun && hud.hasBlade && <button data-testid="swap-button" {...hold("swap")} style={{ ...base, width: 70, height: 40, background: "rgba(255,255,255,0.2)" }}>{hud.weapon === "gun" ? "Saber" : "Gun"}</button>}
      {hud.saber && <button data-testid="block-button" {...hold("block")} style={{ ...base, width: 70, height: 40, background: "rgba(56,189,248,0.45)" }}>Guard</button>}
    </div>
  );
}
