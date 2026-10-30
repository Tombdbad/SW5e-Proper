// Co-op, the player's side (2026-10-29; server/coop.ts is the other, shared/logic/coop.ts the rules). One WebSocket to the game's own server
// carries everything: who is in the game, where each one is, the campaign's changes as patches, and the travel room.
//
// Play stays as it was. Where it saved the campaign it calls `saveShared` first: in a co-op game that sends the change as a patch (and the
// member's own place as a move) and returns true, and Play skips its own request. Changes of others arrive here and are applied to the
// campaign Play shows (the query cache), so it redraws as it does for a change of its own.
import { create } from "zustand";
import { toast } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { roadBus, resetRoad } from "@/lib/roadBus";
import { applyChanges, changesBetween, type Changes, type CoopMember, type Craft, type TravelRoom } from "@shared/logic/coop";

// (`r`: the craft they are at the helm of, LocalMap rideKey)
export interface Peer { a: string; x: number; y: number; f: number; h?: number; s?: number; r?: string }

interface CoopStore {
  status: "off" | "connecting" | "on";
  code: string;
  campaignId: number | null;
  gameName: string;
  me: string | null;
  members: CoopMember[];
  room: TravelRoom | null;
  peers: Record<string, Peer>;
  error: string;
}

export const useCoop = create<CoopStore>(() => ({ status: "off", code: "", campaignId: null, gameName: "", me: null, members: [], room: null, peers: {}, error: "" }));

const KEY = "sw5e.coop";
interface Saved { code?: string; campaignId: number; characterId: number; host?: boolean }
let saved: Saved | null = null;
let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let wanted = false;
// What the campaign was at the last change everyone knows of (patches are the difference from it), and changes that came before it was known
let base: Record<string, any> | null = null;
let early: Changes[] = [];
let queued: string[] = [];

const campaignKey = () => [`/api/campaigns/${useCoop.getState().campaignId}`];
const set = (patch: Partial<CoopStore>) => useCoop.setState(patch);

const remember = (next: Saved | null) => {
  saved = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {}
};

export const coopActive = () => useCoop.getState().status !== "off" && useCoop.getState().campaignId !== null;
export const coopMe = (): CoopMember | undefined => useCoop.getState().members.find((m) => m.id === useCoop.getState().me);
export const coopOthers = (): CoopMember[] => useCoop.getState().members.filter((m) => m.id !== useCoop.getState().me);

// (the road's stream is not held back for a connection that is down: it is stale in a second)
roadBus.send = (message) => { if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };

function transmit(message: unknown) {
  const text = JSON.stringify(message);
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(text);
  else queued.push(text);
}

