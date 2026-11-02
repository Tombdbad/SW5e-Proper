// People (shared/logic/relations.ts and "People" in shared/logic/index.ts): a gender that picks the given name, families that share one species,
// a tie between relatives that carries the party's reputation to them at a reduced rate, and a character sheet that opens as regard grows
import test from "node:test";
import assert from "node:assert/strict";
import { ATTITUDES, GIVEN_NAMES, KIN_TIE, emptyStanding, type Occupant, type World } from "../../shared/logic";
import { CAPS, bump, genderOf, kinOf, kinWord, pronounsOf, regardLevel, reputation, sheetFor, tieOf } from "../../shared/logic/relations";

const person = (id: string, name: string, extra: Partial<Occupant> = {}): Occupant => ({ id, name, role: "resident", disposition: "neutral", count: 1, species: "Human", loadout: [], ...extra });
// Anna's family of one species: Dax is Kira's child, Mara is Dax's spouse, Jace is Kira's cousin
const world = {
  families: {
    Vos: { name: "Vos", species: "Human", members: [{ id: "o1", given: "Kira" }, { id: "o2", given: "Dax", to: "o1", kin: "child" }, { id: "o3", given: "Mara", to: "o2", kin: "spouse" }, { id: "o4", given: "Jace", to: "o1", kin: "cousin" }] },
  },
  areas: {},
} as unknown as World;

test("a person's gender is read from their name when the world did not record one, and droids are neither", () => {
  assert.equal(genderOf(person("o9", "Kira Vos")), "female");
  assert.equal(genderOf(person("o9", "Dax Vos")), "male");
  assert.equal(genderOf(person("o9", "Dax Vos", { gender: "female" })), "female", "what was recorded wins");
  assert.equal(genderOf(person("o9", "C-3PO", { role: "protocol droid" })), "other");
  assert.ok(["male", "female"].includes(genderOf(person("o9", "Zed Nobody"))));
  assert.equal(pronounsOf("other").subject, "they");
  assert.ok(GIVEN_NAMES.male.every((n) => !GIVEN_NAMES.female.includes(n)), "no name is on both lists");
});

test("kin: the tie is the strongest chain of links, and a person is told what each relative is to them", () => {
  assert.equal(tieOf(world, "o1", "o2"), KIN_TIE.child);
  assert.ok(Math.abs(tieOf(world, "o1", "o3") - KIN_TIE.child * KIN_TIE.spouse) < 1e-9, "a daughter-in-law is two links");
  assert.equal(tieOf(world, "o1", "o4"), KIN_TIE.cousin);
  assert.equal(tieOf(world, "o1", "zz"), 0);
  assert.ok(tieOf(world, "o1", "o2") === tieOf(world, "o2", "o1"), "a tie goes both ways");
  const mine = kinOf(world, "o2");
  assert.equal(mine[0].id, "o1", "nearest first");
  assert.equal(mine.find((k) => k.id === "o1")!.kin, "parent", "Kira is Dax's parent");
  assert.equal(mine.find((k) => k.id === "o3")!.kin, "spouse");
  assert.equal(kinWord("parent", "female"), "mother");
  assert.equal(kinWord("spouse", "male"), "husband");
});

test("regard: talk makes a person warm at most, a rise stops at its cap, and what the party does to one reaches their kin by the strength of the tie", () => {
  let s = emptyStanding();
  for (let i = 0; i < 100; i++) s = bump(s, "o1", 1, CAPS.talk);
  assert.equal(s.regard!.o1, CAPS.talk);
  assert.equal(regardLevel(s.regard!.o1), 1, "warm");
  assert.equal(bump(s, "o1", 5, CAPS.talk), s, "no change past the cap");
  s = bump(s, "o1", 30, CAPS.deed);
  assert.equal(s.regard!.o1, 55);
  // the party hurts Dax: his parent hears 70%, his wife 60%, Kira's cousin 0.35 x 0.7 of it
  const hit = reputation(world, emptyStanding(), "o2", -50);
  assert.equal(hit.standing.regard!.o2, -50);
  assert.equal(hit.standing.regard!.o1, Math.round(-50 * KIN_TIE.child));
  assert.equal(hit.standing.regard!.o3, Math.round(-50 * KIN_TIE.spouse));
  assert.equal(hit.standing.regard!.o4, Math.round(-50 * KIN_TIE.cousin * KIN_TIE.child));
  assert.ok(hit.heard.length === 3 && hit.heard.every((h) => h.delta < 0));
  // a small thing is not heard by the cousin (under one point)
  assert.equal(reputation(world, emptyStanding(), "o2", 1).standing.regard?.o4, undefined);
  // a kind deed passes on only up to its cap
  const kind = reputation(world, emptyStanding(), "o2", 30, CAPS.trade);
  assert.equal(kind.standing.regard!.o1, Math.round(30 * KIN_TIE.child));
  assert.ok(ATTITUDES[regardLevel(-85) + 4] === "hostile" && ATTITUDES[regardLevel(85) + 4] === "devoted");
});

