// Betting on the pit (2026-10-27): bouts of near creatures, odds read from how often each wins, the house's cut, and a bout fought out
import test from "node:test";
import assert from "node:assert/strict";
import { createRandom } from "../../shared/logic/index";
import { boutsFor, chanceOf, fight, fighterOf, paysFor, settle, HOUSE_CUT, type Fighter } from "../../shared/logic/pitbets";
import { getWorldCatalog } from "../../server/sw5eData";

const catalog = await getWorldCatalog();
const mk = (name: string, hp: number, ac: number, bonus: number, dice: number, sides: number, plus = 0, attacks = 1): Fighter => ({ id: name, name, cr: "1", hp, ac, bonus, dice, sides, plus, attacks });

test("a stronger fighter wins more often, a fight always ends, and a bout can be replayed the same from its dice", () => {
  const strong = mk("Strong", 60, 15, 7, 2, 8, 4);
  const weak = mk("Weak", 25, 11, 3, 1, 6, 1);
  const p = chanceOf(strong, weak, createRandom(3), 300);
  assert.ok(p > 0.8, `strong wins ${p}`);
  assert.ok(chanceOf(weak, strong, createRandom(3), 300) < 0.2);
  const log: string[] = [];
  const a = fight(strong, weak, createRandom(9), log);
  const b = fight(strong, weak, createRandom(9));
  assert.equal(a, b);
  assert.ok(log.length > 1 && log.length <= 80);
  // evenly matched: near even
  const even = chanceOf(mk("A", 40, 13, 5, 1, 8, 3), mk("B", 40, 13, 5, 1, 8, 3), createRandom(5), 400);
  assert.ok(even > 0.38 && even < 0.62, `even ${even}`);
});

test("the odds pay by how unlikely a win is, with the house's cut: a long shot pays well, a favourite little, and betting both ways loses a little", () => {
  assert.ok(paysFor(0.2) > paysFor(0.5) && paysFor(0.5) > paysFor(0.8));
  assert.ok(paysFor(0.99) >= 1.05);
  const p = 0.35;
  const back = (p * paysFor(p) + (1 - p) * paysFor(1 - p)) / 2; // a credit on each side, per credit staked
  assert.ok(back < 1 && back > 1 - HOUSE_CUT - 0.05, `both ways returns ${back}`);
});

test("the day's bouts: three creatures of the rules a side, of near rating and rising weight, odds that sum with the cut, a bet settled both ways", () => {
  const rng = createRandom(21);
  const bouts = boutsFor(catalog.monsters, 3, rng);
  assert.equal(bouts.length, 3);
  for (const b of bouts) {
    assert.ok(b.a.id !== b.b.id);
    assert.ok(Math.abs(b.chance[0] + b.chance[1] - 1) < 1e-9);
    assert.ok(b.pays[0] >= 1.05 && b.pays[1] >= 1.05);
    assert.ok(b.chance[0] > b.chance[1] === b.pays[0] < b.pays[1] || Math.abs(b.chance[0] - 0.5) < 0.02);
  }
  // settling: a winning bet returns stake times what it pays, a losing one nothing
  const bout = bouts[0];
  let won = 0, lost = 0;
  for (let i = 0; i < 40; i++) {
    const s = settle(bout, 0, 100, createRandom(i + 1));
    assert.ok(s.log.length >= 3);
    if (s.winner === 0) { won++; assert.equal(s.back, Math.floor(100 * bout.pays[0])); } else { lost++; assert.equal(s.back, 0); }
  }
  assert.ok(won + lost === 40);
  assert.ok(fighterOf(catalog.monsters.find((m) => m.id === bout.a.id)!)!.name === bout.a.name);
});

// ---- The weekend card (2026-11-02): fights on days 6 and 7 of each week, five a day at regular hours, fixed by the arena and the day; tickets; talk
import { generateWorld, childrenOf, DAY } from "../../shared/logic/index";
import { BOUT_HOURS, BOUT_LENGTH, UPCOMING_CHANCE, cardFor, isBoutDay, matchState, nextBoutDay, pitArenasIn, pitGossip, pitNews, RESULT_CHANCE, ticketFor, ticketState, weekdayName, weekdayOf } from "../../shared/logic/pitbets";
import { getDataset } from "../../server/sw5eData";

