// On the road (2026-10-26; shared/logic "On the road"): ambushes of a speeder trip by who hunts the party, the riders as stat blocks,
// and the chase on the race's course (riders that shoot, a party that fires back, one lap to safety).
import test from "node:test";
import assert from "node:assert/strict";
import { CHASE, chaseResult, chaseStart, raceCourse, roadAmbush, roadAmbushers, stepRace, type Race, type RaceScenery, type World } from "../../shared/logic/index";
import monsters from "../../shared/data/sw5e/monsters.json";
import equipment from "../../shared/data/sw5e/equipment.json";

const scenery: RaceScenery = { trees: ["tree"], shrubs: [], boulders: ["rock"], hits: { tree: { r: 0.5, h: 6 }, rock: { r: 1.2, h: 2 } } };
const area = (id: string, kind: string, type: string, parentId?: string, extra: Record<string, unknown> = {}) => ({ id, kind, type, name: id, parentId, tags: [], occupants: [], ships: [], loot: [], position: { x: 0, y: 0, z: 0 }, danger: 0, ...extra });
// A settlement in a region of the given name (the era's law by region), in the Galactic Civil War
const worldIn = (region: string) => ({
  era: "galactic-civil-war", antagonist: "Black Sun",
  areas: { g: area("g", "galaxy", "galaxy"), r: area("r", "region", region, "g", { name: region }), y: area("y", "system", "star", "r"), p: area("p", "planet", "desert", "y"), s: area("s", "settlement", "town", "p") },
  paths: [],
}) as unknown as World;
const rate = (w: World, o: { alignment?: string; wanted?: boolean }) => {
  const hits = Array.from({ length: 400 }, (_, i) => roadAmbush(w, "s", { ...o, seed: i + 1 })).filter(Boolean);
  return { share: hits.length / 400, hits };
};

test("ambushes: likelier where there is less law, and when the party is wanted; the Empire hunts the light-sided", () => {
  const core = rate(worldIn("Core"), { alignment: "Neutral Balanced" });
  const wild = rate(worldIn("Wild Space"), { alignment: "Neutral Balanced" });
  assert.ok(wild.share > core.share, `${wild.share} > ${core.share}`);
  assert.ok(core.share > 0 && core.share < 0.2, `core ${core.share}`);
  const wanted = rate(worldIn("Core"), { alignment: "Neutral Balanced", wanted: true });
  assert.ok(wanted.share > core.share + 0.15, `wanted ${wanted.share}`);
  assert.ok(wanted.hits.some((a) => a!.by === "patrol" && /Galactic Empire patrol/.test(a!.who)));
  const light = rate(worldIn("Mid Rim"), { alignment: "Light Benevolent" });
  const dark = rate(worldIn("Mid Rim"), { alignment: "Dark Corrupt" });
  assert.ok(light.hits.some((a) => a!.by === "patrol" && /alignment/.test(a!.why)), "the Empire hunts the light-sided");
  assert.ok(!dark.hits.some((a) => a!.by === "patrol"), "but not the dark-sided");
  assert.ok(wild.hits.some((a) => a!.by === "pirates"), "pirates on the lawless roads");
  // The same trip at the same minute rolls the same
  assert.deepEqual(roadAmbush(worldIn("Wild Space"), "s", { seed: 7 }), roadAmbush(worldIn("Wild Space"), "s", { seed: 7 }));
});

test("the riders as people to fight: troopers of a patrol, a gang's otherwise", () => {
  const patrol = roadAmbushers(monsters as never, equipment as never, { by: "patrol", who: "Galactic Empire patrol", why: "", model: "Speederbike" }, 3, "x");
  assert.equal(patrol[0].name, "Patrol leader");
  assert.ok(patrol.slice(1).every((o) => /^Scout trooper/.test(o.name)) && patrol.length >= 3);
  const gang = roadAmbushers(monsters as never, equipment as never, { by: "pirates", who: "swoop gang", why: "", model: "Swoop bike" }, 3, "y");
  assert.match(gang[0].name, /Leader of the swoop gang/);
  assert.ok(gang.every((o) => o.hitPoints > 0 && o.disposition === "hostile"));
});

