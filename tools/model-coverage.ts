// What equipment has a model and what has not (2026-10-19): walks the rules data's equipment through interiors/gear.ts and prints
// the result as markdown. Usage: node --import tsx tools/model-coverage.ts [--full]   (--full lists every item)
import fs from "node:fs";
import { coverageOf, type Bucket, type Item } from "../client/src/components/Map/interiors/gear";

const items: Item[] = JSON.parse(fs.readFileSync(new URL("../shared/data/sw5e/equipment.json", import.meta.url), "utf8"));
const rows = items.map((it) => ({ it, c: coverageOf(it) }));
const full = process.argv.includes("--full");
const order: Bucket[] = ["dedicated", "shared", "code", "none"];
const categories = [...new Set(items.map((i) => i.equipmentCategory))];
console.log("| Category | Items | Own model | Shared by kind | In code | Nothing |\n|---|---|---|---|---|---|");
for (const cat of categories) {
  const mine = rows.filter((r) => r.it.equipmentCategory === cat);
  console.log(`| ${cat} | ${mine.length} | ${order.map((b) => mine.filter((r) => r.c.bucket === b).length).join(" | ")} |`);
}
console.log(`| **All** | ${items.length} | ${order.map((b) => rows.filter((r) => r.c.bucket === b).length).join(" | ")} |`);
for (const cat of categories) {
  const none = rows.filter((r) => r.it.equipmentCategory === cat && (r.c.bucket === "none" || r.c.bucket === "code"));
  if (!none.length) continue;
  console.log(`\n**${cat}** with nothing or code only (${none.length}): ${full || none.length <= 12 ? none.map((r) => r.it.name).join(", ") : none.slice(0, 12).map((r) => r.it.name).join(", ") + ", ..."}`);
}
const designs = new Map<string, number>();
for (const r of rows.filter((r) => r.c.bucket === "shared" && r.it.equipmentCategory === "Weapon")) designs.set(r.c.model!, (designs.get(r.c.model!) ?? 0) + 1);
console.log(`\nWeapons on a shared design: ${[...designs.values()].reduce((a, b) => a + b, 0)} items over ${designs.size} designs.`);