const monsters = (await getDataset("monsters")) as any[];
const pitWorld = generateWorld({ seed: 3, partyLevel: 5 }, catalog);
const arena = pitArenasIn(pitWorld, Object.values(pitWorld.areas).find((a) => a.type === "arena")!.parentId!)[0];
const at = (day: number, hour = 12, minute = 0) => (day - 1) * DAY + hour * 60 + minute;

test("the pit fights on the sixth and seventh day of each week, and on no other", () => {
  for (const d of [6, 7, 13, 14, 20, 21, 27, 28]) assert.ok(isBoutDay(d), `day ${d}`);
  for (const d of [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 15, 19]) assert.ok(!isBoutDay(d), `day ${d}`);
  assert.equal(weekdayName(1), "Monday");
  assert.equal(weekdayName(5), "Friday");
  assert.equal(weekdayName(6), "Saturday");
  assert.equal(weekdayName(14), "Sunday");
  assert.equal(nextBoutDay(1), 6);
  assert.equal(nextBoutDay(7), 7);
  assert.equal(nextBoutDay(8), 13);
  for (let d = 1; d <= 5; d++) assert.equal(cardFor(arena, d, monsters).length, 0, `no card on day ${d}`);
});

test("a fight day has five bouts at regular hours, the same each time it is asked for, with fair odds and a result that follows the clock", () => {
  const card = cardFor(arena, 6, monsters);
  assert.deepEqual(card.map((m) => m.hour), BOUT_HOURS);
  assert.deepEqual(BOUT_HOURS.map((h, i) => h - (BOUT_HOURS[i - 1] ?? h - 2)), [2, 2, 2, 2, 2], "two hours apart");
  const again = cardFor(arena, 6, monsters);
  assert.deepEqual(card.map((m) => [m.id, m.a.name, m.b.name, m.winner, m.chance[0]]), again.map((m) => [m.id, m.a.name, m.b.name, m.winner, m.chance[0]]));
  for (const m of card) {
    assert.equal(m.start, at(6, m.hour));
    assert.ok(m.chance[0] >= 0.1 && m.chance[0] <= 0.9, `odds ${m.chance[0]}`);
    assert.ok(m.pays[0] >= 1.05 && m.pays[1] >= 1.05);
    assert.equal(matchState(m, m.start - 1), "open");
    assert.equal(matchState(m, m.start), "live");
    assert.equal(matchState(m, m.start + BOUT_LENGTH - 1), "live");
    assert.equal(matchState(m, m.start + BOUT_LENGTH), "done");
  }
  // the arena's own fighters take part on some fight day
  const own = new Set(arena.fighters);
  assert.ok([6, 7, 13, 14, 20, 21].some((d) => cardFor(arena, d, monsters).some((m) => own.has(m.a.name) || own.has(m.b.name))), "the arena's own fighters fight");
  // each day's card is its own
  assert.notDeepEqual(card.map((m) => m.a.name), cardFor(arena, 7, monsters).map((m) => m.a.name));
});

test("a ticket is paid once the bout is over: the stake times the odds it was bought at, if its side won", () => {
  const m = cardFor(arena, 6, monsters)[0];
  const win = ticketFor(m, m.winner, 100);
  const lose = ticketFor(m, (1 - m.winner) as 0 | 1, 100);
  assert.deepEqual(ticketState(win, m, m.start + 5), { state: "waiting", owed: 0 });
  assert.deepEqual(ticketState(win, m, m.start + BOUT_LENGTH), { state: "won", owed: Math.floor(100 * m.pays[m.winner]) });
  assert.deepEqual(ticketState(lose, m, m.start + BOUT_LENGTH), { state: "lost", owed: 0 });
});

