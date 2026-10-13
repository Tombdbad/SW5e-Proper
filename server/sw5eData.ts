// Rules data on the server: the datasets in shared/data/sw5e, loaded on demand and kept in memory,
// and the catalog the world generator in shared/logic works from.
import { loadDataset, datasetNames, sw5eManifest, type DatasetName } from "../shared/data";
import type { WorldCatalog, SettingSeed } from "../shared/logic";
// The known systems and planets of the setting. These two files are plain data and are also what
// the client's galaxy map draws.
import { starSystems } from "../client/src/lib/sw5e/starSystems";
import { starSystems as systemLore, planets as planetLore } from "../client/src/lib/sw5e/locations";

export { sw5eManifest, datasetNames };

const cache = new Map<DatasetName, Promise<any>>();

export const isDataset = (name: string): name is DatasetName => (datasetNames as string[]).includes(name);

export function getDataset<T = any>(name: DatasetName): Promise<T> {
  if (!cache.has(name)) cache.set(name, loadDataset(name));
  return cache.get(name)!;
}

const bare = (name: string) => name.replace(/\s+System$/i, "").replace(/\s*\(.*\)$/, "").trim();

// One list of known systems and planets from the two setting files
export function settingSeed(): SettingSeed {
  // The two files name systems differently ("Tatoo System" and "Tatooine"), so match on planets too
  const sameSystem = (s: (typeof starSystems)[number], l: (typeof systemLore)[number]) =>
    bare(l.name).toLowerCase() === bare(s.name).toLowerCase() || l.notablePlanets.some((p) => (s.planets ?? []).includes(p));
  const systems: SettingSeed["systems"] = starSystems.map((s) => {
    const lore = systemLore.find((l) => sameSystem(s, l));
    return {
      name: s.name,
      region: s.region,
      planets: s.planets,
      description: s.description,
      factions: lore?.controllingFactions,
      settlements: lore?.noteworthySettlements.map(bare),
    };
  });
  for (const lore of systemLore) {
    if (starSystems.some((s) => sameSystem(s, lore))) continue;
    systems.push({
      name: `${lore.name} System`,
      region: lore.galacticRegion,
      planets: lore.notablePlanets,
      description: lore.relevance,
      factions: lore.controllingFactions,
      settlements: lore.noteworthySettlements.map(bare),
    });
  }
  const planets: SettingSeed["planets"] = planetLore.map((p) => ({
    name: p.name,
    climate: p.climate,
    terrain: p.terrain,
    description: p.description,
    species: p.majorSpecies,
    locations: [
      ...(systems.find((s) => (s.planets ?? []).includes(p.name))?.settlements ?? []),
      ...p.importantLocations.map(bare),
    ].filter((name, i, all) => name && !/entire planet/i.test(name) && all.indexOf(name) === i),
  }));
  return { systems, planets };
}

let catalog: Promise<WorldCatalog> | undefined;

export function getWorldCatalog(): Promise<WorldCatalog> {
  catalog ??= Promise.all([
    getDataset("monsters"),
    getDataset("equipment"),
    getDataset("enhancedItems"),
    getDataset("species"),
    getDataset("starshipEquipment"),
    getDataset("travel"),
    getDataset("lookups"),
  ]).then(([monsters, equipment, enhancedItems, species, starshipEquipment, travel, lookups]) => ({
    monsters,
    equipment,
    enhancedItems,
    species,
    starshipEquipment,
    travel,
    wealthByLevel: lookups.wealthByLevel,
    setting: settingSeed(),
  }));
  return catalog;
}
