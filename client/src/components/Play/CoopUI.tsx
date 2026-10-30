// Co-op on the Play page (2026-10-29): the Co-op button and its dialog (host a game, the code, who is where), the travel room that opens when one
// of the party sets out for another settlement, planet or system, and the little link that shares where this player stands.
// The state is lib/coop.ts; the rules are shared/logic/coop.ts. The trip itself is Play's own (GameBoard `travel`): the room only decides who
// goes in what, in which seat.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePartySpot, useClock } from "@/components/Map/LocalMap";
import { partyHeight } from "@/components/Map/interiors/air";
import { RoadRide } from "@/components/Map/FlightScene";
import {
  cancelTravel, chooseSeat, joinTravel, kickPlayer, leaveCoop, readyTravel, sharePosition, startCoop, useCoop, coopMe,
} from "@/lib/coop";
import { MAX_PLAYERS, crewIssues, rolesOf, unitsOf, type Craft, type TravelRoom } from "@shared/logic/coop";

// Shares where this player stands (a few times a second, when it changes) and keeps the shared clock: time never runs backward
export function CoopLink({ campaignId }: { campaignId: string | undefined }) {
  const status = useCoop((s) => s.status);
  const { data } = useQuery<any>({ queryKey: [`/api/campaigns/${campaignId}`], enabled: false });
  // (twelve times a second, read from the map's own stores: a walk, a jump or a flight is seen as it goes, and the last place stood at is never missed)
  useEffect(() => {
    if (status !== "on") return;
    const id = setInterval(() => {
      const spot = usePartySpot.getState();
      if (spot.areaId) sharePosition(spot.areaId, partyHeight.at?.x ?? spot.x, partyHeight.at?.y ?? spot.y, partyHeight.f, partyHeight.y, partyHeight.s, partyHeight.ride);
    }, 80);
    return () => clearInterval(id);
  }, [status]);
  const total = Number(data?.timeElapsed?.total) || 0;
  useEffect(() => {
    if (status === "on" && total > useClock.getState().minutes) useClock.getState().set(total);
  }, [status, total]);
  return null;
}

export function CoopButton({ onOpen }: { onOpen: () => void }) {
  const status = useCoop((s) => s.status);
  const count = useCoop((s) => s.members.filter((m) => m.connected).length);
  return (
    <Button
      size="sm" variant="outline" className={`pointer-events-auto h-6 shrink-0 px-2 text-xs ${status === "on" ? "border-emerald-400 text-emerald-300" : ""}`}
      data-testid="coop-toggle" title="Play with up to four people on the same network" onClick={onOpen}
    >
      {status === "on" ? `Co-op: ${count}/${MAX_PLAYERS}` : status === "connecting" ? "Co-op: connecting" : "Co-op"}
    </Button>
  );
}

interface Info { lan: boolean; urls: string[]; port: number }

