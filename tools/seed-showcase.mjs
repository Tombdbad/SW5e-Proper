// Makes a character and a campaign on the test copy (it needs SW5E_SHOWCASE=1, which deploy/test-copy.sh sets: the world is one planet
// with a city, caves and ruins, and quick ways between them) and prints the address. Usage: node tools/seed-showcase.mjs [BASE]
// Never run it against the service: it would only make an ordinary galaxy there.
const BASE = process.argv[2] || process.env.BASE || "http://127.0.0.1:5001";
const call = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.json();
};
const character = await call("POST", "/api/characters", {
  name: "Showcase Tester", species: "human", class: "fighter", background: "soldier", alignment: "Neutral Balanced", level: 5,
  abilityScores: { strength: 16, dexterity: 14, constitution: 15, intelligence: 12, wisdom: 12, charisma: 12 },
  maxHp: 45, currentHp: 45, maxForcePoints: 0, currentForcePoints: 0, armorClass: 16, speed: 30, credits: 50000,
  startingLocation: "Unknown", skillProficiencies: ["Athletics", "Perception"], savingThrowProficiencies: ["strength", "constitution"],
  equipment: ["Blaster rifle", "Vibroblade", "Medpac"],
});
const generated = await call("POST", "/api/world/generate", { options: { partyLevel: 5, seed: 1 } });
const world = generated.world;
const campaign = await call("POST", "/api/campaigns", {
  characterId: character.id, name: "Interiors showcase", description: "One planet: a city (palace, armsmith, garrison, cantina, medcenter, tenements ...), a cave system and ruins. The buildings of the city are 10 m apart; the settlements a kilometre.",
  npcs: [], locations: [], quests: generated.quests ?? [], startingLocation: "start", currentLocation: world.startId, galaxyMap: world, timeElapsed: { total: 780 },
});
const areas = Object.values(world.areas);
console.log(`problems: ${(generated.problems ?? []).length ? generated.problems.join("; ") : "none"}`);
console.log(`${areas.filter((a) => a.kind === "settlement").map((s) => `${s.name} (${s.type})`).join(", ")}`);
console.log(`character ${character.id}, campaign ${campaign.id}`);
console.log(`open: ${process.env.PUBLIC_URL || "https://sw5e.tailb1e5d7.ts.net:8443"}/game/${campaign.id}`);
