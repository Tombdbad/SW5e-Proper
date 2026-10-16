import { useState } from "react";
import { Button } from "@/components/ui/button";

// Who can make a check and with which of their skills. A check names its DC and the skills that
// bear on it; the player picks the party member and the skill (the bonus is shown for each).
export interface CheckOption {
  skill: string | null;
  label: string;
  ability: string;
  bonus: number;
  // Advantage: trained with the tool and in a skill it is for
  edge?: boolean;
  note: string;
}
export interface CheckRoller {
  id: string;
  name: string;
  options: CheckOption[];
}
export interface CheckRequest {
  what: string;
  dc: number;
  rollers: CheckRoller[];
  // The roller and option chosen to begin with (the best)
  best: { roller: string; skill: string | null };
}

export const AUTO_CHECKS_KEY = "sw5e.autoChecks";
export const autoChecks = () => {
  try { return localStorage.getItem(AUTO_CHECKS_KEY) === "1"; } catch { return false; }
};

export default function CheckDialog({ request, onRoll, onCancel }: { request: CheckRequest; onRoll: (roller: string, skill: string | null) => void; onCancel: () => void }) {
  const [rollerId, setRollerId] = useState(request.best.roller);
  const [skill, setSkill] = useState<string | null>(request.best.skill);
  const [auto, setAuto] = useState(false);
  const roller = request.rollers.find((r) => r.id === rollerId) ?? request.rollers[0];
  const chosen = roller.options.find((o) => o.skill === skill) ?? roller.options[0];
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const pickRoller = (id: string) => {
    setRollerId(id);
    // Keep the skill if this one has it, otherwise their best
    const next = request.rollers.find((r) => r.id === id)!;
    if (!next.options.some((o) => o.skill === skill)) setSkill([...next.options].sort((a, b) => b.bonus - a.bonus)[0].skill);
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" data-testid="check-dialog">
      <div className="w-full max-w-sm space-y-3 rounded-lg border border-gray-600 bg-gray-900 p-4 text-sm text-gray-100">
        <div>
          <div className="text-base font-semibold">{request.what}</div>
          <div className="text-gray-400">Difficulty class {request.dc}</div>
        </div>
        {request.rollers.length > 1 && (
          <div className="space-y-1">
            <div className="text-xs uppercase text-gray-400">Who makes the check</div>
            <div className="flex flex-wrap gap-1">
              {request.rollers.map((r) => (
                <Button key={r.id} size="sm" variant={r.id === roller.id ? "default" : "outline"} className="h-7 px-2" onClick={() => pickRoller(r.id)} data-testid={`check-who-${r.id}`}>
                  {r.name}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-1">
          <div className="text-xs uppercase text-gray-400">Against which skill</div>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {roller.options.map((o) => (
              <Button key={o.skill ?? "none"} size="sm" variant={o.skill === chosen.skill ? "default" : "outline"} className="h-8 justify-between px-2" onClick={() => setSkill(o.skill)} data-testid={`check-skill-${(o.skill ?? "none").replace(/\s+/g, "-")}`}>
                <span>{o.label}{o.note ? ` (${o.note})` : ""}{o.edge ? ", advantage" : ""}</span>
                <span>{sign(o.bonus)}</span>
              </Button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Do not ask again: the character rolls with the best skill (reset in Settings of this tab: clear the site's storage)
        </label>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancel} data-testid="check-cancel">Not now</Button>
          <Button
            size="sm"
            onClick={() => {
              if (auto) try { localStorage.setItem(AUTO_CHECKS_KEY, "1"); } catch { /* storage may be blocked */ }
              onRoll(roller.id, chosen.skill);
            }}
            data-testid="check-roll"
          >
            Roll {sign(chosen.bonus)}
          </Button>
        </div>
      </div>
    </div>
  );
}