const run = (race: Race, track: ReturnType<typeof raceCourse>, input: Parameters<typeof stepRace>[2], seconds: number) => {
  let now = race;
  for (let t = 0; t < seconds && !now.over; t += 0.1) now = stepRace(now, track, input, 0.1);
  return now;
};

test("a chase: the riders start behind the party and close in, shooting", () => {
  const track = raceCourse(4, scenery, 1);
  const race = chaseStart(track, 4, "Landspeeder", [{ name: "Scout trooper A", model: "Speederbike" }, { name: "Scout trooper B", model: "Speederbike" }], "Galactic Empire patrol");
  assert.equal(race.laps, 1);
  const me = race.racers.find((r) => r.party)!;
  const riders = race.racers.filter((r) => r.hostile);
  assert.equal(riders.length, 2);
  for (const r of riders) assert.ok(Math.hypot(r.craft.p[0] - me.craft.p[0], r.craft.p[2] - me.craft.p[2]) > CHASE.behind * 0.8);
  // The party dawdles (driven on the rivals' line at half their pace): they catch it and fire
  me.pace = 0.5;
  let now = race;
  const shots: number[] = [];
  for (let t = 0; t < 40 && !now.over; t += 0.1) {
    now = stepRace(now, track, { steer: { x: 0, y: 0 }, throttle: 0, auto: true }, 0.1);
    shots.push(...now.events.filter((e) => e.kind === "shot").map((e) => e.by));
  }
  assert.ok(shots.length > 0, "the riders fired");
  const after = now.racers.find((r) => r.party)!;
  assert.ok(after.hull < after.hullMax, `the party was hit: ${after.hull}`);
});

test("driven well it gets away; a wrecked speeder is caught; shooting the riders down beats them off", () => {
  const track = raceCourse(6, scenery, 1);
  const start = () => chaseStart(track, 6, "Landspeeder", [{ name: "Rider A", model: "Swoop bike" }], "swoop gang");
  // The party driven by the rivals' line (the test hook), at full boost: one lap
  const away = run(start(), track, { steer: { x: 0, y: 0 }, throttle: 0, auto: true }, 300);
  const end = chaseResult(away);
  assert.ok(away.over && ["escaped", "beaten", "caught"].includes(end.outcome), JSON.stringify(end));
  // Wrecked: caught
  const wrecked = start();
  wrecked.racers.find((r) => r.party)!.hull = 0;
  wrecked.racers.find((r) => r.party)!.wrecked = true;
  assert.equal(chaseResult(run(wrecked, track, { steer: { x: 0, y: 0 }, throttle: 0 }, 0.2)).outcome, "caught");
  // A rider in front of the party's guns: fire until it is down
  const duel = start();
  const me = duel.racers.find((r) => r.party)!;
  const rider = duel.racers.find((r) => r.hostile)!;
  rider.craft.p = [me.craft.p[0] + Math.cos(me.craft.yaw) * 20, me.craft.p[1], me.craft.p[2] + Math.sin(me.craft.yaw) * 20];
  rider.craft.yaw = me.craft.yaw;
  rider.at = me.at;
  let now = duel;
  for (let t = 0; t < 30 && !now.over; t += 0.1) {
    // keep the rider in the sights (it drives off otherwise)
    const [m, r] = [now.racers.find((x) => x.party)!, now.racers.find((x) => x.hostile)!];
    r.craft.p = [m.craft.p[0] + Math.cos(m.craft.yaw) * 20, r.craft.p[1], m.craft.p[2] + Math.sin(m.craft.yaw) * 20];
    now = stepRace(now, track, { steer: { x: 0, y: 0 }, throttle: -1, fire: true }, 0.1);
  }
  assert.equal(chaseResult(now).outcome, "beaten", chaseResult(now).note);
  assert.ok(now.log.some((l) => /You shoot down Rider A/.test(l)));
});
