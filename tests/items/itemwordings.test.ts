// Enhanced items' regular wordings read (2026-11-02, the item audit): proficiency tiers raised (Wretched Hives), force and tech powers'
// attack and save DC bonuses, a Sith robe's damage, resistances, a weapon modification's lost and lowered properties, a plain augment's
// score with its side effect; and how many of the 1,918 enhanced items still read nothing
import test from "node:test";
import assert from "node:assert/strict";
import { parseItemEffects, raisedTier, tierBonus, tierAdvantage, itemFactsOf, describeEffects } from "../../shared/logic/index";
import items from "../../shared/data/sw5e/enhancedItems.json";
import equipment from "../../shared/data/sw5e/equipment.json";

test("a clothing pattern raises a skill's tier by steps, or to a tier; the tiers give the book's bonus and advantage", () => {
  assert.deepEqual(parseItemEffects("Your level of proficiency in Piloting increases by one step (to trained, from trained to proficient).").proficiency, { piloting: { by: 1 } });
  assert.deepEqual(parseItemEffects("Your level of proficiency in Wisdom saving throws increases by two steps.").proficiency, { "wisdom saving throws": { by: 2 } });
  assert.deepEqual(parseItemEffects("You gain grand mastery in Sleight of Hand.").proficiency, { "sleight of hand": { to: 6 } });
  assert.equal(parseItemEffects("Your level of proficiency in these tools increases by one step.").proficiency, undefined, "the tools are the GM's");
  assert.equal(raisedTier(0, [{ by: 1 }]), 1);
  assert.equal(raisedTier(2, [{ by: 4 }]), 6);
  assert.equal(raisedTier(2, [{ by: 9 }]), 6);
  assert.equal(raisedTier(3, [{ to: 6 }]), 6);
  assert.deepEqual([0, 1, 2, 3, 4, 6].map((t) => tierBonus(t, 3)), [0, 1, 3, 6, 6, 6]);
  assert.equal(tierAdvantage(3), false);
  assert.equal(tierAdvantage(4), true);
});

test("foci and their modifications: power attacks, melee or ranged, and save DCs by the ability saved with", () => {
  const e = parseItemEffects("While using this item as your focus, you gain a +2 bonus to ranged force attacks and a -1 penalty to melee force attacks.");
  assert.deepEqual(e.powers, { force: { ranged: 2, melee: -1 } });
  const dc = parseItemEffects("While using this item as your focus, you gain a +1 bonus to the tech save DC of powers that require a Strength or Constitution saving throw.");
  assert.deepEqual(dc.powers, { tech: { dc: { strength: 1, constitution: 1 } } });
  const focus = parseItemEffects("Requires attunement. You gain a +3 bonus to the force attack rolls for force powers you cast through this focus generator.");
  assert.deepEqual(focus.powers, { force: { melee: 3, ranged: 3 } });
  assert.match(describeEffects(focus), /\+3 force power attacks/);
});

test("a Sith robe's damage, resistances, lost and lowered weapon properties, a plain augment", () => {
  const robe = parseItemEffects("You gain a +3 bonus to damage rolls with weapons and force powers while you wear this robe.");
  assert.equal(robe.damage, 3);
  assert.equal(robe.forceDamage, 3);
  assert.equal(robe.attack, undefined);
  assert.ok(parseItemEffects("you are resistant to all unenhanced damage.").resist!.includes("kinetic"));
  assert.deepEqual(parseItemEffects("While wearing this armor, you have resistance to ion damage.").resist, ["ion"]);
  assert.deepEqual(parseItemEffects("This weapon loses the two-handed property.").drops, ["two-handed"]);
  assert.deepEqual(parseItemEffects("This weapon's dexterity number is reduced by one step (from 21 to 19).").lowers, ["dexterity"]);
  const aug = parseItemEffects("Your Charisma score increases by 1. One ability score other than Charisma (chosen by the GM) decreases by 1.");
  assert.deepEqual(aug.raiseScores, { charisma: { by: 1, max: 20 } });
  assert.equal(aug.falls, true);
});

test("of the enhanced items, those that read nothing are now the ones whose effect is a class feature's or a GM's choice", () => {
  let none = 0;
  for (const row of items as any[]) {
    const f = itemFactsOf(row, equipment as any);
    if (!f || (!Object.keys(f.effects).length && !f.use && !f.timed && !f.properties?.length && !f.chassis && !f.shipPart)) none++;
  }
  // (714 before this reading; what is left: class features' charges, droid protocols, powers cast from items, "these tools")
  assert.ok(none <= 330, `${none} read nothing`);
});
