// Co-op sessions (2026-10-29): up to four players on one campaign, over a WebSocket at /ws/coop (same port as the game, so a phone on
// the wi-fi or Tailscale Serve needs nothing more). The server owns the session: who is in it, where each member is, the live copy of the
// campaign (every client's changes arrive as patches, shared/logic/coop.ts), and the travel room that moves the party between settlements.
// Play itself stays a client: it plays its own character and sends what changed. The live copy is written to the database a moment after
// each change; while a session is open GET /api/campaigns/:id answers with it.
import type { Express } from "express";
import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import os from "os";
import { WebSocketServer, WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { campaigns, characters, insertCampaignSchema } from "../shared/schema";
import {
  MAX_PLAYERS, MEMBER_COLORS, PERSONAL, applyChanges, cleanPets, crewIssues, defaultSeat, makeCode, rolesOf, unitsOf, withoutMember,
  type Changes, type CoopMember, type Craft, type TravelRoom,
} from "../shared/logic/coop";

interface Peer extends CoopMember {
  socket?: WebSocket;
  // where on that area's map the member stands, for the others' screens
  spot?: { a: string; x: number; y: number };
}

interface Session {
  code: string;
  campaignId: number;
  name: string;
  members: Map<string, Peer>;
  campaign: Record<string, any>;
  dirty: Set<string>;
  saving?: NodeJS.Timeout;
  room: TravelRoom | null;
  rooms: number;
  idle?: NodeJS.Timeout;
  // Characters the host has removed: they cannot come back into this game
  banned?: Set<string>;
}

const byCode = new Map<string, Session>();
const byCampaign = new Map<number, Session>();
// A session with nobody connected for this long is closed (it is written to the database first)
const IDLE_MS = 10 * 60 * 1000;
const SAVE_MS = 400;

const send = (socket: WebSocket | undefined, message: unknown) => {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
};
const membersOf = (s: Session): CoopMember[] => [...s.members.values()].map(({ socket: _socket, spot: _spot, ...m }) => m);
const connected = (s: Session) => [...s.members.values()].filter((m) => m.connected);
const broadcast = (s: Session, message: unknown, except?: string) => {
  for (const m of s.members.values()) if (m.id !== except) send(m.socket, message);
};
const pushMembers = (s: Session) => broadcast(s, { t: "members", members: membersOf(s) });
const pushRoom = (s: Session, note?: string) => broadcast(s, { t: "room", room: s.room, ...(note ? { note } : {}) });

// The live copy of a campaign while a session has it open
export const liveCampaign = (campaignId: number) => byCampaign.get(campaignId)?.campaign;

// Something other than Play (the campaign page) saved fields of the campaign over REST: the live copy takes them and everyone is told
export function mergeLive(campaignId: number, fields: Record<string, unknown>) {
  const s = byCampaign.get(campaignId);
  if (!s) return;
  const changes: Changes = {};
  for (const [key, value] of Object.entries(fields)) {
    if ((PERSONAL as readonly string[]).includes(key) || value === undefined) continue;
    changes[key] = [{ p: [], v: value }];
  }
  s.campaign = applyChanges(s.campaign, changes);
  broadcast(s, { t: "patch", from: "", changes });
}

async function flush(s: Session) {
  if (s.saving) clearTimeout(s.saving);
  s.saving = undefined;
  if (!s.dirty.size) return;
  const fields: Record<string, unknown> = {};
  for (const key of s.dirty) fields[key] = s.campaign[key];
  s.dirty.clear();
  try {
    const set = insertCampaignSchema.partial().parse(fields);
    await db.update(campaigns).set({ ...set, updatedAt: new Date() }).where(eq(campaigns.id, s.campaignId));
  } catch (error) {
    console.error("co-op: could not save the campaign", error);
  }
}
const later = (s: Session) => {
  if (!s.saving) {
    s.saving = setTimeout(() => void flush(s), SAVE_MS);
    s.saving.unref();
  }
};

async function close(s: Session) {
  await flush(s);
  if (s.idle) clearTimeout(s.idle);
  byCode.delete(s.code);
  if (byCampaign.get(s.campaignId) === s) byCampaign.delete(s.campaignId);
  for (const m of s.members.values()) {
    send(m.socket, { t: "ended" });
    m.socket?.close();
  }
}

const watchIdle = (s: Session) => {
  if (s.idle) clearTimeout(s.idle);
  s.idle = connected(s).length ? undefined : setTimeout(() => void close(s), IDLE_MS);
  s.idle?.unref();
};

// ---------------------------------------------------------------------------------------------
// The travel room
// ---------------------------------------------------------------------------------------------

// Everyone connected has joined: the crew is chosen next, each member first in a seat that works
function crewUp(s: Session) {
  const room = s.room;
  if (!room || room.phase !== "gather") return;
  const want = connected(s).map((m) => m.id);
  if (!want.every((id) => room.joined.includes(id))) return;
  room.phase = "crew";
  room.joined = room.joined.filter((id) => want.includes(id));
  for (const id of room.joined) {
    const seat = defaultSeat(room, id);
    if (seat) room.seats[id] = seat;
  }
}

// All joined are ready and the crews work: the crafts go. Each unit is led by its pilot (a member alone leads themself).
function launch(s: Session) {
  const room = s.room;
  if (!room || room.phase !== "crew" || !room.joined.length) return;
  if (!room.joined.every((id) => room.ready.includes(id)) || crewIssues(room).length) return;
  room.phase = "underway";
  room.ready = [];
  const units = unitsOf(room);
  room.pending = units.map((u) => u.leader);
  // A ship flown from its helm: where its deck already stands, its crew goes aboard now; else its pilot makes the deck (boards) and they follow
  if (room.aboard) {
    for (const u of units) {
      const craft = room.crafts.find((c) => c.id === u.craft);
      if (craft?.deck && s.campaign.galaxyMap?.areas?.[craft.deck]) boardCrew(s, room, u, craft);
    }
  }
}

function boardCrew(s: Session, room: TravelRoom, unit: { crew: string[] }, craft: Craft) {
  for (const id of unit.crew) {
    const m = s.members.get(id);
    if (m && craft.deck) m.areaId = craft.deck;
  }
  if (!room.boarded.includes(craft.id)) room.boarded.push(craft.id);
}

// A member arrived where the room was going: their craft's crew is there with them. When every unit is there the room closes.
function arrive(s: Session, leaderId: string, to: string) {
  const room = s.room;
  if (!room || room.phase !== "underway" || !room.pending.includes(leaderId) || to !== room.to) return false;
  const unit = unitsOf(room).find((u) => u.leader === leaderId);
  // (a ship's crew stays aboard its deck, which has flown; any other rider is set down at the destination)
  if (!room.aboard) {
    for (const id of unit?.crew ?? [leaderId]) {
      const m = s.members.get(id);
      if (m) m.areaId = to;
    }
  }
  room.pending = room.pending.filter((id) => id !== leaderId);
  if (!room.pending.length) s.room = null;
  return true;
}

function removeFromRoom(s: Session, id: string) {
  if (!s.room) return;
  if (s.room.by === id && s.room.phase !== "underway") {
    s.room = null;
    return;
  }
  s.room = withoutMember(s.room, id);
  if (s.room.phase === "gather") crewUp(s);
  else if (s.room.phase === "underway" && !s.room.pending.length) s.room = null;
  else if (!s.room.joined.length) s.room = null;
}

// ---------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------

async function hello(socket: WebSocket, msg: any): Promise<{ s: Session; id: string } | undefined> {
  const fail = (message: string) => void send(socket, { t: "error", message });
  const campaignId = Number(msg.campaignId);
  const characterId = Number(msg.characterId);
  if (!Number.isFinite(campaignId) || !Number.isFinite(characterId)) return void fail("A campaign and a character are needed");
  const [character] = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);
  if (!character) return void fail("That character does not exist");
  let s = msg.code ? byCode.get(String(msg.code).toUpperCase().trim()) : undefined;
  if (msg.code && !s) return void fail("No co-op game has that code");
  if (!s) {
    if (!msg.host) return void fail("Give the code of a game to join");
    // (the code is what lets a friend in: a game already open is joined with it, never by asking to host. A game nobody is in any more is
    // taken up again by whoever hosts it.)
    const open = byCampaign.get(campaignId);
    if (open && connected(open).length) return void fail("A co-op game of this campaign is open already: join it with its code");
    if (open) s = open;
  }
  if (!s) {
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!row) return void fail("That campaign does not exist");
    s = { code: makeCode(Math.random, (c) => byCode.has(c)), campaignId, name: String(row.name ?? "Campaign"), members: new Map(), campaign: { ...row }, dirty: new Set(), room: null, rooms: 0 };
    byCode.set(s.code, s);
    byCampaign.set(campaignId, s);
  }
  if (s.campaignId !== campaignId) return void fail("That code is for another campaign");
  const id = String(characterId);
  if (s.banned?.has(id)) return void fail("The host has removed you from this game");
  const mine = s.members.get(id);
  // (the same character coming back, from a dropped connection or another tab, takes its place again)
  if (!mine && s.members.size >= MAX_PLAYERS) return void fail(`The game is full (${MAX_PLAYERS} players)`);
  const host = [...s.members.values()].find((m) => m.host && m.connected);
  const start = mine?.areaId ?? host?.areaId ?? (s.campaign.currentLocation as string) ?? (s.campaign.galaxyMap?.startId as string);
  if (mine?.socket && mine.socket !== socket) {
    // (its close is ignored by `dropped`, which only acts for the member's current socket)
    send(mine.socket, { t: "ended", reason: "You joined from another window" });
    mine.socket.close();
  }
  const used = new Set([...s.members.values()].map((m) => m.color));
  const peer: Peer = mine ?? {
    id, characterId, name: String(character.name ?? "Player"), areaId: start, connected: true, host: s.members.size === 0 || undefined,
    color: MEMBER_COLORS.find((c) => !used.has(c)) ?? MEMBER_COLORS[0],
  };
  peer.socket = socket;
  peer.connected = true;
  peer.name = String(character.name ?? peer.name);
  s.members.set(id, peer);
  watchIdle(s);
  send(socket, { t: "welcome", you: id, code: s.code, campaignId, name: s.name, members: membersOf(s), room: s.room });
  pushMembers(s);
  if (s.room && s.room.phase === "gather" && !s.room.joined.includes(id)) pushRoom(s);
  return { s, id };
}

