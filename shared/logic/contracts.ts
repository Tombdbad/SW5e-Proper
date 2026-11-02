// ---------------------------------------------------------------------------------------------
// Contracts (2026-10-27; the user: the downtime activities are to be work for mission givers, played, not rolled: "Bounty hunting requires
// players to find a specific NPC ... a rough location ... highest AC/HP + additional enemies provides greatest rewards ... local area bounties
// provide minimal payment ... players need to increase their reputation with bounty mission givers to unlock the highest paying bounties";
// crime and espionage "work their way up from breaking into a shop/residence to taking out/avoiding guards at well defended locations";
// mercenary contracting "an on-foot group defence/attack of a hideout/building"). HOUSE RULES (the books give the d100 tables of
// downtime.json for these activities; this is the played version of them, and the tables stay in the test build's Downtime tab).
//
// A giver is someone of the place (`kindsOf`): the person at a bar or an officer's desk has bounties, a smuggler or an informant has jobs
// for those who do not mind the law. A giver offers up to three jobs, of the tier their reputation with the party has earned (`tierFor`: one
// job done for them opens the next tier, up to four tiers). Accepting one PUTS THE JOB IN THE WORLD (`accept`): the bounty's target, with
// their guards, in a room of a building as far away as the tier says; a cache in a shop's back room or a garrison's strongroom to be
// robbed or sliced; a gang in a hideout to be cleared. Done is read from the world (`progress`: the target is gone, the cache is empty,
// the hideout has no one left of the job), and the giver pays on the report (`payout`). Pure: the monsters and equipment of the rules
// data come in as parameters; nothing here reads a clock or a random of its own.
// ---------------------------------------------------------------------------------------------
import { artificerIn, childrenOf, crValue, formOf, statBlockOccupant, trailOf, createRandom, type Area, type LootCache, type Occupant, type World } from "./index";
import type { Sw5eMonster, Sw5eEquipment } from "../data";

export type ContractKind = "bounty" | "burglary" | "espionage" | "assault";
export type Tier = 0 | 1 | 2 | 3;
export const TIERS: Tier[] = [0, 1, 2, 3];
export const KIND_LABEL: Record<ContractKind, string> = { bounty: "Bounty", burglary: "Burglary", espionage: "Espionage", assault: "Mercenary work" };
export const TIER_NAME = ["Local", "Regional", "Far", "Notorious"] as const;
// What each tier pays (credits) by kind, and the share of the tier's reward that rides on what is brought back alive
// The rarest things are earned (2026-11-02; the user: "the most rare items should be available through mission rewards"). HOUSE RULE: a
// regional job pays a prototype item as well, a far one an advanced, a notorious one a legendary (shops sell premium, prototype at best)
export const REWARD_RARITY: (string | undefined)[] = [undefined, "Prototype", "Advanced", "Legendary"];
export const REWARD_TYPES = ["Weapon", "Armor", "Shield", "ItemModification", "CyberneticAugmentation", "Focus", "AdventuringGear"];
// The item a finished job pays: one of the rarity's weapons, armour, shields, modifications, augmentations, foci and gear, by the job's id
export function rewardItem(offer: Pick<Offer, "id" | "rewardRarity">, rows: { name: string; type: string; searchableRarity: string }[]): string | undefined {
  if (!offer.rewardRarity) return undefined;
  const pool = rows.filter((x) => x.searchableRarity === offer.rewardRarity && REWARD_TYPES.includes(x.type)).sort((a, b) => a.name.localeCompare(b.name));
  return pool.length ? pool[hashOf(`${offer.id}|reward`) % pool.length].name : undefined;
}
export const REWARD: Record<ContractKind, [number, number, number, number]> = { bounty: [200, 600, 1800, 5000], burglary: [150, 400, 1000, 2400], espionage: [180, 500, 1300, 3000], assault: [300, 800, 2000, 4500] };

