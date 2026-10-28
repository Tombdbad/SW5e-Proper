// The phone's buttons for the real-time moves (interiors/air.ts): Jump (held, it is a pack's thrust), the hook (fire it where the crosshair or the
// pointer is) and the pack's burst; the last two only when the character has the gear. Space, F and Left Shift are the same on a keyboard.
import { useAir, type AirKey } from "./air";

export function AirButtons({ right, bottom }: { right: number; bottom: number }) {
  const gear = useAir((s) => s.gear);
  const hold = (key: AirKey) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); useAir.getState().down(key); },
    onPointerUp: () => useAir.getState().up(key),
    onPointerCancel: () => useAir.getState().up(key),
    onLostPointerCapture: () => useAir.getState().up(key),
  });
  const base: React.CSSProperties = { borderRadius: 40, border: "1px solid rgba(255,255,255,0.5)", color: "#fff", font: "600 13px sans-serif", pointerEvents: "auto", touchAction: "none", userSelect: "none" };
  return (
    <div style={{ position: "absolute", right, bottom, display: "flex", flexDirection: "column-reverse", alignItems: "center", gap: 8, pointerEvents: "none" }} data-testid="air-buttons">
      <button data-testid="jump-button" {...hold("jump")} style={{ ...base, width: 72, height: 72, background: "rgba(56,189,248,0.45)" }}>{gear?.fly ? "Jump / thrust" : "Jump"}</button>
      {gear?.hook && <button data-testid="hook-button" {...hold("hook")} style={{ ...base, width: 64, height: 50, background: "rgba(251,191,36,0.45)" }}>Hook</button>}
      {gear?.fly && <button data-testid="boost-button" {...hold("boost")} style={{ ...base, width: 64, height: 50, background: "rgba(248,113,113,0.5)" }}>Burst</button>}
    </div>
  );
}