function handle(s: Session, id: string, msg: any) {
  const me = s.members.get(id)!;
  switch (msg.t) {
    case "save": {
      // The campaign's changes (not the member's own place): applied to the live copy, kept for the database, and sent on
      const changes: Changes = {};
      for (const [key, ops] of Object.entries(msg.changes ?? {})) if (!(PERSONAL as readonly string[]).includes(key) && Array.isArray(ops)) changes[key] = ops as any;
      if (Object.keys(changes).length) {
        s.campaign = applyChanges(s.campaign, changes);
        for (const key of Object.keys(changes)) s.dirty.add(key);
        later(s);
        broadcast(s, { t: "patch", from: id, changes }, id);
      }
      if (typeof msg.at === "string") handle(s, id, { t: "move", areaId: msg.at });
      return;
    }
    case "move": {
      const to = String(msg.areaId ?? "");
      if (!to || !s.campaign.galaxyMap?.areas?.[to]) return;
      // Riding in someone's craft, a member does not move until the craft arrives
      const room = s.room;
      if (room?.phase === "underway") {
        const unit = unitsOf(room).find((u) => u.crew.includes(id));
        if (unit && unit.leader !== id && room.pending.includes(unit.leader)) return;
        if (unit && unit.leader === id) {
          const craft = room.crafts.find((c) => c.id === unit.craft);
          // The pilot boarding the ship (its deck made just now): the crew boards with them
          if (room.aboard && craft?.deck && to === craft.deck && !room.boarded.includes(craft.id)) {
            me.areaId = to;
            boardCrew(s, room, unit, craft);
            pushMembers(s);
            pushRoom(s);
            return void persistHost(s);
          }
          if (!room.aboard && arrive(s, id, to)) {
            pushMembers(s);
            pushRoom(s);
            return void persistHost(s);
          }
        }
      }
      me.areaId = to;
      persistHost(s);
      pushMembers(s);
      return;
    }
    case "pos": {
      me.spot = { a: String(msg.a ?? ""), x: Number(msg.x) || 0, y: Number(msg.y) || 0 };
      // (`r`: the craft they are at the helm of, a short line drawn by the others)
      broadcast(s, { t: "pos", id, ...me.spot, f: Number(msg.f) || 0, h: Math.max(0, Math.min(40, Number(msg.h) || 0)), s: Math.max(0, Math.min(2, Math.round(Number(msg.s) || 0))), ...(typeof msg.r === "string" && msg.r ? { r: msg.r.slice(0, 90) } : {}) }, id);
      return;
    }
    case "arrived": {
      // A ship has flown (it is not a move: its crew stays on its deck)
      if (s.room?.aboard && arrive(s, id, s.room.to)) {
        pushMembers(s);
        pushRoom(s);
      }
      return;
    }
    case "propose": {
      if (s.room) return void send(me.socket, { t: "error", message: "A journey is being arranged already" });
      const crafts: Craft[] = Array.isArray(msg.crafts) ? msg.crafts.slice(0, 40) : [];
      s.room = {
        id: ++s.rooms, by: id, from: me.areaId, to: String(msg.exit?.to ?? ""), title: String(msg.title ?? "A journey"), exit: msg.exit, ship: !!msg.ship, aboard: !!msg.aboard, boarded: [],
        crafts, joined: [id], seats: {}, ready: [], phase: "gather", pending: [],
      };
      crewUp(s);
      return void pushRoom(s);
    }
    case "join": {
      if (s.room?.phase === "gather" && !s.room.joined.includes(id)) {
        s.room.joined.push(id);
        crewUp(s);
        pushRoom(s);
      }
      return;
    }
    case "seat": {
      const room = s.room;
      if (!room || room.phase !== "crew" || !room.joined.includes(id)) return;
      const craft = room.crafts.find((c) => c.id === msg.craft);
      if (!craft || craft.blocked || !rolesOf(craft).includes(String(msg.role))) return;
      const old = room.seats[id];
      room.seats[id] = { craft: craft.id, role: String(msg.role) };
      // A change to a crew puts its members back to not ready
      const touched = new Set([craft.id, old?.craft]);
      room.ready = room.ready.filter((m) => m !== id && !touched.has(room.seats[m]?.craft));
      return void pushRoom(s);
    }
    case "ready": {
      const room = s.room;
      if (!room || room.phase !== "crew" || !room.joined.includes(id) || !room.seats[id]) return;
      room.ready = room.ready.filter((m) => m !== id);
      if (msg.on) room.ready.push(id);
      launch(s);
      return void pushRoom(s);
    }
    case "pets": {
      // Who follows this member, for the others to draw (a character's companions and beasts are its own)
      me.pets = cleanPets(msg.pets);
      return void pushMembers(s);
    }
    case "road": {
      // The pilot of a craft streams its leg of the road to the crew riding in it (the gunner and the passengers see it on their screens)
      const room = s.room;
      if (!room || room.phase !== "underway") return;
      const unit = unitsOf(room).find((u) => u.leader === id);
      if (!unit || JSON.stringify(msg).length > 160000) return;
      for (const other of unit.crew) if (other !== id) send(s.members.get(other)?.socket, { t: "road", spec: msg.spec, race: msg.race, events: msg.events });
      return;
    }
    case "gun": {
      // The gunner of a craft aims and fires for its pilot
      const room = s.room;
      if (!room || room.phase !== "underway" || room.seats[id]?.role !== "gunner") return;
      const unit = unitsOf(room).find((u) => u.crew.includes(id) && u.leader !== id);
      if (unit) send(s.members.get(unit.leader)?.socket, { t: "gun", aim: Number(msg.aim) || 0, fire: !!msg.fire });
      return;
    }
    case "cancel": {
      if (!s.room) return;
      // A journey under way is the pilots' to call off: a rider who could would be left behind while their craft went on (the user, 2026-10-30)
      if (s.room.phase === "underway" && !s.room.pending.includes(id)) return;
      const was = s.room;
      s.room = null;
      return void pushRoom(s, was.phase === "underway" ? `${me.name} called the journey off` : `${me.name} called off the journey to ${was.title}`);
    }
    case "leave": {
      return void leave(s, id);
    }
    case "kick": {
      // Only the host removes someone (never themselves); the one removed is told why and cannot rejoin this game
      const target = s.members.get(String(msg.id ?? ""));
      if (!me.host || !target || target.id === id) return;
      (s.banned ??= new Set()).add(target.id);
      return void leave(s, target.id, `${me.name} removed you from the game`);
    }
  }
}