// ---- The givers
const BAR = /^(bartender|barkeep|innkeeper|host)$/i;
const LAW = /^(officer|guard captain|constable|sergeant|dockmaster|commander)$/i;
const SHADY = /^(smuggler|informant|gambler|fence|pilot for hire|scoundrel)$/i;
// The jobs a person offers by what they are and where: a bounty from a bar's notice board, a constable or a hunter; a robbery or a job of
// information from someone who knows the underside; a mercenary job from an officer or a hired gun
export function kindsOf(o: Pick<Occupant, "role" | "disposition" | "name" | "captive" | "disabled">, buildingType = ""): ContractKind[] {
  if (o.disposition === "hostile" || o.captive || o.disabled) return [];
  const role = o.role ?? "";
  const out: ContractKind[] = [];
  if (/bounty hunter/i.test(role) || BAR.test(role) || LAW.test(role)) out.push("bounty");
  if (SHADY.test(role) || (BAR.test(role) && /cantina|gambling/.test(buildingType))) out.push("burglary");
  if (SHADY.test(role) || /^(officer|clerk|informant)$/i.test(role)) out.push("espionage");
  if (LAW.test(role) || /^(guard|officer)$/i.test(role) || /garrison|guardhouse|hideout/.test(buildingType)) out.push("assault");
  return [...new Set(out)];
}
// Who of them gives work (2026-11-02; the user: "too many NPCs offer side quests (espionage, theft, betting etc.) we need to reduce the
// number of NPCs that offer quests"). HOUSE RULE: of everyone in a settlement who could (`kindsOf`), only a few do: 4 in a city, 2 in a town,
// 1 anywhere else (the user's numbers). The same people every visit (a hash of the settlement and the person), one of each sort before a
// second of any (the bar, the law, the shady, a hunter), so a town's two are not both smugglers.
export const GIVERS_PER: Record<string, number> = { city: 4, town: 2 };
const SORTS: ((role: string) => boolean)[] = [(r) => BAR.test(r), (r) => LAW.test(r) || /^(guard|officer|clerk)$/i.test(r), (r) => SHADY.test(r) || /^informant$/i.test(r), (r) => /bounty hunter/i.test(r)];
const giverCache = new WeakMap<World, Map<string, Set<string>>>();
export function giversIn(world: World, settlementId: string): Set<string> {
  let bySettlement = giverCache.get(world);
  if (!bySettlement) giverCache.set(world, (bySettlement = new Map()));
  const known = bySettlement.get(settlementId);
  if (known) return known;
  const settlement = world.areas[settlementId];
  const cap = GIVERS_PER[String(settlement?.type ?? "")] ?? 1;
  const able: { o: Occupant; sort: number; key: number }[] = [];
  for (const building of settlement ? buildingsOf(world, settlementId) : []) {
    for (const room of childrenOf(world, building.id)) {
      for (const o of room.occupants ?? []) {
        if (o.contract || !kindsOf(o, building.type).length) continue;
        const sort = SORTS.findIndex((s) => s(o.role ?? ""));
        able.push({ o, sort: sort < 0 ? SORTS.length : sort, key: hashOf(`${settlementId}|${o.id}`) });
      }
    }
  }
  able.sort((a, b) => a.key - b.key);
  // (a city's master artificer, where it has one, is always one of them: their jobs are how the party wins the regard their best work needs)
  const artificer = artificerIn(world, settlementId);
  const picked: string[] = artificer ? [artificer] : [];
  // a round over the sorts, the first of each by the hash, then the next round
  for (let round = 0; picked.length < cap && able.some((x) => !picked.includes(x.o.id)); round++) {
    for (let sort = 0; sort <= SORTS.length && picked.length < cap; sort++) {
      const next = able.filter((x) => x.sort === sort && !picked.includes(x.o.id))[0];
      if (next) picked.push(next.o.id);
    }
  }
  const out = new Set(picked);
  bySettlement.set(settlementId, out);
  return out;
}
// Whether this person, where they are, gives work at all (one of the few of `giversIn`), and of what kinds
export function workFrom(world: World, o: Occupant, areaId: string): ContractKind[] {
  const kinds = kindsHere(world, o, areaId);
  const settlement = settlementOf(world, areaId);
  return kinds.length && settlement && giversIn(world, settlement.id).has(o.id) ? kinds : [];
}
// What work a person could give where they are: a master artificer wants a rival's secrets (espionage), the rest by `kindsOf`
function kindsHere(world: World, o: Occupant, areaId: string): ContractKind[] {
  const settlement = settlementOf(world, areaId);
  if (settlement && artificerIn(world, settlement.id) === o.id) return ["espionage"];
  return kindsOf(o, trailOf(world, areaId).find((a) => a.kind === "building")?.type ?? "");
}
// The tier a giver's trust allows after `done` jobs done for them (an assault or a robbery goes no higher than the third)
export const tierFor = (done: number): Tier => (done >= 6 ? 3 : done >= 3 ? 2 : done >= 1 ? 1 : 0);
export const tierNeeds = (tier: Tier) => [0, 1, 3, 6][tier];

