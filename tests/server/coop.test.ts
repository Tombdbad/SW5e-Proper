// Co-op sessions over a real WebSocket (2026-10-29): hosting and joining by code, the live campaign shared as patches, each member's own place,
// and the travel room from the proposal to the arrival. It needs a database with a campaign that has a world, so it only runs against a
// TEST database (DATABASE_URL ending in _test); it changes nothing it does not put back.
//   DATABASE_URL=postgres://.../sw5e_test node --import tsx --test tests/server/coop.test.ts
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import express from "express";
import { WebSocket } from "ws";
import "dotenv/config";

const testDb = /_test(\?|$)/.test(process.env.DATABASE_URL ?? "");
const skip = testDb ? false : "needs DATABASE_URL pointing at a *_test database";

let server: http.Server;
let port = 0;
let pool: { end: () => Promise<void>; query: (sql: string, args?: unknown[]) => Promise<{ rows: any[] }> };
let campaign: { id: number; world: any };
let chars: number[] = [];

before(async () => {
  if (skip) return;
  const { registerCoopRoutes, attachCoop } = await import("../../server/coop");
  const db = await import("../../server/db");
  pool = db.pool as never;
  const rows = (await pool.query("select id, galaxy_map from campaigns where galaxy_map is not null order by id desc limit 1")).rows;
  campaign = { id: rows[0].id, world: rows[0].galaxy_map };
  chars = (await pool.query("select id from characters order by id limit 6")).rows.map((r) => r.id);
  const app = express();
  registerCoopRoutes(app);
  server = http.createServer(app);
  attachCoop(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});
after(async () => {
  if (skip) return;
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
  await pool.end();
});

// A client that keeps every message and lets a test wait for the next one of a kind
function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/coop`);
  const seen: any[] = [];
  const waiters: { t: string; ok: (m: any) => boolean; resolve: (m: any) => void }[] = [];
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    seen.push(m);
    for (const w of [...waiters]) if (w.t === m.t && w.ok(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  const opened = new Promise<void>((r) => ws.on("open", () => r()));
  return {
    ws, seen,
    send: async (m: unknown) => { await opened; ws.send(JSON.stringify(m)); },
    next: (t: string, ok: (m: any) => boolean = () => true) =>
      new Promise<any>((resolve, reject) => {
        const old = [...seen].reverse().find((m) => m.t === t && ok(m));
        if (old && seen.splice(seen.indexOf(old), 1)) return resolve(old);
        const where = new Error().stack?.split("\n")[3] ?? "";
        const timer = setTimeout(() => reject(new Error(`no ${t} ${where}; saw ${seen.map((m) => `${m.t}${m.room !== undefined ? `:${m.room?.phase ?? "null"}` : ""}`).join(",")}`)), 4000);
        waiters.push({ t, ok, resolve: (m) => { clearTimeout(timer); resolve(m); } });
      }),
    close: () => ws.close(),
  };
}
const quiet = (ms = 150) => new Promise((r) => setTimeout(r, ms));

test("a co-op game: host, join by code, patches shared, places apart, a journey as a party", { skip }, async () => {
  const world = campaign.world;
  const ids = Object.keys(world.areas);
  const start: string = world.startId;
  const settlement = ids.find((id) => world.areas[id].kind === "settlement" && id !== start) ?? ids.find((id) => id !== start)!;
  const elsewhere = ids.find((id) => id !== start && id !== settlement && world.areas[id].kind === "room") ?? settlement;

  const host = client();
  await host.send({ t: "hello", campaignId: campaign.id, characterId: chars[0], host: true });
  const w1 = await host.next("welcome");
  assert.match(w1.code, /^[A-Z]{4}$/);
  assert.equal(w1.members.length, 1);
  const hostId = w1.you;

  // a second game of the same campaign cannot be hosted; a wrong code is refused
  const dup = client();
  await dup.send({ t: "hello", campaignId: campaign.id, characterId: chars[1], host: true });
  assert.match((await dup.next("error")).message, /open already/);
  const wrong = client();
  await wrong.send({ t: "hello", campaignId: campaign.id, characterId: chars[1], code: "QQQQ" });
  assert.match((await wrong.next("error")).message, /No co-op game/);

  const guest = client();
  await guest.send({ t: "hello", campaignId: campaign.id, characterId: chars[1], code: w1.code.toLowerCase() });
  const w2 = await guest.next("welcome");
  const guestId = w2.you;
  assert.equal(w2.members.length, 2);
  assert.equal(w2.members.find((m: any) => m.id === guestId).areaId, w2.members.find((m: any) => m.id === hostId).areaId, "the guest starts where the host is");
  await host.next("members", (m) => m.members.length === 2);

  // a change of the campaign goes to the other, as a patch
  const before = world.areas[start].description;
  await host.send({ t: "save", changes: { galaxyMap: [{ p: ["areas", start, "description"], v: "Changed by the host" }] } });
  const patch = await guest.next("patch");
  assert.equal(patch.changes.galaxyMap[0].v, "Changed by the host");
  const live = await (await fetch(`http://127.0.0.1:${port}/api/coop/open`)).json();
  assert.equal(live.length >= 1, true);
  await host.send({ t: "save", changes: { galaxyMap: [{ p: ["areas", start, "description"], v: before }] } });
  await guest.next("patch");

  // each member has a place of their own
  await guest.send({ t: "move", areaId: settlement });
  const moved = await host.next("members", (m) => m.members.find((x: any) => x.id === guestId)?.areaId === settlement);
  assert.equal(moved.members.find((x: any) => x.id === hostId).areaId, w1.members[0].areaId, "the host stayed");

  // positions are sent on
  await guest.send({ t: "pos", a: settlement, x: 3.5, y: 4, f: 1 });
  const pos = await host.next("pos");
  assert.deepEqual([pos.id, pos.a, pos.x, pos.y], [guestId, settlement, 3.5, 4]);

  // the journey: the host proposes, the guest joins, they choose seats, both ready, the pilot arrives, and the crew with them
  await host.send({ t: "move", areaId: start });
  const crafts = [
    { id: "vehicle-v1", kind: "vehicle", label: "Speeder", seats: 2, rideId: "vehicle-v1" },
    { id: "foot", kind: "solo", label: "On foot", seats: 99, rideId: "foot" },
  ];
  await host.send({ t: "propose", exit: { to: elsewhere, via: "path", label: "Road", travel: "12 km" }, crafts, title: "Elsewhere", ship: false, aboard: false });
  const gather = await guest.next("room", (m) => m.room?.phase === "gather");
  assert.deepEqual(gather.room.joined, [hostId]);
  await guest.send({ t: "join" });
  const crew = await host.next("room", (m) => m.room?.phase === "crew");
  assert.equal(Object.keys(crew.room.seats).length, 2, "each is given a seat to begin with");
  // (two sockets are two queues: each step is let in before the next)
  await guest.send({ t: "ready", on: true });
  await quiet(60);
  await host.send({ t: "seat", craft: "vehicle-v1", role: "pilot" });
  await quiet(60);
  await guest.send({ t: "seat", craft: "vehicle-v1", role: "gunner" });
  await quiet(60);
  await host.send({ t: "ready", on: true });
  await quiet(60);
  await guest.send({ t: "ready", on: true });
  const going = await guest.next("room", (m) => m.room?.phase === "underway");
  assert.deepEqual(going.room.pending, [hostId]);
  // the gunner's aim goes to the pilot, the pilot's leg of the road to the gunner, and a rider cannot call a journey under way off (they would be
  // left behind while their craft went on)
  await guest.send({ t: "gun", aim: 0.5, fire: true });
  const gun = await host.next("gun");
  assert.deepEqual([gun.aim, gun.fire], [0.5, true]);
  await host.send({ t: "road", spec: { seed: 7 }, race: { t: 1 }, events: [] });
  const leg = await guest.next("road");
  assert.equal(leg.spec.seed, 7);
  await guest.send({ t: "cancel" });
  await quiet();
  assert.equal(guest.seen.some((m) => m.t === "room" && m.room === null), false, "the journey goes on");
  // who follows a member is told to the others
  await guest.send({ t: "pets", pets: [{ id: "c1", name: "Rex", kind: "beast", hp: 9, size: "Medium" }] });
  const told = await host.next("members", (m) => !!m.members.find((x: any) => x.id === guestId)?.pets?.length);
  assert.equal(told.members.find((x: any) => x.id === guestId).pets[0].name, "Rex");
  // the gunner cannot walk off while the pilot flies
  await guest.send({ t: "move", areaId: start });
  await quiet();
  await host.send({ t: "save", changes: {}, at: elsewhere });
  const arrived = await guest.next("members", (m) => m.members.every((x: any) => x.areaId === elsewhere));
  assert.equal(arrived.members.length, 2);
  const closed = await guest.next("room", (m) => m.room === null);
  assert.equal(closed.room, null);

  // a journey called off, and a member who leaves while it gathers
  await guest.send({ t: "propose", exit: { to: start, via: "path", label: "Road", travel: "3 km" }, crafts, title: "Back", ship: false, aboard: false });
  await host.next("room", (m) => m.room?.phase === "gather");
  await host.send({ t: "cancel" });
  assert.equal((await guest.next("room", (m) => m.room === null)).room, null);

  await guest.send({ t: "leave" });
  await host.next("members", (m) => m.members.length === 1);
  host.close();
  [dup, wrong, guest].forEach((c) => c.close());
  await quiet(600);
});