// The host's place is where a single-player game resumes
function persistHost(s: Session) {
  const host = [...s.members.values()].find((m) => m.host) ?? [...s.members.values()][0];
  if (host && s.campaign.currentLocation !== host.areaId) {
    s.campaign = { ...s.campaign, currentLocation: host.areaId };
    s.dirty.add("currentLocation");
    later(s);
  }
}

function leave(s: Session, id: string, reason?: string) {
  const m = s.members.get(id);
  if (!m) return;
  send(m.socket, { t: "ended", reason });
  m.socket?.close();
  removeFromRoom(s, id);
  s.members.delete(id);
  broadcast(s, { t: "gone", id, name: m.name });
  if (m.host && s.members.size) [...s.members.values()][0].host = true;
  pushMembers(s);
  pushRoom(s);
  if (!s.members.size) void close(s);
}

function dropped(s: Session, id: string, socket: WebSocket) {
  const m = s.members.get(id);
  if (!m || m.socket !== socket) return;
  m.connected = false;
  m.socket = undefined;
  // Someone gone cannot be waited for while the party gathers; a journey under way waits for its pilot
  if (s.room && s.room.phase !== "underway") {
    if (s.room.by === id) s.room = null;
    else {
      s.room.joined = s.room.joined.filter((j) => j !== id);
      crewUp(s);
    }
    pushRoom(s);
  }
  broadcast(s, { t: "pos", id, a: "", x: 0, y: 0, f: 0 });
  pushMembers(s);
  watchIdle(s);
}