export interface Offer {
  id: string;
  kind: ContractKind;
  tier: Tier;
  giver: string;
  giverName: string;
  // Where the job was taken (the settlement), for the distances
  at: string;
  title: string;
  brief: string;
  reward: number;
  // An enhanced item of this rarity paid on top (see `REWARD_RARITY`), from the second tier
  rewardRarity?: string;
}
export interface Contract extends Offer {
  status: "active" | "ready" | "done" | "failed";
  accepted: number;
  // Where the job is: the building and the room, and what is to be done there
  site: string;
  room: string;
  // What the world holds for it: the target and the people round them, the cache, the gang
  targetId?: string;
  guardIds: string[];
  cacheId?: string;
  // How much of the whereabouts the party has: 0 the star system, 1 the world, 2 the settlement, 3 the building and the room
  reveal: 0 | 1 | 2 | 3;
  // The Intimidation DC to make the target give up (a bounty), and whether they were taken alive
  surrender?: number;
  captured?: boolean;
}

// ---- The world's places
const settlementOf = (world: World, id: string) => trailOf(world, id).find((a) => a.kind === "settlement");
const planetOf = (world: World, id: string) => trailOf(world, id).find((a) => a.kind === "planet");
const systemOf = (world: World, id: string) => trailOf(world, id).find((a) => a.kind === "system");
const roomsOf = (world: World, building: string) => childrenOf(world, building).filter((r) => r.kind === "room" && r.layout && !formOf(r) && !r.layout.roof);
const buildingsOf = (world: World, settlement: string) => childrenOf(world, settlement).filter((b) => b.kind === "building");
// The settlements by how far they are (same one, same world, same system, another system), nearest first
function settlementsByDistance(world: World, from: string): { area: Area; tier: Tier }[] {
  const here = settlementOf(world, from);
  const planet = planetOf(world, from);
  const system = systemOf(world, from);
  const out: { area: Area; tier: Tier }[] = [];
  for (const a of Object.values(world.areas)) {
    if (a.kind !== "settlement" || a.id === here?.id || !buildingsOf(world, a.id).length) continue;
    const tier: Tier = planetOf(world, a.id)?.id === planet?.id ? 1 : systemOf(world, a.id)?.id === system?.id ? 2 : 3;
    out.push({ area: a, tier });
  }
  return out;
}
// Jumps between two systems along the hyperlanes (a breadth-first count; 9 where none join them)
export function jumpsBetween(world: World, a: string, b: string): number {
  if (!a || !b || a === b) return 0;
  const seen = new Map<string, number>([[a, 0]]);
  const queue = [a];
  while (queue.length) {
    const here = queue.shift()!;
    for (const p of world.paths) {
      if (p.kind !== "hyperlane") continue;
      const other = p.from === here ? p.to : p.to === here ? p.from : undefined;
      if (!other || seen.has(other)) continue;
      seen.set(other, seen.get(here)! + 1);
      if (other === b) return seen.get(other)!;
      queue.push(other);
    }
  }
  return 9;
}