test("people talk of the headline bouts: 3 in 10 the day of, 1 in 5 the day after, 1 in 10, 1 in 20, then no more; on the Friday before, of the weekend's", () => {
  // the last high-level bout of a weekend is on Sunday, day 7; ask on each day after it
  const rows = [7, 8, 9, 10, 11].map((d) => pitNews(arena, at(d, 22), monsters).filter((i) => i.kind === "result"));
  for (const [k, items] of rows.entries()) for (const i of items) {
    const since = 7 + k - i.day;
    assert.equal(i.chance, RESULT_CHANCE[since], `a bout ${since} days old`);
    assert.ok(since <= 3, "talk fades after three days");
  }
  assert.equal(pitNews(arena, at(11, 22), monsters).filter((i) => i.kind === "result" && i.day >= 6 && i.day <= 7).length, 0, "nothing of the weekend by Thursday");
  assert.ok(pitNews(arena, at(7, 22), monsters).some((i) => i.kind === "result"), "the headline bout is talked of that evening");
  // (nothing of a bout until it is over)
  assert.equal(pitNews(arena, at(6, 11), monsters).length, 0);
  // the Friday before: the weekend's headline bouts, a talk in eight each
  const friday = pitNews(arena, at(5, 12), monsters);
  assert.deepEqual(friday.map((i) => i.kind), ["upcoming", "upcoming"]);
  assert.ok(friday.every((i) => i.chance === UPCOMING_CHANCE && /Saturday|Sunday/.test(i.text) && /\d\d:00/.test(i.text)));
  assert.equal(pitNews(arena, at(4, 12), monsters).length, 0, "no talk of the coming bouts before the Friday");
  // not all talk is of the pit: over many talks, the day after a Sunday card, the share of the pit is the chance of its items (about a fifth to a third)
  const monday = pitNews(arena, at(8, 10), monsters);
  const share = Array.from({ length: 4000 }, (_, s) => (pitGossip(monday, s) ? 1 : 0)).reduce((a: number, b: number) => a + b, 0 as number) / 4000;
  const expect = Math.min(0.9, monday.reduce((a, i) => a + i.chance, 0));
  assert.ok(Math.abs(share - expect) < 0.04 && share < 0.4, `pit share ${share} against ${expect}`);
  assert.equal(pitGossip([], 5), undefined);
  assert.ok(weekdayOf(8) === 0);
});

test("the arena's staff stand at their posts: bookmakers at kiosks, each stallholder at a stall of their own, the pit boss at the sign-up desk", () => {
  const building = Object.values(pitWorld.areas).find((a) => a.type === "arena")!;
  const rooms = childrenOf(pitWorld, building.id);
  const near = (n: { x: number; y: number }, c: { x: number; y: number; w: number; h: number }) => n.x >= c.x - 1 && n.x <= c.x + c.w && n.y >= c.y - 1 && n.y <= c.y + c.h;
  const staffed = (roomRe: RegExp, role: string, counterRe: RegExp) => {
    const room = rooms.find((r) => roomRe.test(r.name))!;
    const counters = room.layout!.assets.filter((a) => a.kind === "furniture" && counterRe.test(a.name));
    const people = room.layout!.assets.filter((a) => a.kind === "npc" && room.occupants.find((o) => o.id === a.ref)?.role === role);
    assert.ok(people.length >= 1 && counters.length >= 1, `${role}s and ${counterRe} in ${room.name}`);
    for (const p of people) assert.ok(counters.some((c) => near(p, c)), `${role} ${p.name} at a counter`);
    return { people, counters };
  };
  staffed(/^betting hall$/i, "bookmaker", /betting kiosk/i);
  const { people, counters } = staffed(/^betting hall$/i, "stallholder", /refreshment stall/i);
  // (each stallholder has a stall that no other stallholder is at, where there are stalls enough)
  const options = people.map((p) => counters.map((c, i) => (near(p, c) ? i : -1)).filter((i) => i >= 0));
  const assign = (k: number, taken: number[]): boolean => k === options.length || options[k].some((i) => !taken.includes(i) && assign(k + 1, [...taken, i]));
  if (counters.length >= people.length) assert.ok(assign(0, []), "a stall each");
  staffed(/fighters' pens/i, "pit boss", /sign-up desk/i);
});
