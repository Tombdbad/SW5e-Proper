// ---------------------------------------------------------------------------------------------
// The trip (2026-10-27; the user: "speeder travel overhaul": point-to-point routes, biome shifts, chases and roadblocks, gunner and driver, scenery
// to hit). HOUSE RULES (the books give no road travel). A route the party flies itself between two settlements of a planet is driven as a run of
// LEGS, each a stretch of open road from one gate to the next, where the land changes: the planet's own kind of ground at both ends and, in
// between, whatever lies beside it (a forest world's road passes through a clearing's plain, a swamp, a jungle; a desert's through barren rock). The
// road's own length is the leg's (each about a kilometre and a half); the trip's legs are the route's kilometres by seven, two to five of them.
// What is met on the road is rolled once for the trip (seeded, so the same trip rolls the same): an ambush (`roadAmbush`: riders after the party
// on one of the later legs) and a roadblock (a checkpoint of the law where there is law, a gang's toll gate where there is none) on one leg that is
// not the last. At the roadblock the party stops (or rams it), and it pays, talks its way through or runs: running brings the roadblock's riders
// after it on the next leg. A crewmate (a companion) either drives while the party is at the gun, or the party drives and the crewmate fires.
// The trip's time is the ride's, quicker for a clean drive and slower for a wrecked one. Pure: the dice are `createRandom`'s.
// By water craft (`water`, 2026-10-30, shared/logic "Over the water"): every leg is open water of the planet's own kind, with no roadblock.
// ---------------------------------------------------------------------------------------------
import { createRandom, eraOf, lawAt, roadAmbush, type RoadAmbush, type World } from "./index";

export const TRIP = { perLeg: 7, min: 2, max: 5, share: 0.78 };
// What lies beside each kind of ground (a planet's regions): the middle legs of a trip wander among these
export const BIOME_LINKS: Record<string, string[]> = {
  temperate: ["forest", "swamp", "barren"],
  forest: ["temperate", "jungle", "swamp"],
  jungle: ["forest", "swamp"],
  swamp: ["jungle", "forest", "temperate"],
  desert: ["barren", "temperate"],
  barren: ["desert", "ice", "volcanic", "temperate"],
  ice: ["barren"],
  volcanic: ["barren"],
  urban: ["temperate", "barren"],
  ocean: ["temperate", "swamp"],
};
export const legCount = (km: number) => Math.max(TRIP.min, Math.min(TRIP.max, Math.round(km / TRIP.perLeg)));

// A roadblock: who holds it, what it asks (a fee at a checkpoint, a toll at a gang's gate), and how hard it is to talk past
export interface Block { by: "checkpoint" | "toll"; who: string; fee: number; dc: number; wanted: boolean; model: string }
export interface Leg {
  biome: string;
  // The road's seed and what is on it
  seed: number;
  // `ambush`: riders come after the party on it
  ambush?: RoadAmbush;
  block?: Block;
}

// The legs of a trip: ground by leg (the planet's own at both ends), the ambush on one of the later legs and a roadblock on one before the last
export function planTrip(world: World, toId: string, o: { km: number; biome: string; level: number; alignment?: string; wanted?: boolean; seed: number; always?: "ambush" | "block" | "both"; water?: boolean }): Leg[] {
  const r = createRandom(o.seed);
  const n = legCount(o.km);
  const home = BIOME_LINKS[o.biome] ? o.biome : "temperate";
  const biomes: string[] = [];
  // (both ends are the planet's own ground, and the leg before the last is one that joins it: a trip of two legs only has the first)
  const joins = (b: string) => b === home || BIOME_LINKS[home].includes(b);
  for (let i = 0; i < n; i++) {
    const last = biomes[i - 1] ?? home;
    if (i === 0 || (i === n - 1 && n > 2) || o.water) biomes.push(home);
    else {
      const next = r.next() < 0.7 ? BIOME_LINKS[last].filter((b) => b !== last) : [last];
      const fit = i === n - 2 && n > 2 ? next.filter(joins) : next;
      const way = fit.length ? fit : i === n - 2 && n > 2 ? BIOME_LINKS[last].filter(joins) : [];
      biomes.push(way.length ? r.pick(way) : home);
    }
  }
  const legs: Leg[] = biomes.map((biome, i) => ({ biome, seed: Math.floor(r.next() * 1e9) + 1 + i }));
  const ambush = roadAmbush(world, toId, { alignment: o.alignment, wanted: o.wanted, seed: o.seed ^ 0x5bd1e995, always: o.always === "ambush" || o.always === "both" });
  const law = lawAt(world, toId);
  const blockChance = Math.min(0.6, (law >= 2 ? 0.12 + 0.1 * (law - 2) : 0.08 + 0.05 * (2 - law)) + (o.wanted ? 0.3 : 0));
  const block = !o.water && (o.always === "block" || o.always === "both" || r.next() < blockChance);
  const blockLeg = block ? Math.floor(r.next() * (n - 1)) : -1;
  if (blockLeg >= 0) {
    const authority = law >= 2 || (law === 1 && r.next() < 0.5);
    legs[blockLeg].block = authority
      ? { by: "checkpoint", who: `${eraOf(world).authority} checkpoint`, fee: 10 + 15 * law, dc: 11 + 2 * law + (o.wanted ? 4 : 0), wanted: !!o.wanted, model: "Speederbike" }
      : { by: "toll", who: "a gang's toll gate", fee: 40 + 10 * o.level, dc: 12 + Math.floor(o.level / 2), wanted: false, model: "Swoop bike" };
  }
  if (ambush && n > 1) {
    // One of the later legs, and not the one where the party would meet the roadblock's riders as well
    const choices = Array.from({ length: n - 1 }, (_, i) => i + 1).filter((i) => i !== blockLeg + 1 || n === 2);
    const at = choices.length ? r.pick(choices) : n - 1;
    legs[at].ambush = ambush;
  } else if (ambush) legs[0].ambush = ambush;
  return legs;
}

