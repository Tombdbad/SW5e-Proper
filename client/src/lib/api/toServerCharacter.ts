// Maps what the creation form / stores hold onto the shape server/routes.ts and shared/schema.ts expect.
export function toServerCharacter(c: any, partial = false): Record<string, any> {
  const o: Record<string, any> = {};
  const put = (k: string, v: any, dflt?: any) => {
    const val = v !== undefined && v !== null ? v : partial ? undefined : dflt;
    if (val !== undefined) o[k] = val;
  };
  const names = (xs: any) =>
    Array.isArray(xs)
      ? xs.map((x) => (typeof x === "string" ? x : x?.name ?? x?.id ?? String(x)))
      : undefined;
  const ab = c.abilityScores ?? c.abilities;
  const dex = ab?.dexterity ?? 10;
  const hp = c.maxHp ?? c.hitPoints;
  const pp = c.maxForcePoints ?? c.powerPoints;

  put("name", c.name);
  put("species", c.species);
  put("class", c.class);
  put("subclass", c.subclass || c.archetype || undefined);
  put("background", c.background);
  put("alignment", c.alignment, "Neutral");
  put("level", c.level, 1);
  put("abilityScores", ab, { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 });
  put("proficiencyBonus", c.proficiencyBonus, 2);
  put("maxHp", hp, 10);
  put("currentHp", c.currentHp ?? hp, 10);
  put("temporaryHp", c.temporaryHp, 0);
  put("maxForcePoints", pp, 0);
  put("currentForcePoints", c.currentForcePoints ?? pp, 0);
  put("armorClass", c.armorClass || undefined, 10 + Math.floor((dex - 10) / 2));
  put("speed", c.speed, 30);
  put("equipment", names(c.equipment), []);
  put("weapons", Array.isArray(c.weapons) ? c.weapons : undefined);
  put("skillProficiencies", names(c.skillProficiencies), []);
  put("savingThrowProficiencies", names(c.savingThrowProficiencies), []);
  put("toolProficiencies", names(c.toolProficiencies));
  put("languages", names(c.languages));
  put("forcePowers", Array.isArray(c.forcePowers) ? c.forcePowers : undefined);
  put("techPowers", Array.isArray(c.techPowers) ? c.techPowers : undefined);
  put("feats", Array.isArray(c.feats) ? c.feats : undefined);
  put("credits", c.credits, 1000);
  put("experience", c.experience ?? c.experiencePoints, 0);
  put("startingLocation", c.startingLocation, "Unknown");
  put("currentLocation", c.currentLocation || undefined);
  put("backstory", c.backstory ?? c.personality?.backstory ?? undefined);
  put("notes", c.notes || undefined);
  put("forceAlignment", c.forceAlignment || undefined);
  put("personalityTraits", c.personality?.traits);
  put("ideals", c.personality?.ideals);
  put("bonds", c.personality?.bonds);
  put("flaws", c.personality?.flaws);
  return o;
}
