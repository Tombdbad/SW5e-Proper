// Join a co-op game (2026-10-29): type the code the host shows, pick one of your characters, and play. The game is hosted from Play (Co-op button).
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import TranslucentPane from "@/components/ui/TranslucentPane";
import { startCoop, useCoop } from "@/lib/coop";
import { MAX_PLAYERS } from "@shared/logic/coop";

interface Game { campaignId: number; name: string; mode: "tabletop" | "shooter" | null; full: boolean; members: { name: string; characterId: number; connected: boolean }[] }

// What each play mode is, as the joining player is told before joining (the campaign's mode is fixed: the player plays in it)
const MODE_TEXT = {
  tabletop: { name: "Tabletop RPG", color: "text-sky-300", text: "Dice and turn-based combat on the grid, as the books play: initiative, actions, bonus actions, saving throws." },
  shooter: { name: "Real-time shooter", color: "text-red-300", text: "First or third person, no dice and no turns: aim and fire, sneak past watchers' eyes, pick locks and slice by hand." },
};

export default function CoopJoin() {
  const navigate = useNavigate();
  const status = useCoop((s) => s.status);
  const campaignId = useCoop((s) => s.campaignId);
  const [code, setCode] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  // The character picked, waiting for the player to confirm the campaign's mode
  const [picked, setPicked] = useState<number | null>(null);
  const { data: characters = [] } = useQuery<any[]>({ queryKey: ["/api/characters"] });

  // The game the code opens
  useEffect(() => {
    setGame(null);
    setPicked(null);
    setProblem("");
    if (code.trim().length !== 4) return;
    let live = true;
    fetch(`/api/coop/code/${code.trim().toUpperCase()}`).then(async (r) => {
      if (!live) return;
      if (r.ok) setGame(await r.json());
      else setProblem("No game has that code. Check it with the host.");
    }).catch(() => live && setProblem("Could not reach the game."));
    return () => { live = false; };
  }, [code]);

  const join = async (characterId: number) => {
    if (!game) return;
    setBusy(true);
    setProblem("");
    try {
      await startCoop({ campaignId: game.campaignId, characterId, code: code.trim().toUpperCase() });
      navigate(`/game/${game.campaignId}`);
    } catch (e) {
      setProblem((e as Error).message);
    }
    setBusy(false);
  };

  const taken = new Set((game?.members ?? []).filter((m) => m.connected).map((m) => m.characterId));
  return (
    <div className="min-h-screen p-6 text-white">
      <div className="mx-auto max-w-xl space-y-4">
        <TranslucentPane variant="dark" opacity="low" blurStrength="lg" className="py-6 text-center">
          <h1 className="text-3xl font-bold text-yellow-400">Join a co-op game</h1>
          <p className="mt-2 text-gray-300">Up to {MAX_PLAYERS} players on the same network. The host shows a four-letter code in Play (the Co-op button).</p>
        </TranslucentPane>
        {status === "on" && campaignId !== null && (
          <TranslucentPane opacity="medium" className="p-4 text-center">
            <p className="mb-2">You are in a co-op game.</p>
            <Link to={`/game/${campaignId}`}><Button data-testid="coop-return">Back to the game</Button></Link>
          </TranslucentPane>
        )}
        <TranslucentPane opacity="medium" className="space-y-3 p-4">
          <label className="block text-sm text-gray-300" htmlFor="coop-code">Code</label>
          <input
            id="coop-code" data-testid="coop-code-input" value={code} maxLength={4} autoCapitalize="characters" autoComplete="off" autoFocus
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            className="w-full rounded border border-gray-600 bg-gray-900 p-3 text-center text-3xl font-bold tracking-widest"
          />
          {problem && <p className="text-red-300" data-testid="coop-problem">{problem}</p>}
          {game && (
            <div className="space-y-2" data-testid="coop-game">
              <p><span className="font-semibold text-emerald-300">{game.name}</span>: {game.members.map((m) => m.name).join(", ") || "nobody yet"} ({game.members.length}/{MAX_PLAYERS})</p>
              {game.mode ? (
                <p className="rounded border border-gray-600 bg-gray-900/60 p-2 text-sm" data-testid="coop-mode">
                  Played in the <span className={`font-semibold ${MODE_TEXT[game.mode].color}`}>{MODE_TEXT[game.mode].name}</span> mode. {MODE_TEXT[game.mode].text}
                </p>
              ) : (
                <p className="text-sm text-amber-300" data-testid="coop-mode">The host has not chosen how this campaign is played yet. Join once they have.</p>
              )}
              {picked !== null && game.mode && (
                <div className="space-y-2 rounded border border-yellow-500 bg-gray-900 p-3" data-testid="coop-mode-confirm" role="dialog" aria-label="Confirm the campaign's mode">
                  <p className="text-sm">
                    You will play <span className="font-semibold">{characters.find((c: any) => c.id === picked)?.name}</span> in the{" "}
                    <span className={`font-semibold ${MODE_TEXT[game.mode].color}`}>{MODE_TEXT[game.mode].name}</span> mode. A campaign's mode is fixed: it cannot be changed while you play in it.
                  </p>
                  <div className="flex gap-2">
                    <Button disabled={busy} onClick={() => join(picked)} data-testid="coop-mode-join">Join in the {MODE_TEXT[game.mode].name} mode</Button>
                    <Button variant="outline" disabled={busy} onClick={() => setPicked(null)} data-testid="coop-mode-cancel">Cancel</Button>
                  </div>
                </div>
              )}
              <p className="text-sm text-gray-300">Play as:</p>
              <div className="grid gap-2">
                {characters.map((c: any) => {
                  const inGame = game.members.some((m) => m.characterId === c.id);
                  const away = inGame && taken.has(c.id);
                  return (
                    <Button key={c.id} variant="outline" disabled={busy || away || !game.mode || (game.full && !inGame)} onClick={() => setPicked(c.id)} data-testid={`coop-pick-${c.id}`} className="justify-start">
                      {c.name} <span className="ml-2 text-xs text-gray-400">{c.species} {c.class} {c.level}</span>
                      {away && <span className="ml-auto text-xs text-amber-300">already playing</span>}
                      {inGame && !away && <span className="ml-auto text-xs text-emerald-300">rejoin</span>}
                    </Button>
                  );
                })}
                {!characters.length && <p className="text-sm text-gray-300">You have no characters yet. <Link className="text-sky-300 underline" to="/characters/create">Create one</Link> first.</p>}
              </div>
            </div>
          )}
        </TranslucentPane>
        <div className="text-center"><Link to="/"><Button variant="outline">Home</Button></Link></div>
      </div>
    </div>
  );
}