export function CoopDialog({ campaignId, characterId, areaName, onClose, onGoTo }: {
  campaignId: number; characterId: number; areaName: (id: string) => string; onClose: () => void; onGoTo: (areaId: string, who: string) => void;
}) {
  const { status, code, members, me, error } = useCoop();
  const { data: info } = useQuery<Info>({ queryKey: ["/api/coop/info"], staleTime: 30000 });
  const [busy, setBusy] = useState(false);
  const host = async () => {
    setBusy(true);
    try { await startCoop({ campaignId, characterId, host: true }); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" data-testid="coop-dialog" role="dialog" aria-label="Co-op">
      <div className="max-h-full w-full max-w-lg space-y-3 overflow-y-auto rounded border border-gray-600 bg-gray-900 p-4 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-yellow-300">Co-op</h2>
          <Button size="sm" variant="outline" onClick={onClose} data-testid="coop-close">Close</Button>
        </div>
        {status === "off" && (
          <>
            <p className="text-gray-300">Play this campaign with up to {MAX_PLAYERS} people on the same network. Each plays a character of their own. You walk the settlement alone or together; leaving it for another settlement, a planet or a system is done as a party.</p>
            <Button onClick={host} disabled={busy} data-testid="coop-host">Host a game with this character</Button>
            {error && <p className="text-red-300">{error}</p>}
          </>
        )}
        {status !== "off" && (
          <>
            <div className="rounded border border-emerald-500 p-3 text-center">
              <div className="text-xs text-gray-300">Code</div>
              <div className="text-3xl font-bold tracking-widest text-emerald-300" data-testid="coop-code">{code || "…"}</div>
            </div>
            {info && !info.lan ? (
              <p className="rounded border border-amber-500 p-2 text-amber-200" data-testid="coop-lan-off">
                The Wi-Fi addresses will not work yet: this game is only reachable from this computer. To let friends on your Wi-Fi in, restart it with <code>deploy\windows-start.ps1 -Mode prod -Lan</code> (the game has no login, so only do this on a network you trust). Friends who use Tailscale can open this game's Tailscale address followed by <code>/coop</code> instead.
              </p>
            ) : (
              <div className="space-y-1 text-gray-300">
                <p>Friends open one of these in a browser (one address, not both), type the code and pick their character:</p>
                {(info?.urls ?? []).map((u) => {
                  const tailscale = /^http:\/\/100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(u);
                  return (
                    <div key={u} className="rounded border border-gray-700 p-2">
                      <div className="text-xs text-gray-400">{tailscale ? "Friends using Tailscale" : "Friends on the same Wi-Fi"}</div>
                      <code className="select-all break-all text-sky-300">{u}/coop</code>
                    </div>
                  );
                })}
              </div>
            )}
            <ul className="space-y-1" data-testid="coop-members">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded border border-gray-700 p-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: m.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{m.name}</span>{m.id === me ? " (you)" : ""}{m.host ? " · host" : ""}
                    <span className="block truncate text-xs text-gray-400">{m.connected ? areaName(m.areaId) : "not connected"}</span>
                  </span>
                  {m.id !== me && m.connected && coopMe()?.areaId !== m.areaId && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => { onGoTo(m.areaId, m.name); onClose(); }}>Go to them</Button>
                  )}
                  {m.id !== me && coopMe()?.host && (
                    <Button
                      size="sm" variant="destructive" className="h-6 px-2 text-xs" data-testid={`coop-kick-${m.id}`}
                      onClick={() => { if (window.confirm(`Remove ${m.name} from the game? They cannot rejoin it.`)) kickPlayer(m.id); }}
                    >
                      Kick
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400">House rule: walking to a party member in the same settlement takes five minutes, as the map would. Leaving the settlement is only done together (a room opens for everyone).</p>
            <Button variant="destructive" onClick={() => { leaveCoop(); onClose(); }} data-testid="coop-leave">Leave the game</Button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The travel room
// ---------------------------------------------------------------------------------------------

const ROLE_HINT: Record<string, string> = {
  pilot: "flies it (on their own screen)",
  gunner: "mans a gun",
  passenger: "rides along",
  "co-pilot": "backs up the helm",
  navigator: "plots the jump",
  engineer: "keeps the engines",
  alone: "goes on their own",
};

export function TravelRoomPanel({ room, nameOf }: { room: TravelRoom; nameOf: (id: string) => string }) {
  const { me, members } = useCoop();
  const live = members.filter((m) => m.connected);
  const mine = me ? room.seats[me] : undefined;
  const joined = !!me && room.joined.includes(me);
  const issues = room.phase === "crew" ? crewIssues(room) : [];
  const ready = !!me && room.ready.includes(me);

  if (room.phase === "underway") {
    const units = unitsOf(room);
    const waiting = room.pending.map((id) => ({ id, unit: units.find((u) => u.leader === id) }));
    const leading = !!me && room.pending.includes(me);
    const craft = (id: string): Craft | undefined => room.crafts.find((c) => c.id === id);
    const myCraft = mine ? craft(mine.craft) : undefined;
    const myUnit = units.find((u) => u.crew.includes(me ?? ""));
    const riding = !leading && !!myUnit;
    // Whoever flies has their trip on screen; a small strip says the party is on its way. A passenger sees the whole page covered.
    if (!riding) {
      return (
        <div className="pointer-events-none fixed inset-x-0 top-8 z-40 flex justify-center px-2" data-testid="travel-room">
          <div className="pointer-events-auto flex items-center gap-2 rounded border border-sky-500 bg-gray-900/95 px-3 py-1 text-xs text-sky-200">
            <span>Journey to {room.title}: waiting for {waiting.map((w) => nameOf(w.id)).join(", ") || "the others"}</span>
            {leading && <Button size="sm" variant="outline" className="h-5 px-2 text-[11px]" onClick={cancelTravel} data-testid="room-abandon">Call it off</Button>}
          </div>
        </div>
      );
    }
    // A speeder's crew sees the road from their own seat: the gunner mans the gun, a passenger watches (the pilot streams the leg to them)
    if (myCraft?.kind === "vehicle" && (mine?.role === "gunner" || mine?.role === "passenger")) {
      const gunnerAboard = !!myUnit?.crew.some((id) => room.seats[id]?.role === "gunner");
      return <RoadRide gunner={mine.role === "gunner"} gunnerAboard={gunnerAboard} pilotName={nameOf(myUnit?.leader ?? room.by)} />;
    }
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4" data-testid="travel-room">
        <div className="w-full max-w-md space-y-3 rounded border border-sky-500 bg-gray-900 p-4 text-sm">
          <h2 className="text-lg font-semibold text-sky-300">On the way to {room.title}</h2>
          <p className="text-gray-300">
            You ride in {myCraft?.label ?? "the party's craft"} as {mine?.role ?? "a passenger"}. {nameOf(myUnit?.leader ?? room.by)} flies it; you arrive when they do.
          </p>
          <ul className="space-y-1">
            {units.map((u) => (
              <li key={u.leader} className="rounded border border-gray-700 p-2">
                <div className="font-semibold">{craft(u.craft)?.label ?? u.craft} {room.pending.includes(u.leader) ? <span className="text-amber-300">· under way</span> : <span className="text-emerald-300">· arrived</span>}</div>
                <div className="text-xs text-gray-300">{u.crew.map((id) => `${nameOf(id)} (${room.seats[id]?.role})`).join(", ")}</div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400">You are in the craft until it arrives: only its pilot can turn back.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3" data-testid="travel-room" role="dialog" aria-label="Travel as a party">
      <div className="max-h-full w-full max-w-2xl space-y-3 overflow-y-auto rounded border border-sky-500 bg-gray-900 p-4 text-sm">
        <h2 className="text-lg font-semibold text-sky-300">{nameOf(room.by)} is setting out for {room.title}</h2>
        {room.phase === "gather" && (
          <>
            <p className="text-gray-300">The party travels together. Everyone joins, then you choose how each of you goes.</p>
            <ul className="space-y-1" data-testid="room-joined">
              {live.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: m.color }} />
                  <span className="flex-1">{m.name}</span>
                  {room.joined.includes(m.id) ? <span className="text-emerald-300">joined</span> : <span className="text-amber-300">waiting</span>}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              {!joined && <Button onClick={joinTravel} data-testid="room-join">Join</Button>}
              {joined && <p className="flex-1 text-gray-300">Waiting for the others to join…</p>}
              <Button variant="outline" onClick={cancelTravel} data-testid="room-cancel">{me === room.by ? "Call it off" : "Stay here (calls it off)"}</Button>
            </div>
          </>
        )}
        {room.phase === "crew" && (
          <>
            <p className="text-gray-300">
              {room.ship ? "Pick the ship you board and your place aboard." : "Pick the craft you ride and your seat: take one of your own, or join another member's."}
              {" "}House rule: a craft has one pilot; the others man its guns or ride along. The pilot flies the trip on their screen and the rest arrive with them.
            </p>
            <div className="grid gap-2 sm:grid-cols-2" data-testid="room-crafts">
              {room.crafts.map((c) => {
                const crew = room.joined.filter((id) => room.seats[id]?.craft === c.id);
                return (
                  <div key={c.id} className={`rounded border p-2 ${mine?.craft === c.id ? "border-yellow-400" : "border-gray-600"}`} data-testid={`craft-${c.id}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{c.label}</span>
                      <span className="text-xs text-gray-400">{c.kind === "solo" ? "alone" : `${crew.length}/${c.seats} seats`}</span>
                    </div>
                    {c.blocked && <div className="text-xs text-red-300">{c.blocked}</div>}
                    {crew.length > 0 && (
                      <ul className="my-1 text-xs text-gray-200">
                        {crew.map((id) => <li key={id}>{nameOf(id)} · {room.seats[id].role}</li>)}
                      </ul>
                    )}
                    {!c.blocked && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {rolesOf(c).map((role) => (
                          <Button
                            key={role} size="sm" variant={mine?.craft === c.id && mine.role === role ? "default" : "outline"} className="h-6 px-2 text-xs"
                            title={ROLE_HINT[role]} data-testid={`seat-${c.id}-${role}`} onClick={() => chooseSeat(c.id, role)}
                          >
                            {role === "alone" ? "Go this way" : role}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <ul className="space-y-1">
              {room.joined.map((id) => (
                <li key={id} className="flex items-center gap-2 text-xs">
                  <span className="h-3 w-3 rounded-full" style={{ background: members.find((m) => m.id === id)?.color }} />
                  <span className="flex-1">{nameOf(id)}: {room.seats[id] ? `${room.crafts.find((c) => c.id === room.seats[id].craft)?.label}, ${room.seats[id].role}` : "no seat"}</span>
                  {room.ready.includes(id) ? <span className="text-emerald-300">ready</span> : <span className="text-amber-300">choosing</span>}
                </li>
              ))}
            </ul>
            {issues.length > 0 && <ul className="rounded border border-amber-500 p-2 text-xs text-amber-200" data-testid="room-issues">{issues.map((i) => <li key={i}>{i}</li>)}</ul>}
            <div className="flex gap-2">
              <Button onClick={() => readyTravel(!ready)} disabled={!mine} data-testid="room-ready">{ready ? "Not ready" : "Ready"}</Button>
              <Button variant="outline" onClick={cancelTravel} data-testid="room-cancel">Call it off</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