// ---------------------------------------------------------------------------------------------
// The server's side
// ---------------------------------------------------------------------------------------------

export function registerCoopRoutes(app: Express) {
  // The addresses a friend on the same network types, and whether the server is listening beyond this machine at all
  app.get("/api/coop/info", (req, res) => {
    const host = process.env.HOST || "127.0.0.1";
    const port = Number(process.env.PORT) || 5000;
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === "IPv4" && !a.internal)
      .map((a) => a.address);
    res.json({ host, port, lan: host === "0.0.0.0" || host === "::", addresses, urls: addresses.map((a) => `http://${a}:${port}`) });
  });
  // The games open on this server, for the join page (a code is still needed to join)
  app.get("/api/coop/open", (_req, res) => {
    res.json([...byCode.values()].map((s) => ({ campaignId: s.campaignId, name: s.name, players: s.members.size, max: MAX_PLAYERS, members: membersOf(s).map((m) => ({ name: m.name, characterId: m.characterId, connected: m.connected })) })));
  });
  // What a code opens, for the character pick
  app.get("/api/coop/code/:code", (req, res) => {
    const s = byCode.get(String(req.params.code).toUpperCase());
    if (!s) return res.status(404).json({ message: "No co-op game has that code" });
    res.json({ campaignId: s.campaignId, name: s.name, full: s.members.size >= MAX_PLAYERS, members: membersOf(s).map((m) => ({ name: m.name, characterId: m.characterId, connected: m.connected })) });
  });
}

export function attachCoop(server: Server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!(req.url ?? "").startsWith("/ws/coop")) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
  wss.on("connection", (socket: WebSocket) => {
    let joined: { s: Session; id: string } | undefined;
    let alive = true;
    socket.on("pong", () => { alive = true; });
    // (a phone that went to sleep stops answering: it is dropped, and takes its place again when it wakes and joins with the code)
    const beat = setInterval(() => {
      if (!alive) return void socket.terminate();
      alive = false;
      socket.ping();
    }, 25000);
    // (messages are handled one at a time, in the order they came)
    let chain = Promise.resolve();
    socket.on("message", (raw) => {
      chain = chain.then(async () => {
        let msg: any;
        try { msg = JSON.parse(String(raw)); } catch { return; }
        try {
          if (msg.t === "hello") {
            if (joined) return;
            joined = await hello(socket, msg);
          } else if (joined) handle(joined.s, joined.id, msg);
        } catch (error) {
          console.error("co-op message failed", error);
          send(socket, { t: "error", message: "The server could not do that" });
        }
      });
    });
    socket.on("close", () => {
      clearInterval(beat);
      if (joined) dropped(joined.s, joined.id, socket);
    });
    socket.on("error", () => {});
  });
}