test("the character sheet opens a tier for each level of friendliness, and says what the next level shows", () => {
  const o = person("o2", "Dax Vos", { family: "Vos", hitPoints: 22, armorClass: 14, speed: 30, size: "Medium", creature: "humanoid", loadout: ["Vibroblade"], attack: { name: "Vibroblade", bonus: 4, damage: "1d6 + 2", damageType: "kinetic" }, saves: { dexterity: 3 }, cr: "1/2", xp: 100 });
  const at = (regard: number) => sheetFor(world, o, regard);
  const stranger = at(0);
  assert.equal(stranger.level, 0);
  assert.deepEqual(stranger.open.map((l) => l.label), ["Species", "Gender", "Role"]);
  assert.ok(stranger.closed.some((l) => l.label === "Hit points") && stranger.next?.regard === 20);
  const warm = at(25);
  assert.ok(warm.open.some((l) => l.label === "Family" && /Kira Vos/.test(l.value)) && warm.open.some((l) => l.label === "Carries"));
  assert.ok(!warm.open.some((l) => l.label === "Hit points"));
  assert.ok(at(45).open.some((l) => l.label === "Hit points" && l.value === "22"));
  assert.ok(at(65).open.some((l) => l.label === "Attack") && at(65).open.some((l) => l.label === "Saves"));
  assert.equal(at(95).next, undefined);
  assert.equal(at(-70).level, 0, "an enemy shows nothing more");
  assert.equal(at(-85).attitude, "hostile");
});

test("a generated world: every person has a gender their given name suits, and one family name is one family of one species", async () => {
  const { generateWorld } = await import("../../shared/logic");
  const { getWorldCatalog } = await import("../../server/sw5eData");
  const world = generateWorld({ seed: 11, partyLevel: 5, detail: "all" as const }, await getWorldCatalog());
  const people = Object.values(world.areas).flatMap((a) => a.occupants).filter((o) => o.family);
  assert.ok(people.length > 40, `${people.length} named people`);
  const bySurname = new Map<string, Set<string>>();
  for (const o of people) {
    const surname = o.name.split(" ").slice(1).join(" ");
    assert.equal(surname, o.family, `${o.name} bears their family's name`);
    assert.ok(o.gender, o.name);
    assert.ok((GIVEN_NAMES as Record<string, string[]>)[o.gender!].includes(o.name.split(" ")[0]), `${o.name} is ${o.gender}`);
    bySurname.set(surname, (bySurname.get(surname) ?? new Set()).add(o.species ?? ""));
  }
  assert.ok([...bySurname.values()].every((species) => species.size === 1), "a family name is never shared by two species");
  const fams = Object.values(world.families ?? {});
  assert.ok(fams.some((f) => f.members.length > 1), "some people are related");
  for (const f of fams) for (const m of f.members.slice(1)) assert.ok(m.to && m.kin && f.members.some((x) => x.id === m.to), "each member is tied to one before");
  // two relatives are tied; strangers are not
  const kin = fams.find((f) => f.members.length > 1)!;
  assert.ok(tieOf(world, kin.members[1].id, kin.members[0].id) > 0.1);
  const other = fams.find((f) => f.name !== kin.name)!;
  assert.equal(tieOf(world, kin.members[0].id, other.members[0].id), 0);
});