test("a ship flown from its helm: the pilot makes the deck, the crew boards with them, the deck flies, and the crew stays aboard", { skip }, async () => {
  const world = campaign.world;
  const start: string = world.startId;
  const orbit = Object.keys(world.areas).find((id) => world.areas[id].kind === "planet") ?? start;
  const deck = "deck-test-ship";
  const host = client();
  await host.send({ t: "hello", campaignId: campaign.id, characterId: chars[0], host: true });
  const { code, you: hostId } = await host.next("welcome");
  const guest = client();
  await guest.send({ t: "hello", campaignId: campaign.id, characterId: chars[1], code });
  const { you: guestId } = await guest.next("welcome");
  await host.send({ t: "move", areaId: start });
  await guest.send({ t: "move", areaId: start });
  await quiet();

  const crafts = [{ id: "ship-s1", kind: "ship", label: "Ebon Hawk", seats: 4, shipId: "s1", deck }];
  await host.send({ t: "propose", exit: { to: orbit, via: "leave", label: "Take off", travel: "", needsShip: true }, crafts, title: "orbit", ship: true, aboard: true });
  await guest.next("room", (m) => m.room?.phase === "gather");
  await guest.send({ t: "join" });
  await host.next("room", (m) => m.room?.phase === "crew");
  await quiet(60);
  await host.send({ t: "seat", craft: "ship-s1", role: "pilot" });
  await quiet(60);
  await guest.send({ t: "seat", craft: "ship-s1", role: "gunner" });
  await quiet(60);
  await host.send({ t: "ready", on: true });
  await quiet(60);
  await guest.send({ t: "ready", on: true });
  const going = await host.next("room", (m) => m.room?.phase === "underway");
  assert.equal(going.room.aboard, true);
  assert.deepEqual(going.room.boarded, [], "the deck is not there yet");

  // the pilot's Play makes the deck (a change of the world) and steps onto it
  const deckArea = { ...world.areas[start], id: deck, kind: "room", name: "Ebon Hawk, main deck", parentId: start, type: "deck", tags: ["ship:s1"] };
  await host.send({ t: "save", changes: { galaxyMap: [{ p: ["areas", deck], v: deckArea }] }, at: deck });
  const boarded = await guest.next("members", (m) => m.members.every((x: any) => x.areaId === deck));
  assert.equal(boarded.members.length, 2, "the crew is on the deck with the pilot");
  const still = await guest.next("room", (m) => m.room?.boarded?.includes("ship-s1"));
  assert.deepEqual(still.room.pending, [hostId]);

  // the deck flies: not a move, an arrival; the crew is still on it
  await host.send({ t: "arrived" });
  const done = await guest.next("room", (m) => m.room === null);
  assert.equal(done.room, null);
  const places = (await guest.next("members")).members;
  assert.ok(places.every((x: any) => x.areaId === deck), "the crew stays aboard");
  assert.ok([hostId, guestId].every((id) => places.some((x: any) => x.id === id)));

  // put the world back
  await host.send({ t: "save", changes: { galaxyMap: [{ p: ["areas", deck], d: 1 }] }, at: start });
  await guest.send({ t: "move", areaId: start });
  await quiet(500);
  host.close();
  guest.close();
  await quiet(600);
});

test("four play, a fifth is turned away, and a dropped player takes their place again", { skip }, async () => {
  const host = client();
  await host.send({ t: "hello", campaignId: campaign.id, characterId: chars[0], host: true });
  const { code } = await host.next("welcome");
  const players = [host];
  for (const id of chars.slice(1, 4)) {
    const c = client();
    await c.send({ t: "hello", campaignId: campaign.id, characterId: id, code });
    await c.next("welcome");
    players.push(c);
  }
  const fifth = client();
  await fifth.send({ t: "hello", campaignId: campaign.id, characterId: chars[4], code });
  assert.match((await fifth.next("error")).message, /full/);

  // the second player drops and comes back as the same character
  players[1].close();
  await host.next("members", (m) => m.members.some((x: any) => !x.connected));
  const back = client();
  await back.send({ t: "hello", campaignId: campaign.id, characterId: chars[1], code });
  const w = await back.next("welcome");
  assert.equal(w.members.length, 4);
  assert.ok(w.members.every((m: any) => m.connected));
  [...players, back, fifth].forEach((c) => c.close());
  await quiet(600);
});