// What the party does at a roadblock: pay, talk (a check against `dc`), or run it. A checkpoint that knows the party (wanted) takes no fee.
export type StopChoice = "pay" | "talk" | "run";
export interface Stop { outcome: "open" | "refused" | "run"; paid: number; note: string }
export function settleStop(block: Block, choice: StopChoice, o: { roll: number; bonus: number; credits: number; raised?: boolean }): Stop {
  const fee = o.raised ? Math.ceil(block.fee * 1.5) : block.fee;
  if (choice === "run") return { outcome: "run", paid: 0, note: `You gun it at the barrier; ${block.who} sounds the alarm.` };
  if (choice === "pay") {
    if (block.wanted && block.by === "checkpoint") return { outcome: "refused", paid: 0, note: "They know your face: money will not do it." };
    if (o.credits < fee) return { outcome: "refused", paid: 0, note: `${fee} credits are asked and you have ${o.credits}.` };
    return { outcome: "open", paid: fee, note: `${fee} credits paid; the barrier is opened.` };
  }
  const total = o.roll + o.bonus;
  if (total >= block.dc) return { outcome: "open", paid: 0, note: `${total} against DC ${block.dc}: you talk your way through.` };
  return { outcome: "refused", paid: 0, note: `${total} against DC ${block.dc}: they are not persuaded${o.raised ? "" : " (the fee goes up by half)"}.` };
}

// The trip's time: the ride's minutes, a fifth less for a clean quick drive, up to half as much again for a slow or wrecked one. `took` is the
// seconds a leg took against its par; a leg not finished counts at one and a half times its par.
export interface LegTime { par: number; took: number | null }
export function driveMinutes(base: number, legs: LegTime[]): number {
  const par = legs.reduce((s, l) => s + l.par, 0);
  if (!par) return Math.max(1, Math.round(base));
  const took = legs.reduce((s, l) => s + (l.took ?? l.par * 1.5), 0);
  return Math.max(1, Math.round(base * Math.max(0.8, Math.min(1.5, took / par))));
}
// A leg's par: the road's length at two thirds of the speeder's plain speed
export const legPar = (metres: number, speed = 38) => metres / (speed * 0.66);
// The party's crewmate: the first of the companions who can stand and are not a beast (a droid drives well), and how fast they drive
export function crewmate(companions: { name: string; kind?: string; hp?: number }[]): { name: string; pace: number } | undefined {
  const mate = companions.find((c) => c.kind !== "beast" && (c.hp ?? 1) > 0);
  return mate ? { name: mate.name, pace: mate.kind === "droid" ? 0.97 : 0.92 } : undefined;
}
// The riders who go after a party that ran a roadblock, as an ambush the road's chase and fight already know (a checkpoint's patrol, a gang's riders)
export function blockPursuit(world: World, block: Block): RoadAmbush {
  return block.by === "checkpoint"
    ? { by: "patrol", who: `${eraOf(world).authority} patrol`, model: block.model, why: "you ran their roadblock" }
    : { by: "pirates", who: "swoop gang", model: block.model, why: "you ran their toll gate" };
}

// What the road runs into, said at the start of a leg (the countdown's lines): each kind of ground as it is met
const MET: Record<string, string> = {
  temperate: "The land opens into fields and low hills.",
  forest: "The road runs in under tall trees.",
  jungle: "The jungle crowds the road, thick with ferns and palms.",
  swamp: "The ground goes soft and wet; dead trees stand in the reeds.",
  desert: "The green gives out to sand and scrub.",
  barren: "The soil thins to bare rock and dry grass.",
  ice: "Snow lies over the road and the pines are rimed white.",
  volcanic: "The ground goes black and the air smells of sulphur.",
  urban: "Farmland and wayside gardens line the road.",
  ocean: "Palms and a salt wind: the coast is near.",
};
export const metText = (from: string | undefined, to: string) => (!from || from === to ? `The road runs on through the ${to} country.` : MET[to] ?? `The ground changes to ${to}.`);
