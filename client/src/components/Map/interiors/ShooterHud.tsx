// What the shooter mode shows over the view (2026-10-29): hit points, the gun's magazine and the pack, grenades, the item belt, the saber's
// focus, hit markers, a flash when the party is hurt, what it suffers (poisoned, burning, blinded) and a foe's grenade coming down near; and the
// phone's buttons for the shots (fire, grenade, the item and the next one, reload, swap, block). Drawn inside the eye views'
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
      <div style={{ position: "absolute", left: 14, top: 44, width: 190 }} data-testid="shooter-vitals">
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
      <div style={{ position: "absolute", left: "50%", bottom: 150, transform: "translateX(-50%)", textAlign: "center", minWidth: 180 }} data-testid="shooter-ammo">
        {hud.weapon === "gun" && hud.hasGun ? (
          <>
            <div>{hud.gun}{hud.optic ? <span style={{ fontSize: 11, opacity: 0.8 }}> · {hud.optic} ×{hud.scope}</span> : null}{hud.ads > 0.9 ? <span style={{ fontSize: 11, color: "#a7f3d0" }}> · aimed</span> : null}</div>
            <div style={{ fontSize: 18 }}>{hud.reloading ? "Reloading…" : `${hud.left} / ${hud.mag}`} <span style={{ fontSize: 12, opacity: 0.8 }}>· {hud.reserve} in the pack</span></div>
          </>
        ) : (
          <div>{hud.saber ? "Lightsaber" : "Blade"} {hud.blocking ? "· guarding" : ""}</div>
        )}
        {hud.grenades > 0 && <div style={{ fontSize: 12 }}>Grenades ×{hud.grenades}: {hud.grenade} next <span style={{ opacity: 0.7 }}>[G]</span></div>}
        {hud.item && (
          <div style={{ fontSize: 12 }} data-testid="shooter-item">
            {hud.item} ×{hud.items} <span style={{ opacity: 0.7 }}>[Z]{hud.belt > 1 ? ` · ${hud.belt} on the belt [T]` : ""}</span>
          </div>
        )}
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
      {hud.item && (
        <div style={{ display: "flex", gap: 4 }}>
          {hud.belt > 1 && <button data-testid="next-item-button" {...hold("next")} style={{ ...base, width: 32, height: 40, background: "rgba(255,255,255,0.2)" }}>›</button>}
          <button data-testid="item-button" {...hold("item")} style={{ ...base, width: 70, height: 40, background: "rgba(74,222,128,0.4)", font: "600 10px sans-serif" }}>{hud.item.length > 12 ? `${hud.item.slice(0, 11)}…` : hud.item}</button>
        </div>
      )}
      {hud.hasGun && hud.weapon === "gun" && <button data-testid="aim-button" {...hold("aim")} style={{ ...base, width: 70, height: 40, background: hud.ads > 0.5 ? "rgba(16,185,129,0.55)" : "rgba(255,255,255,0.2)" }}>{hud.scope ? `Aim ×${hud.scope}` : "Aim"}</button>}
      {hud.hasGun && <button data-testid="reload-button" {...hold("reload")} style={{ ...base, width: 70, height: 40, background: "rgba(255,255,255,0.2)" }}>Reload</button>}
      {hud.hasGun && hud.hasBlade && <button data-testid="swap-button" {...hold("swap")} style={{ ...base, width: 70, height: 40, background: "rgba(255,255,255,0.2)" }}>{hud.weapon === "gun" ? "Saber" : "Gun"}</button>}
      {hud.saber && <button data-testid="block-button" {...hold("block")} style={{ ...base, width: 70, height: 40, background: "rgba(56,189,248,0.45)" }}>Guard</button>}
      <button data-testid="crouch-button" {...hold("crouch")} style={{ ...base, width: 70, height: 40, background: hud.crouching ? "rgba(250,204,21,0.55)" : "rgba(255,255,255,0.2)" }}>Crouch</button>
      {hud.powers.map((w, i) => (
        <button key={`${w.name}-${i}`} data-testid={`power-button-${i}`} {...hold(`power${i}` as ShootKey)} style={{ ...base, width: 70, height: 34, opacity: w.ready ? 1 : 0.5, background: "rgba(167,139,250,0.5)", font: "600 10px sans-serif" }}>{w.name.length > 12 ? `${w.name.slice(0, 11)}…` : w.name}</button>
      ))}
      {hud.pages > 1 && <button data-testid="power-page-button" {...hold("page")} style={{ ...base, width: 70, height: 30, background: "rgba(167,139,250,0.3)", font: "600 10px sans-serif" }}>Powers {hud.page + 1}/{hud.pages}</button>}
      <button data-testid="zoom-button" {...hold("zoom")} style={{ ...base, width: 70, height: 30, background: hud.zoom ? "rgba(16,185,129,0.55)" : "rgba(255,255,255,0.15)", font: "600 10px sans-serif" }}>Zoom</button>
    </div>
  );
}