// ---- The offers
const FIRST = ["Kes", "Dro", "Vara", "Tor", "Mai", "Jek", "Lyra", "Brann", "Sova", "Rix", "Nel", "Oro", "Zan", "Hesk", "Pell", "Ulo"];
const LAST = ["Varn", "Dorrin", "Kessel", "Tarn", "Voss", "Ketch", "Marek", "Orlan", "Sabe", "Thorne", "Quill", "Rask", "Yarro", "Bale", "Cade"];
const nameOf = (r: { pick: <T>(l: readonly T[]) => T }) => `${r.pick(FIRST)} ${r.pick(LAST)}`;
const ITEMS = ["a sealed case of spice", "a ledger of the cartel's accounts", "a prototype power cell", "the Moff's signet", "a crate of stolen blasters", "a datacron", "a tech lord's holo-recorder", "an antique vibroblade", "a bag of uncut crystals", "a droid memory core"];
const SHOPS = /^(pawnshop|armsmith|tech shop|outfitter|curio shop|general store|apothecary|market|workshop|droid dealer|scrap dealer)$/;
const KEPT = /^(garrison|guardhouse|command post|operations center|estates|manor house|palace|archive|medcenter|spaceport)$/;
const DENS = /^(hideout|warehouse|junkyard|tenements|scrap dealer|camp)$/;

export function makeOffers(world: World, giver: Occupant, giverArea: string, done: number, day: number): Offer[] {
  const kinds = kindsHere(world, giver, giverArea);
  const unlocked = tierFor(done);
  const r = createRandom(hashOf(`${giver.id}|${day}`));
  const offers: Offer[] = [];
  for (const kind of kinds) {
    // a job of the highest tier open and one below it; robberies and assaults stop at the third tier
    const top = Math.min(unlocked, kind === "bounty" ? 3 : 2) as Tier;
    const tiers: Tier[] = top === 0 ? [0] : [top, (top - 1) as Tier];
    for (const tier of tiers) {
      const id = `ct-${hashOf(`${giver.id}|${day}|${kind}|${tier}`).toString(36)}`;
      const target = nameOf(r);
      const base = REWARD[kind][tier];
      const reward = Math.round((base * (0.9 + r.next() * 0.3)) / 10) * 10;
      const t = TIER_NAME[tier].toLowerCase();
      const [title, brief] = kind === "bounty"
        ? [`${TIER_NAME[tier]} bounty: ${target}`, `${target}, ${["a petty thief with a price on them", "a smuggler who jumped bail", "a gang's enforcer", "a killer of some note", "a name every hunter knows"][tier]}. Take them in or put them down. ${["They are in this town.", "They are on this world, in a town you will have to find.", "They are on another world of this system.", "They are in another system altogether."][tier]}`]
        : kind === "burglary"
          ? [`${TIER_NAME[tier]} job: ${r.pick(ITEMS)}`, `${r.pick(ITEMS)} is kept in ${["a shop's back room", "a well-kept strongroom", "a guarded vault"][tier]} here. Get it out, quietly or not.`]
          : kind === "espionage"
            ? [`${TIER_NAME[tier]} job: ${["a ledger copied", "a strongroom's data core", "the officers' files"][tier]}`, `There is a data core in ${["a clerk's office", "the garrison's strongroom", "the governor's vault"][tier]}: slice it or break it open and bring the core back.`]
            : [`${TIER_NAME[tier]} contract: clear a den`, `${["A few thugs", "A gang", "A gang and their boss"][tier]} are holed up in ${["a warehouse", "a hideout", "a fortified hideout"][tier]} in town. Clear it out, every last one.`];
      offers.push({ id, kind, tier, giver: giver.id, giverName: giver.name, at: settlementOf(world, giverArea)?.id ?? giverArea, title: `${title} (${t})`.replace(/ \(local\)$| \(regional\)$| \(far\)$| \(notorious\)$/, ""), brief, reward, ...(REWARD_RARITY[tier] ? { rewardRarity: REWARD_RARITY[tier] } : {}) });
    }
  }
  return offers;
}
const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