function open() {
  if (!saved) return;
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/coop`;
  const ws = new WebSocket(url);
  socket = ws;
  set({ status: "connecting" });
  ws.onopen = () => {
    ws.send(JSON.stringify({ t: "hello", ...saved }));
  };
  ws.onmessage = (event) => {
    let msg: any;
    try { msg = JSON.parse(event.data); } catch { return; }
    receive(msg);
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    if (!wanted) return;
    set({ status: "connecting" });
    retry = setTimeout(open, 2000);
  };
  ws.onerror = () => {};
}

function receive(msg: any) {
  switch (msg.t) {
    case "welcome": {
      remember({ ...(saved as Saved), code: msg.code, host: false });
      // (a held-back change goes out now the server knows us)
      set({ status: "on", code: msg.code, campaignId: msg.campaignId, gameName: msg.name, me: msg.you, members: msg.members, room: msg.room ?? null, error: "" });
      const out = queued;
      queued = [];
      for (const text of out) socket?.send(text);
      // The campaign Play shows may be older than the live one (a page open before the game was): it is loaded again, and that
      // version is what the patches are measured from
      base = null;
      void queryClient
        .fetchQuery({ queryKey: campaignKey(), queryFn: async () => (await fetch(String(campaignKey()[0]))).json(), staleTime: 0 })
        .then((fresh) => {
          let version = fresh;
          for (const changes of early) version = applyChanges(version, changes);
          early = [];
          base = version;
          queryClient.setQueryData(campaignKey(), version);
        })
        .catch(() => {});
      return;
    }
    case "members": {
      const before = useCoop.getState().members;
      set({ members: msg.members });
      const me = useCoop.getState().me;
      for (const m of msg.members as CoopMember[]) {
        if (m.id === me) continue;
        const old = before.find((o) => o.id === m.id);
        if (!old) toast.info(`${m.name} joined the game`);
        else if (old.connected && !m.connected) toast.info(`${m.name} lost the connection`);
        else if (!old.connected && m.connected) toast.info(`${m.name} is back`);
      }
      return;
    }
    case "gone":
      return void toast.info(`${msg.name} left the game`);
    case "patch": {
      if (!base) {
        early.push(msg.changes);
        return;
      }
      base = applyChanges(base, msg.changes);
      queryClient.setQueryData(campaignKey(), (old: any) => (old ? applyChanges(old, msg.changes) : old));
      return;
    }
    case "pos": {
      const peers = { ...useCoop.getState().peers };
      if (msg.a) peers[msg.id] = { a: msg.a, x: msg.x, y: msg.y, f: Number(msg.f) || 0, h: Number(msg.h) || 0, s: Number(msg.s) || 0, r: typeof msg.r === "string" && msg.r ? msg.r : undefined };
      else delete peers[msg.id];
      return void set({ peers });
    }
    case "road": {
      // From the pilot of the craft I ride: the leg they drive, and the race as it runs
      if (msg.spec) roadBus.spec = { game: msg.spec, at: performance.now() };
      if (msg.race) roadBus.snap = { race: msg.race, events: Array.isArray(msg.events) ? msg.events : [], at: performance.now() };
      return;
    }
    case "gun": {
      // From the gunner of the craft I pilot
      roadBus.gun = { aim: Number(msg.aim) || 0, fire: !!msg.fire, at: performance.now() };
      return;
    }
    case "room": {
      const before = useCoop.getState().room;
      set({ room: msg.room ?? null });
      if (msg.note) toast.info(msg.note);
      else if (before && !msg.room && before.phase !== "underway") toast.info("The journey was called off");
      return;
    }
    case "error": {
      set({ error: String(msg.message ?? "") });
      // (a game that is not there, or a code that is wrong, will not be better in two seconds)
      if (useCoop.getState().status !== "on") {
        if (useCoop.getState().me) toast.error("The co-op game has ended; playing on alone");
        stop();
      } else toast.error(String(msg.message ?? "Co-op error"));
      return;
    }
    case "ended": {
      if (msg.reason) toast.info(String(msg.reason));
      stop();
      return;
    }
  }
}

function stop() {
  wanted = false;
  clearTimeout(retry);
  const ws = socket;
  socket = null;
  ws?.close();
  remember(null);
  base = null;
  early = [];
  queued = [];
  resetRoad();
  lastPets = "";
  set({ status: "off", code: "", me: null, members: [], room: null, peers: {} });
}

// Host a co-op game of this campaign with this character, or join one by its code. Resolves when the server has answered.
export function startCoop(args: { campaignId: number; characterId: number; code?: string; host?: boolean }): Promise<void> {
  stop();
  set({ error: "", campaignId: args.campaignId });
  remember({ campaignId: args.campaignId, characterId: args.characterId, code: args.code?.toUpperCase().trim(), host: args.host });
  wanted = true;
  open();
  return new Promise((resolve, reject) => {
    const off = useCoop.subscribe((s) => {
      if (s.status === "on") { off(); resolve(); }
      else if (s.status === "off" || s.error) { off(); reject(new Error(s.error || "Could not join")); }
    });
  });
}

// Picked up again after a reload (the code and the character are kept for the tab)
export function resumeCoop() {
  if (wanted || useCoop.getState().status !== "off") return;
  try {
    const text = sessionStorage.getItem(KEY);
    if (!text) return;
    saved = JSON.parse(text);
    set({ campaignId: saved!.campaignId });
    wanted = true;
    open();
  } catch {}
}

// The host removes a player from the game (the server ignores anyone else's)
export function kickPlayer(id: string) {
  transmit({ t: "kick", id });
}
export function leaveCoop() {
  transmit({ t: "leave" });
  setTimeout(stop, 50);
}

// ---------------------------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------------------------

// Play has the campaign (as the query cache has it): the version the patches are measured from
export function attachCampaign(campaign: Record<string, any> | undefined) {
  if (!campaign || base || !coopActive()) return;
  base = campaign;
  for (const changes of early) {
    base = applyChanges(base, changes);
    queryClient.setQueryData(campaignKey(), (old: any) => (old ? applyChanges(old, changes) : old));
  }
  early = [];
}

// A save of Play's, shared: the change goes out as a patch, the member's own place as a move. False when there is no co-op game (Play saves as ever).
export function saveShared(changes: Record<string, any>): boolean {
  if (!coopActive()) return false;
  const { currentLocation, ...rest } = changes;
  let ops: Changes = {};
  if (base) {
    ops = changesBetween(base, rest);
    base = applyChanges(base, ops);
  } else {
    // (not known yet: send whole fields, which is safe if less kind to a neighbour's change)
    for (const [key, value] of Object.entries(rest)) ops[key] = [{ p: [], v: value }];
  }
  if (typeof currentLocation === "string") {
    set({ members: useCoop.getState().members.map((m) => (m.id === useCoop.getState().me ? { ...m, areaId: currentLocation } : m)) });
  }
  if (Object.keys(ops).length || typeof currentLocation === "string") transmit({ t: "save", changes: ops, ...(typeof currentLocation === "string" ? { at: currentLocation } : {}) });
  return true;
}

// Who follows this player (companions and beasts), told to the others once it changes
let lastPets = "";
export function sharePets(pets: unknown[]) {
  if (!coopActive()) return;
  const text = JSON.stringify(pets.map((p: any) => [p.id, p.name, p.kind, p.hp > 0, p.role, p.species, p.creature, p.size, p.statBlock]));
  if (text === lastPets) return;
  lastPets = text;
  transmit({ t: "pets", pets });
}
let lastPos = "";
let lastPosAt = 0;
// (called from a timer of the link, so the last place stood at is always sent; a change in height counts, so a jump is seen)
export function sharePosition(areaId: string, x: number, y: number, f = 0, h = 0, s = 0, r = "") {
  if (!coopActive() || useCoop.getState().members.length < 2) return;
  f = +f.toFixed(2);
  const text = `${areaId}|${x.toFixed(2)}|${y.toFixed(2)}|${h.toFixed(2)}|${f}|${s}|${r}`;
  if (text === lastPos) return;
  lastPos = text;
  lastPosAt = Date.now();
  transmit({ t: "pos", a: areaId, x, y, f, h: +h.toFixed(2), s, ...(r ? { r } : {}) });
}

// ---------------------------------------------------------------------------------------------
// The travel room
// ---------------------------------------------------------------------------------------------
export const proposeTravel = (args: { exit: unknown; crafts: Craft[]; title: string; ship: boolean; aboard: boolean }) => transmit({ t: "propose", ...args });
// A ship flown from its helm has gone (its crew is on its deck, which has moved)
export const arrivedTravel = () => transmit({ t: "arrived" });
export const joinTravel = () => transmit({ t: "join" });
export const chooseSeat = (craft: string, role: string) => transmit({ t: "seat", craft, role });
export const readyTravel = (on: boolean) => transmit({ t: "ready", on });
export const cancelTravel = () => transmit({ t: "cancel" });
