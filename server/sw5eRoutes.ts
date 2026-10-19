// Rules data and world generation over HTTP.
//   GET  /api/sw5e                     what was imported, and the dataset names
//   GET  /api/sw5e/:dataset            one dataset; ?search= filters by name, ?fields=a,b trims rows, ?limit=
//   POST /api/world/generate           { options } -> a new world, and quests read off it
//   POST /api/world/expand             { world, areaId, seed? } -> the world with that area built out
//   POST /api/world/populate           { world, areaId, seed? } -> the world with that area's contents re-rolled
//   POST /api/world/liven              { world } -> an older world with its people brought to life (livenWorld)
//   POST /api/world/validate           { world } -> what is wrong with it, checked against the rules data
//   POST /api/world/occupant           { statBlock } -> that stat block as someone to place in an area
import type { Express, Request, Response } from "express";
import { generateWorld, expandArea, populateArea, livenWorld, statBlockOccupant, makeGang, validateWorld, worldQuests, itemFactsOf, type ItemFacts, type World } from "../shared/logic";
import { datasetNames, getDataset, getWorldCatalog, isDataset, sw5eManifest } from "./sw5eData";

const isWorld = (value: any): value is World =>
  !!value && typeof value === "object" && typeof value.areas === "object" && Array.isArray(value.paths) && typeof value.counter === "number";

export function registerSw5eRoutes(app: Express) {
  app.get("/api/sw5e", (_req: Request, res: Response) => {
    res.json({ ...sw5eManifest, names: datasetNames });
  });

  // What carried enhanced items do in play (itemFactsOf), by lower-case name; read once
  let itemFacts: Promise<Record<string, ItemFacts>> | undefined;
  app.get("/api/sw5e/itemFacts", async (_req: Request, res: Response) => {
    try {
      itemFacts ??= getDataset("enhancedItems").then((rows: any[]) => {
        const out: Record<string, ItemFacts> = {};
        for (const row of rows) {
          const facts = itemFactsOf(row);
          if (facts) out[row.name.toLowerCase()] = facts;
        }
        return out;
      });
      res.json(await itemFacts);
    } catch (error) {
      console.error("Error reading item facts:", error);
      res.status(500).json({ message: "Failed to read item facts" });
    }
  });

  app.get("/api/sw5e/:dataset", async (req: Request, res: Response) => {
    const name = req.params.dataset;
    if (!isDataset(name)) return res.status(404).json({ message: `No dataset named ${name}` });
    try {
      let rows: any = await getDataset(name);
      if (Array.isArray(rows)) {
        const search = String(req.query.search ?? "").toLowerCase();
        if (search) rows = rows.filter((row: any) => String(row.name ?? row.chapterName ?? "").toLowerCase().includes(search));
        const limit = Number(req.query.limit);
        if (limit > 0) rows = rows.slice(0, limit);
        const fields = String(req.query.fields ?? "").split(",").filter(Boolean);
        if (fields.length) rows = rows.map((row: any) => Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, row[f]])));
      }
      res.json(rows);
    } catch (error) {
      console.error("Error reading dataset:", error);
      res.status(500).json({ message: "Failed to read dataset" });
    }
  });

  app.post("/api/world/generate", async (req: Request, res: Response) => {
    try {
      const catalog = await getWorldCatalog();
      const world = generateWorld(req.body?.options ?? {}, catalog);
      // Quest rewards are shares of what the party should earn over its current level
      const wealth = catalog.wealthByLevel;
      const level = Math.min(wealth.length - 1, Math.max(1, world.partyLevel));
      const earnings = ((wealth[level] ?? 0) - (wealth[level - 1] ?? 0)) * world.partySize;
      res.json({ world, quests: worldQuests(world, earnings), problems: validateWorld(world, catalog) });
    } catch (error) {
      console.error("Error generating world:", error);
      res.status(500).json({ message: "Failed to generate world" });
    }
  });

  const rework = (change: typeof expandArea) => async (req: Request, res: Response) => {
    const { world, areaId, seed } = req.body ?? {};
    if (!isWorld(world) || !world.areas[areaId]) return res.status(400).json({ message: "A world and one of its area ids are required" });
    try {
      const catalog = await getWorldCatalog();
      const next = change(world, areaId, catalog, typeof seed === "number" ? seed : undefined);
      res.json({ world: next, problems: validateWorld(next, catalog) });
    } catch (error) {
      console.error("Error changing world:", error);
      res.status(500).json({ message: "Failed to change world" });
    }
  };
  app.post("/api/world/expand", rework(expandArea));
  app.post("/api/world/populate", rework(populateArea));

  app.post("/api/world/liven", async (req: Request, res: Response) => {
    const world = req.body?.world;
    if (!isWorld(world)) return res.status(400).json({ message: "A world is required" });
    try {
      res.json({ world: livenWorld(world, await getWorldCatalog()) });
    } catch (error) {
      console.error("Error livening world:", error);
      res.status(500).json({ message: "Failed to change world" });
    }
  });

  app.post("/api/world/occupant", async (req: Request, res: Response) => {
    const catalog = await getWorldCatalog();
    const monster = catalog.monsters.find((m) => m.id === req.body?.statBlock);
    if (!monster) return res.status(404).json({ message: "No such stat block" });
    res.json(statBlockOccupant(monster, catalog.equipment, `o-${Date.now().toString(36)}`));
  });

  // The gang that waits in a lawless alley (see makeGang), for a party of the given level
  app.post("/api/world/gang", async (req: Request, res: Response) => {
    const catalog = await getWorldCatalog();
    const gang = makeGang(catalog.monsters, catalog.equipment, Math.max(1, Math.min(20, Number(req.body?.level) || 1)), String(req.body?.seed ?? Date.now().toString(36)).replace(/[^\w-]/g, ""));
    if (!gang.length) return res.status(404).json({ message: "No stat blocks for a gang" });
    res.json(gang);
  });

  app.post("/api/world/validate", async (req: Request, res: Response) => {
    if (!isWorld(req.body?.world)) return res.status(400).json({ message: "A world is required" });
    res.json({ problems: validateWorld(req.body.world, await getWorldCatalog()) });
  });
}