// ---- Accepting a job: the world gets what the job needs
const cr = (tier: Tier, level: number) => Math.max(0.5, Math.min(14, level + [-2, 0, 2, 4][tier]));
function pool(monsters: Sw5eMonster[], target: number, humanoid = true) {
  const near = monsters.filter((m) => m.hitPoints > 0 && !/droid|swarm|construct|ooze|beast|plant/i.test((m.types ?? []).join(" ")) && (!humanoid || /humanoid/i.test((m.types ?? []).join(" "))) && Math.abs(crValue(m.challengeRating) - target) <= Math.max(1, target * 0.4));
  return near.length ? near : monsters.filter((m) => m.hitPoints > 0 && !/droid|swarm|beast/i.test((m.types ?? []).join(" "))).sort((a, b) => Math.abs(crValue(a.challengeRating) - target) - Math.abs(crValue(b.challengeRating) - target)).slice(0, 4);
}
const pickRoom = (rooms: Area[], r: { pick: <T>(l: readonly T[]) => T }) => {
  const quiet = rooms.filter((x) => /back|store|vault|cell|office|strongroom|cellar|hideout|quarters|private|storage|cache|loading|yard/i.test(x.name));
  return r.pick(quiet.length ? quiet : rooms);
};
export interface Placed { world: World; contract: Contract }
export function accept(world: World, offer: Offer, level: number, monsters: Sw5eMonster[], equipment: Sw5eEquipment[], now: number): Placed | { error: string } {
  const r = createRandom(hashOf(offer.id));
  const next: World = { ...world, areas: { ...world.areas } };
  const put = (room: Area, change: Partial<Area>) => { next.areas[room.id] = { ...next.areas[room.id], ...change } as Area; };
  const crt = cr(offer.tier, level);
  // where: a bounty as far as its tier says; the other jobs in the town they were taken in
  let site: Area | undefined;
  const mine = buildingsOf(world, offer.at);
  if (offer.kind === "bounty") {
    const wanted = offer.tier;
    const places = settlementsByDistance(world, offer.at).filter((p) => p.tier === wanted);
    const settlement = wanted === 0 ? offer.at : r.pick(places.length ? places : settlementsByDistance(world, offer.at).sort((a, b) => b.tier - a.tier).slice(0, 3).map((p) => p)).area?.id ?? offer.at;
    const buildings = buildingsOf(world, settlement).filter((b) => roomsOf(world, b.id).length && !/cave|spaceport|city gate|town gate|landing/.test(b.type));
    site = r.pick(buildings.length ? buildings : mine);
  } else {
    const want = offer.kind === "burglary" ? SHOPS : offer.kind === "espionage" ? KEPT : DENS;
    const buildings = mine.filter((b) => want.test(b.type) && roomsOf(world, b.id).length);
    site = r.pick(buildings.length ? buildings : mine.filter((b) => roomsOf(world, b.id).length));
  }
  if (!site) return { error: "There is nowhere in the world for this job." };
  const rooms = roomsOf(world, site.id);
  if (!rooms.length) return { error: "The place has no room for it." };
  const room = pickRoom(rooms, r);
  const guards: string[] = [];
  const addPeople = (where: Area, list: Occupant[]) => { put(where, { occupants: [...next.areas[where.id].occupants, ...list] }); list.forEach((o) => guards.push(o.id)); };
  const hostile = (m: Sw5eMonster, id: string, role: string, name: string): Occupant => ({ ...statBlockOccupant(m, equipment, id, 1, role, "hostile"), name, species: undefined, contract: offer.id });
  const contract: Contract = { ...offer, status: "active", accepted: now, site: site.id, room: room.id, guardIds: guards, reveal: (offer.kind === "bounty" ? [2, 2, 1, 0][offer.tier] : 3) as Contract["reveal"] };

  if (offer.kind === "bounty") {
    const star = r.pick(pool(monsters, crt));
    const target = hostile(star, `${offer.id}-t`, "bounty target", offer.title.replace(/^[^:]*: /, "").replace(/ \(.*$/, ""));
    // The higher the price, the tougher the target (a tier adds hit points and armour), and the more people with them
    const tough = [1, 1.25, 1.6, 2][offer.tier];
    target.hitPoints = Math.round((target.hitPoints ?? 10) * tough);
    target.armorClass = (target.armorClass ?? 12) + offer.tier;
    const company = [0, 1, 2, 4][offer.tier];
    const goons = Array.from({ length: company }, (_, i) => hostile(r.pick(pool(monsters, Math.max(0.5, crt - 2))), `${offer.id}-g${i}`, "henchman", `${["Henchman", "Guard"][i % 2]} ${String.fromCharCode(65 + i)}`));
    addPeople(room, [target, ...goons]);
    contract.targetId = target.id;
    // Easy to intimidate where they are small; a notorious one does not break
    contract.surrender = [10, 13, 16, 20][offer.tier];
  } else if (offer.kind === "burglary" || offer.kind === "espionage") {
    const item = offer.kind === "burglary" ? r.pick(ITEMS) : "an encrypted data core";
    const cache: LootCache = {
      id: `${offer.id}-c`,
      name: offer.kind === "burglary" ? `Strongbox: ${item}` : "Data core in its cradle",
      kind: "cache",
      credits: 0,
      items: [{ name: offer.kind === "burglary" ? "Datacron" : "Datacron", quantity: 1, source: "equipment" }],
      locked: [10, 13, 15, 18][offer.tier],
      hidden: offer.tier >= 1,
    };
    put(room, { loot: [...next.areas[room.id].loot, cache] });
    contract.cacheId = cache.id;
    // guards: none in a back room, one in a strongroom, two and a captain in a vault (the party may slip past them or fight)
    const guardCount = [0, 1, 2, 3][offer.tier] + (offer.kind === "espionage" ? 1 : 0);
    if (guardCount) addPeople(room, Array.from({ length: guardCount }, (_, i) => hostile(r.pick(pool(monsters, Math.max(0.5, crt - 1))), `${offer.id}-g${i}`, "guard", `Guard ${String.fromCharCode(65 + i)}`)));
  } else {
    // a den: a gang spread through the rooms, a boss in the biggest from the second tier
    const count = [3, 5, 7, 9][offer.tier];
    const spread = [...rooms].sort((a, b) => (b.layout!.width * b.layout!.height) - (a.layout!.width * a.layout!.height));
    for (let i = 0; i < count; i++) {
      const where = spread[i % Math.min(spread.length, 3)];
      const boss = i === 0 && offer.tier >= 1;
      addPeople(where, [hostile(r.pick(pool(monsters, boss ? crt : Math.max(0.5, crt - 2))), `${offer.id}-m${i}`, boss ? "gang boss" : "thug", boss ? "Boss" : `Thug ${String.fromCharCode(65 + i)}`)]);
    }
  }
  contract.guardIds = guards;
  return { world: next, contract };
}

// ---- What the world says of a job now
export function findOccupant(world: World, id: string): { area: Area; occupant: Occupant } | undefined {
  for (const a of Object.values(world.areas)) {
    const o = a.occupants.find((x) => x.id === id);
    if (o) return { area: a, occupant: o };
  }
  return undefined;
}
export function progress(world: World, c: Contract): { status: Contract["status"]; left: number; text: string } {
  if (c.status === "done" || c.status === "failed") return { status: c.status, left: 0, text: c.status === "done" ? "Done and paid." : "Failed." };
  const alive = (ids: string[]) => ids.filter((id) => findOccupant(world, id)).length;
  if (c.kind === "bounty") {
    const gone = !c.targetId || !findOccupant(world, c.targetId);
    return { status: gone ? "ready" : "active", left: gone ? 0 : 1, text: gone ? `${targetName(c)} is dealt with: report to ${c.giverName}.` : `${targetName(c)} is still at large.` };
  }
  if (c.kind === "assault") {
    const left = alive(c.guardIds);
    return { status: left ? "active" : "ready", left, text: left ? `${left} of the den still stand.` : `The den is cleared: report to ${c.giverName}.` };
  }
  const cache = c.cacheId ? Object.values(world.areas).flatMap((a) => a.loot).find((l) => l.id === c.cacheId) : undefined;
  const taken = !cache || !!cache.looted;
  return { status: taken ? "ready" : "active", left: taken ? 0 : 1, text: taken ? `You have what was wanted: report to ${c.giverName}.` : c.kind === "burglary" ? "The strongbox is still where it was." : "The data core is still in its cradle." };
}
const targetName = (c: Contract) => c.title.replace(/^[^:]*: /, "");

// Where the job is, as far as the party knows (`from` is where the party is now)
export function whereabouts(world: World, c: Contract, from: string): string {
  const site = world.areas[c.site];
  if (!site) return "somewhere";
  const settlement = settlementOf(world, c.site);
  const planet = planetOf(world, c.site);
  const system = systemOf(world, c.site);
  const mine = systemOf(world, from)?.id ?? "";
  if (c.reveal >= 3) return `${world.areas[c.room]?.name ?? "a room"} of ${site.name}, in ${settlement?.name ?? "town"}`;
  if (c.reveal === 2) return `somewhere in ${settlement?.name ?? "a settlement"}${settlement && settlement.id === settlementOf(world, from)?.id ? " (this town)" : ` on ${planet?.name ?? "that world"}`}`;
  if (c.reveal === 1) return `a settlement of ${planet?.name ?? "a world"}, in the ${system?.name ?? "system"}`;
  const jumps = jumpsBetween(world, mine, system?.id ?? "");
  return `the ${system?.name ?? "far"} system${system && system.id === mine ? " (this one)" : jumps ? `, about ${jumps} jump${jumps === 1 ? "" : "s"} away` : ""}`;
}
// Asking round: a good enough check tells one more of where, up to the building (a failure costs the hour); the DC rises with the tier
export const askDC = (c: Contract) => 10 + 2 * c.tier;
export function askAround(c: Contract, total: number): { contract: Contract; learned: boolean } {
  if (c.reveal >= 3 || total < askDC(c)) return { contract: c, learned: false };
  return { contract: { ...c, reveal: (c.reveal + 1) as Contract["reveal"] }, learned: true };
}

// What the giver pays on the report: the reward, more when the job brought the target back alive or kept the alarm down (the caller says), and the trust won
export const payout = (c: Contract, bonus = 0) => Math.round(c.reward * (1 + bonus));

// ---- The rest of the downtime (2026-10-27): the other activities are what particular people of a place do with the party, in the Trade tab (the
// Downtime tab itself is for test builds): the ids are those of the Downtime panel (`DOWNTIME_GROUPS` in Play). Bounty hunting, espionage,
// mercenary contracting and crime are the jobs above.
export const JOB_NAMES: Record<string, string> = {
  "pit-arena": "fighting in the pit", "pit-bets": "bets on the pit", gambling: "a game of chance", carousing: "a night out", racing: "a race", "speeder-race": "a speeder race", "taxi-run": "a taxi run", "delivery-run": "a delivery run",
  dogfight: "a dogfight", work: "honest work", research: "research", training: "training", crafting: "crafting", "buying-enhanced-items": "buying enhanced items", "selling-enhanced-items": "selling enhanced items",
};
export function jobsOf(o: Pick<Occupant, "role" | "disposition" | "captive" | "disabled">, buildingType = ""): string[] {
  if (o.disposition === "hostile" || o.captive || o.disabled) return [];
  const role = o.role ?? "";
  const out: string[] = [];
  // (the pit and its bets are the arena's, 2026-11-02: the pit boss at the sign-up desk takes fighters, a bookmaker at the kiosk takes bets)
  if (/pit boss|promoter/i.test(role)) out.push("pit-arena");
  if (/bookmaker/i.test(role)) out.push("pit-bets");
  if (BAR.test(role) || /croupier|gambler/i.test(role) || /gambling hall|cantina/.test(buildingType)) out.push("gambling", "carousing");
  if (/dockmaster|pilot for hire|mechanic|engineer|pilot/i.test(role) || /spaceport|hangar|shipyard|transit|landing/.test(buildingType)) out.push("racing", "speeder-race", "taxi-run", "delivery-run", "dogfight");
  if (/merchant|dealer|clerk|overseer|cook|mechanic|farmer|dockmaster|laborer|steward/i.test(role) || BAR.test(role)) out.push("work");
  if (/scholar|archivist|clerk|medic|officer|noble|chamberlain/i.test(role) || /archive|medcenter/.test(buildingType)) out.push("research");
  if (/officer|guard|trainer|instructor|mechanic|scholar|bounty hunter|medic/i.test(role)) out.push("training");
  if (/mechanic|engineer|merchant|smith|dealer/i.test(role) || /workshop|engineering/.test(buildingType)) out.push("crafting");
  if (/merchant|dealer|curator/i.test(role)) out.push("buying-enhanced-items", "selling-enhanced-items");
  return [...new Set(out)];
}
