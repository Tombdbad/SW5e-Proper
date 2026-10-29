// The enemies the party has made (shared/logic/nemesis.ts): who holds a grudge, how deep it runs, what the party did to them, and the choice
// to spare, finish or question those lying at its mercy. A page, not a map: the nemeses themselves arrive on the 3D map as the gang
// that finds the party in an alley.
import { Button } from "@/components/ui/button";
import { RANKS, TEMPERS, activeNemeses, intentOf, nameOf, notorietyLevel, NOTORIETY, tierOf, type MercyChoice, type NemesisRecord, type NemesisState } from "@shared/logic/nemesis";

const TIER_STYLE: Record<string, string> = {
  none: "text-gray-400",
  resentful: "text-yellow-300",
  vengeful: "text-orange-400",
  murderous: "text-red-400",
};
const INTENT_TEXT = { hunts: "will hunt the party", "wont-hunt": "is too afraid to hunt the party", "provoked-only": "will only strike if provoked" } as const;
const STATUS_TEXT: Record<NemesisRecord["status"], string> = { alive: "at large", resting: "licking their wounds", "at-mercy": "at your mercy", "presumed-dead": "thought dead", dead: "dead" };

export function NemesisPanel({ state, onMercy, disabled }: { state?: NemesisState; onMercy: (id: string, choice: MercyChoice) => void; disabled?: boolean }) {
  const living = activeNemeses(state);
  const level = notorietyLevel(state?.notoriety ?? 0);
  const mercy = living.filter((r) => r.status === "at-mercy");
  const others = living.filter((r) => r.status !== "at-mercy");
  return (
    <div className="space-y-3 text-sm" data-testid="nemeses">
      <p className="text-xs text-gray-300">
        Your name: <span className="font-semibold text-amber-300">{NOTORIETY.names[level]}</span> ({Math.round(state?.notoriety ?? 0)}). The more feared you are, the sooner the vengeful come, and the more of the timid stay away.
      </p>
      {mercy.length > 0 && (
        <div className="space-y-2 rounded border border-red-500/60 p-2" data-testid="nemesis-mercy">
          <h3 className="font-semibold text-red-300">At your mercy</h3>
          {mercy.map((r) => (
            <div key={r.id} className="space-y-1">
              <Row r={r} />
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={disabled} onClick={() => onMercy(r.id, "spare")}>Spare</Button>
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={disabled} onClick={() => onMercy(r.id, "interrogate")}>Question</Button>
                <Button size="sm" variant="destructive" className="h-6 px-2 text-xs" disabled={disabled} onClick={() => onMercy(r.id, "execute")}>Finish</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {others.length === 0 && mercy.length === 0 && <p className="text-xs text-gray-400">Nobody holds a grudge against you yet. Let an enemy run, leave one for dead, or fall to one, and they will remember.</p>}
      {others.map((r) => (
        <Row key={r.id} r={r} full />
      ))}
      {(state?.news.length ?? 0) > 0 && (
        <div className="space-y-1 text-xs" data-testid="nemesis-news">
          <h3 className="font-semibold text-gray-300">Word on the street</h3>
          {[...(state?.news ?? [])].slice(-5).reverse().map((n, i) => (
            <p key={i} className="text-gray-400">{n.text}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ r, full }: { r: NemesisRecord; full?: boolean }) {
  const tier = tierOf(r.hate);
  return (
    <div className="rounded border border-gray-700 p-2 text-xs" data-testid={`nemesis-${r.id}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{nameOf(r)}</span>
        <span className={TIER_STYLE[tier]}>{tier === "none" ? "no grudge" : tier}</span>
      </div>
      <div className="text-gray-300">
        {RANKS[r.rank]} of the {r.gang}, {r.body.name.toLowerCase()}; {r.personality}. {STATUS_TEXT[r.status]}.
      </div>
      {full && (
        <>
          <div className="text-gray-400">{TEMPERS[r.personality].blurb}. {r.status === "alive" || r.status === "resting" ? `They ${INTENT_TEXT[intentOf(r)]}.` : ""}</div>
          {r.scars.length > 0 && <div className="text-amber-200">Scars: {r.scars.map((s) => `${s.wound} (${s.location})`).join("; ")}</div>}
          {r.history.length > 0 && <div className="text-gray-500">{r.history[r.history.length - 1].text}</div>}
          {(r.killedParty > 0 || r.fled > 0 || r.beaten > 0 || r.spared > 0) && (
            <div className="text-gray-500">
              {[r.killedParty && `felled you ${r.killedParty}x`, r.fled && `fled ${r.fled}x`, r.beaten && `beaten ${r.beaten}x`, r.spared && `spared ${r.spared}x`].filter(Boolean).join(", ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}
