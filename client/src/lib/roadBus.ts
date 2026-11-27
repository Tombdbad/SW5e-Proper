// What passes between a co-op pilot driving a road leg and the crew riding with them (2026-10-30; the user: the gunner's seat did nothing, and a
// crew member was left looking at a menu the whole journey). The pilot's page runs the leg; it streams the race to the crew, and the gunner
// streams their aim and trigger back. lib/coop.ts fills this from the socket; components/Map/FlightScene.tsx reads and writes it.
import type { Race, RaceEvent } from "@shared/logic";

export interface RoadSnap { race: Race; events: RaceEvent[]; at: number }
export const roadBus = {
  // Set by lib/coop.ts: sends a message to the server (which relays it to the pilot or the crew)
  send: null as ((message: Record<string, unknown>) => void) | null,
  // The pilot's leg as the crew gets it (the minigame spec, whole), and the race as last streamed
  spec: null as { game: any; at: number } | null,
  snap: null as RoadSnap | null,
  // The gunner's aim (radians off the nose) and trigger, as last sent to the pilot
  gun: { aim: 0, fire: false, at: 0 },
};
export const resetRoad = () => {
  roadBus.spec = null;
  roadBus.snap = null;
  roadBus.gun = { aim: 0, fire: false, at: 0 };
};

// A podrace in co-op (2026-11-27; shared/logic "Pod racing"): the member who enters invites the game, members join with the make they hire,
// the entrant's page starts the race with them on the grid and streams it, and each member's page sends what they steer. lib/coop.ts fills
// this from the socket; GameBoard.tsx (the invitation, the setup) and FlightScene.tsx (the race) read and write it. `version` counts changes
// for the pages that show the invitation and who has joined.
export interface PodInvite { from: string; name: string; seed: number; biome: string; title: string; at: number }
export const podBus = {
  invite: null as PodInvite | null,
  joined: {} as Record<string, { name: string; make: string; at: number }>,
  start: null as { from: string; game: any; at: number } | null,
  snap: null as RoadSnap | null,
  inputs: {} as Record<string, { input: any; at: number }>,
  version: 0,
  listeners: new Set<() => void>(),
};
export const podChanged = () => {
  podBus.version++;
  podBus.listeners.forEach((l) => l());
};
export const subscribePod = (l: () => void) => {
  podBus.listeners.add(l);
  return () => { podBus.listeners.delete(l); };
};
export const resetPod = () => {
  Object.assign(podBus, { invite: null, joined: {}, start: null, snap: null, inputs: {} });
  podChanged();
};