test("nemeses are named as people of a family: the family name is one species, and a killed nemesis's kin among the nemeses take the grudge on by the tie", async () => {
  const { createRandom, personIn } = await import("../../shared/logic");
  const { emptyNemeses, resolveMercy, settleFight } = await import("../../shared/logic/nemesis");
  const families: Record<string, any> = { Kryze: { name: "Kryze", species: "Human", members: [{ id: "o1", given: "Kira" }] } };
  const body = (id: string): Occupant => ({ id, name: "Bounty Hunter", role: "bounty hunter", disposition: "hostile", count: 1, species: "Human", hitPoints: 30, armorClass: 14, xp: 100, loadout: [] });
  const r = createRandom(5);
  const fight = (state: ReturnType<typeof emptyNemeses>, id: string) => settleFight(state, { outcome: "victory", now: 1000, foes: [{ id, name: id, body: body(id), hp: 0, maxHp: 30, fled: true, leader: true, struck: { kinetic: 20 } }], person: (species, rid) => personIn(families, r, species, rid) });
  let s = fight(emptyNemeses(3), "f1").state;
  s = fight(s, "f2").state;
  const [a, b] = Object.values(s.records);
  assert.ok(a.family && a.gender && b.family, "each has a gender and a family");
  assert.ok(Object.values(families).every((f) => f.species === "Human"));
  assert.ok(families[a.family!].members.some((m: any) => m.id === a.id));
  // make them kin: b is a's sibling
  families[a.family!].members.push({ id: b.id, given: "Kin", to: a.id, kin: "sibling" });
  b.family = a.family;
  a.status = "at-mercy";
  s.mercy.push(a.id);
  const world = { families } as unknown as World;
  const before = b.hate;
  const out = resolveMercy(s, a.id, "execute", 2000, (id) => kinOf(world, id).map((k) => ({ id: k.id, tie: k.tie })));
  if (out.state.records[a.id].status === "dead") {
    assert.ok(out.state.records[b.id].hate > before, "the sibling hates the party more");
    assert.ok(out.events.some((e) => /will not forget/.test(e.text)));
  } else assert.equal(out.state.records[b.id].hate, before, "a nemesis who cheated death: nothing to avenge");
});

test("small talk (house rule): two to four lines turn about, of the place (the arena's crowd talks of the bouts), the same for the same seed", async () => {
  const { smallTalk, talkPlace } = await import("../../shared/logic/relations");
  assert.equal(talkPlace("arena", "Arena floor", ["spectator"]), "arena");
  assert.equal(talkPlace("cantina", "Main bar", ["patron", "patron"]), "cantina");
  assert.equal(talkPlace("garrison", "Barracks", ["guard", "guard"]), "guard");
  assert.equal(talkPlace("general store", "Sales floor", ["shopper"]), "market");
  assert.equal(talkPlace("residences", "Apartments", ["resident"]), "any");
  for (let seed = 1; seed < 60; seed++) {
    const lines = smallTalk("arena", seed);
    assert.ok(lines.length >= 2 && lines.length <= 4);
    lines.forEach((l, i) => assert.equal(l.who, i % 2));
    assert.ok(lines.every((l) => l.text.length > 0));
    assert.deepEqual(smallTalk("arena", seed), lines);
  }
  assert.notDeepEqual(smallTalk("cantina", 3), smallTalk("arena", 3));
});

test("the scene for the model that makes two people's talk (2026-11-02): where they are, the hour, and what people there talk of", async () => {
  const { chatScene } = await import("../../shared/logic/relations");
  assert.equal(chatScene("arena", ["Arena floor", "Theed Arena", "Theed", "Naboo"], 14 * 60), "Arena floor, Theed Arena, Theed, Naboo, afternoon. Two locals talk of the bouts, the fighters and the bets.");
  assert.match(chatScene("street", ["Market District", "", "Theed"], 24 * 60 + 8 * 60), /^Market District, Theed, morning\. .*the day's news/);
  assert.match(chatScene("nowhere", ["X"], 22 * 60), /night\. Two locals talk of the day's news and their work\.$/);
});
