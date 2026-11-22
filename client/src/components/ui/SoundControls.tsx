// The player's sound settings (2026-11-22): overall, music, effects and voice volumes, mute, and the interface's clicks. Kept by
// lib/audio.ts in localStorage, so they hold on this device across visits. `compact` is the home page's form: mute and music only.
import { useEffect, useState } from "react";
import { getLevels, onLevels, setLevels, type Levels } from "@/lib/audio";

const SLIDERS: { key: "master" | "music" | "sfx" | "voice"; label: string }[] = [
  { key: "master", label: "Overall" },
  { key: "music", label: "Music" },
  { key: "sfx", label: "Effects" },
  { key: "voice", label: "Voices" },
];

export default function SoundControls({ compact = false }: { compact?: boolean }) {
  const [l, setL] = useState<Levels>(getLevels());
  useEffect(() => onLevels(setL), []);
  const shown = compact ? SLIDERS.filter((s) => s.key === "music") : SLIDERS;
  return (
    <div className={compact ? "flex items-center gap-2 text-xs text-gray-300" : "space-y-2 text-xs text-gray-200"} data-testid="sound-controls">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={!l.muted} onChange={(e) => setLevels({ muted: !e.target.checked })} data-testid="sound-on" />
        Sound {l.muted ? "off" : "on"}
      </label>
      {shown.map((s) => (
        <label key={s.key} className={compact ? "flex items-center gap-1" : "flex items-center gap-2"}>
          <span className={compact ? "" : "w-14"}>{s.label}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={l[s.key]}
            disabled={l.muted}
            onChange={(e) => setLevels({ [s.key]: Number(e.target.value) })}
            className={compact ? "w-20 accent-yellow-400" : "w-36 accent-yellow-400"}
            aria-label={`${s.label} volume`}
            data-testid={`sound-${s.key}`}
          />
          {!compact && <span className="w-8 text-right tabular-nums">{Math.round(l[s.key] * 100)}</span>}
        </label>
      ))}
      {!compact && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={l.clicks} onChange={(e) => setLevels({ clicks: e.target.checked })} data-testid="sound-clicks" />
          Clicks on buttons
        </label>
      )}
      {!compact && <p className="text-gray-400">The music follows where you are and what is happening; it is made as it plays (no downloads).</p>}
    </div>
  );
}
