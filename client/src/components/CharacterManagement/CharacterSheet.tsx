import {
  getAbilityModifier, calculateProficiencyBonus, calculateSkillModifier, calculateSavingThrowModifier,
  calculateInitiativeModifier, calculatePassivePerception, castingStats, powerCost, powerEffect,
} from "@/lib/sw5e/rules";
import { skills } from "@/lib/sw5e/skills";
import { findEquipmentByName } from "@/lib/sw5e/equipment";
import { getClassById } from "@/lib/sw5e/classes";
import { getSpeciesById } from "@/lib/sw5e/species";
import { getBackgroundById } from "@/lib/sw5e/backgrounds";
import PersonalityTraitForm from "@/components/CharacterCreation/PersonalityTraitForm";
import { carriedWeapons, type CarriedWeapon } from "@/lib/sw5e/characterCalculation";

// CharacterPreview component
export const CharacterPreview = ({ character }: { character?: any }) => {
  if (!character) {
    return (
      <div className="character-preview p-4">
        <p>No character data available</p>
      </div>
    );
  }

  return (
    <div className="character-preview p-4">
      <h3 className="text-xl font-bold mb-2">{character.name || "New Character"}</h3>
      <p>
        Level {character.level || 1} {character.species || "Unknown"} {character.class || "Unknown"}
      </p>
    </div>
  );
};

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dice } from "@/components/ui/dice";
import { rollDice as rollDiceList, sumDiceResults } from "@/lib/sw5e/dice";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CheckCircle } from "lucide-react";

// The sheet works with totals; rollDice in lib/sw5e/dice returns the individual dice
const rollDice = (quantity: number, sides: number) => sumDiceResults(rollDiceList(quantity, sides));

// Define a proper Character interface
interface Character {
  id: string;
  name: string;
  species: string;
  class: string;
  background: string;
  alignment: string;
  level: number;
  abilityScores: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  maxHp: number;
  currentHp: number;
  maxForcePoints: number;
  currentForcePoints: number;
  armorClass: number;
  speed: number | { walk: number; swim?: number };
  backstory?: string;
  startingLocation?: string;
  notes?: string;
  savingThrowProficiencies?: string[];
  skillProficiencies?: string[];
  toolProficiencies?: string[];
  languages?: string[];
  // A species' or class's unarmed strike; carried weapons are in `equipment`
  weapons?: any[];
  // Saved by name, as printed in the equipment data
  equipment?: (string | { name: string })[];
  forcePowers?: Power[];
  techPowers?: Power[];
  credits?: number;
  forceAlignment?: string;
  experience?: number;
  hitDiceUsed?: number;
  conditions?: string[];
  appearance?: { gender?: string; age?: number; height?: string; weight?: string; description?: string };
  personalityTraits?: string[];
  ideals?: string[];
  bonds?: string[];
  flaws?: string[];
}

interface Power {
  name: string;
  level: number;
  castingTime?: string;
  range?: string;
  duration?: string;
  concentration?: boolean;
  forceAlignment?: string;
  description?: string;
}

interface CharacterSheetProps {
  character: Character;
  isPreview?: boolean;
  // Called with the changed fields; the page keeps them until Save Changes
  onUpdate?: (changes: Record<string, any>) => void;
}

export default function CharacterSheet({
  character,
  isPreview = false,
  onUpdate,
}: CharacterSheetProps) {
  const [rollResult, setRollResult] = useState<{
    type: string;
    result: number;
    details?: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState("stats");
  const [showPersonality, setShowPersonality] = useState(false);

  // Skills are saved by name as printed in the rules ("Sleight of Hand")
  const hasSkill = (name: string) =>
    (character.skillProficiencies ?? []).some((skill: any) => String(skill).toLowerCase() === name.toLowerCase());

  // Format modifier for display (+2, -1, etc.)
  const formatModifier = (modifier: number) => {
    return modifier >= 0 ? `+${modifier}` : `${modifier}`;
  };

  const level = Number(character.level) || 1;
  const proficiencyBonus = calculateProficiencyBonus(level);
  const hasSave = (ability: string) =>
    (character.savingThrowProficiencies ?? []).some((save: any) => String(save).toLowerCase() === ability.toLowerCase());
  const klass = getClassById(character.class);
  const weapons = carriedWeapons(character);

  // Handle ability check rolls
  const rollAbilityCheck = (
    ability: string,
    score: number,
    advantage: "none" | "advantage" | "disadvantage" = "none",
  ) => {
    const modifier = getAbilityModifier(score);

    let roll1 = rollDice(1, 20);
    let roll2 = rollDice(1, 20);
    let finalRoll = roll1;
    let details = `1d20 (${roll1}) + ${formatModifier(modifier)}`;

    if (advantage === "advantage") {
      finalRoll = Math.max(roll1, roll2);
      details = `1d20 (${roll1}, ${roll2}, take higher) + ${formatModifier(modifier)}`;
    } else if (advantage === "disadvantage") {
      finalRoll = Math.min(roll1, roll2);
      details = `1d20 (${roll1}, ${roll2}, take lower) + ${formatModifier(modifier)}`;
    }

    const result = finalRoll + modifier;

    setRollResult({
      type: `${ability} Check`,
      result,
      details,
    });

    toast.info(`${ability} Check: ${result} (${details})`);
  };

  // Handle saving throw rolls
  const rollSavingThrow = (
    ability: string,
    score: number,
    advantage: "none" | "advantage" | "disadvantage" = "none",
  ) => {
    const bonus = calculateSavingThrowModifier(character.abilityScores, ability.toLowerCase() as keyof typeof character.abilityScores, proficiencyBonus, hasSave(ability));

    let roll1 = rollDice(1, 20);
    let roll2 = rollDice(1, 20);
    let finalRoll = roll1;
    let details = `1d20 (${roll1}) + ${formatModifier(bonus)}`;

    if (advantage === "advantage") {
      finalRoll = Math.max(roll1, roll2);
      details = `1d20 (${roll1}, ${roll2}, take higher) + ${formatModifier(bonus)}`;
    } else if (advantage === "disadvantage") {
      finalRoll = Math.min(roll1, roll2);
      details = `1d20 (${roll1}, ${roll2}, take lower) + ${formatModifier(bonus)}`;
    }

    const result = finalRoll + bonus;

    setRollResult({
      type: `${ability} Save`,
      result,
      details,
    });

    toast.info(`${ability} Save: ${result} (${details})`);
  };

  // Roll skill check
  const rollSkillCheck = (
    skill: string,
    ability: string,
    score: number,
    advantage: "none" | "advantage" | "disadvantage" = "none",
  ) => {
    const bonus = getAbilityModifier(score) + (hasSkill(skill) ? proficiencyBonus : 0);

    let roll1 = rollDice(1, 20);
    let roll2 = rollDice(1, 20);
    let finalRoll = roll1;
    let details = `1d20 (${roll1}) + ${formatModifier(bonus)}`;

    if (advantage === "advantage") {
      finalRoll = Math.max(roll1, roll2);
      details = `1d20 (${roll1}, ${roll2}, take higher) + ${formatModifier(bonus)}`;
    } else if (advantage === "disadvantage") {
      finalRoll = Math.min(roll1, roll2);
      details = `1d20 (${roll1}, ${roll2}, take lower) + ${formatModifier(bonus)}`;
    }

    const result = finalRoll + bonus;

    setRollResult({
      type: `${skill} (${ability}) Check`,
      result,
      details,
    });

    toast.info(`${skill} Check: ${result} (${details})`);
  };

  // Roll an attack with a carried weapon: a natural 1 misses, a natural 20 rolls the damage dice twice
  const rollAttack = (weapon: CarriedWeapon) => {
    const attackRoll = rollDice(1, 20);
    const attackTotal = attackRoll + weapon.attackBonus;
    const [diceCount, diceSides] = weapon.dice.split("d").map(Number);
    const critical = attackRoll === 20;
    const damageTotal = Math.max(1, rollDice((diceCount || 1) * (critical ? 2 : 1), diceSides || 4) + weapon.damageBonus);
    const outcome = attackRoll === 1 ? " (natural 1: a miss)" : critical ? " (natural 20: critical hit)" : "";

    setRollResult({
      type: `${weapon.name} Attack`,
      result: attackTotal,
      details: `Attack: 1d20 (${attackRoll}) ${formatModifier(weapon.attackBonus)}${outcome}\nDamage: ${damageTotal} ${weapon.damageType} (${weapon.dice} ${formatModifier(weapon.damageBonus)})`,
    });

    toast.info(`${weapon.name} Attack: ${attackTotal}${outcome} | Damage: ${damageTotal}`);
  };

  // Update character notes
  const handleNotesChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate?.({ notes: event.target.value });
  };

  // Update hit points
  const handleHitPointsChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const newHp = parseInt(event.target.value) || 0;
    onUpdate?.({ currentHp: newHp });
  };

  // Update force points
  const handleForcePointsChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const newFp = parseInt(event.target.value) || 0;
    onUpdate?.({ currentForcePoints: newFp });
  };

  const passivePerception = calculatePassivePerception(character.abilityScores, proficiencyBonus, hasSkill("Perception"), false);

  // What is carried, by name, with what the equipment data says about each
  const carried = (character.equipment ?? []).map((item: any) => String(item?.name ?? item));
  const inventory = Array.from(new Set(carried)).map((name) => ({
    name,
    quantity: carried.filter((n) => n === name).length,
    item: findEquipmentByName(name),
  }));

  // Powers known, with what each costs and the caster's numbers for it
  const knownPowers: Power[] = [...(character.forcePowers ?? []), ...(character.techPowers ?? [])].filter((power) => power?.name);
  const pointsName = klass?.casterType === "Tech" ? "Tech Points" : "Force Points";
  const hitDiceLeft = Math.max(0, level - (character.hitDiceUsed ?? 0));
  const listed = (label: string, values?: string[]) =>
    values && values.length > 0 ? (
      <div>
        <Label>{label}</Label>
        <div className="text-sm">{values.join(", ")}</div>
      </div>
    ) : null;

  // Preview mode - Condensed version of character sheet
  if (isPreview) {
    return (
      <div className="space-y-4 p-4 bg-gray-800 rounded-lg">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">{character.name}</h2>
          <div className="text-sm text-gray-400">
            Level {character.level} {character.species} {character.class}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">HP:</span> {character.currentHp}/
            {character.maxHp}
          </div>
          <div>
            <span className="text-gray-400">AC:</span> {character.armorClass}
          </div>
          <div>
            <span className="text-gray-400">Force Points:</span>{" "}
            {character.currentForcePoints}/{character.maxForcePoints}
          </div>
          <div>
            <span className="text-gray-400">Speed:</span>
            {character.speed && typeof character.speed === "object"
              ? Object.entries(character.speed)
                  .map(([type, value]) => `${type}: ${value}`)
                  .join(", ")
              : character.speed}
          </div>
        </div>
      </div>
    );
  }

  // Full character sheet
  return (
    <div className="space-y-6">
      {/* Tabs Navigation */}
      <Tabs
        defaultValue="stats"
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="grid grid-cols-5 mb-4 w-full">
          {[["stats", "Character"], ["skills", "Skills"], ["combat", "Combat"], ["equipment", "Equipment"], ["force", "Powers"]].map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="px-1 text-xs sm:px-3 sm:text-sm">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Stats Tab */}
        <TabsContent value="stats" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left Column - Basic Info */}
            <div className="space-y-6">
              <Card className="bg-gray-700">
                <CardHeader>
                  <CardTitle className="text-xl">
                    Character Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label>Name</Label>
                      <div className="text-lg">{character.name}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Species</Label>
                        <div>{getSpeciesById(character.species)?.name ?? character.species}</div>
                      </div>
                      <div>
                        <Label>Class</Label>
                        <div>{klass?.name ?? character.class}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Background</Label>
                        <div>{getBackgroundById(character.background)?.name ?? character.background}</div>
                      </div>
                      <div>
                        <Label>Alignment</Label>
                        <div>{character.alignment}</div>
                      </div>
                    </div>

                    <div>
                      <Label>Level</Label>
                      <div className="text-lg font-bold">{character.level}</div>
                    </div>

                    {listed("Saving Throws", (character.savingThrowProficiencies ?? []).map((save: any) => String(save).replace(/^./, (c) => c.toUpperCase())))}
                    {listed("Languages", character.languages)}
                    {listed("Tools", character.toolProficiencies)}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-700">
                <CardHeader>
                  <CardTitle className="text-xl">Ability Scores</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(character.abilityScores).map(
                      ([ability, score]) => {
                        const formattedAbility =
                          ability.charAt(0).toUpperCase() + ability.slice(1);
                        const modifier = getAbilityModifier(score as number);
                        return (
                          <div
                            key={ability}
                            className="bg-gray-800 p-3 rounded-lg text-center"
                          >
                            <div className="uppercase text-xs mb-1">
                              {formattedAbility}
                            </div>
                            <div className="text-2xl font-bold mb-1">
                              {score}
                            </div>
                            <div className="text-lg text-yellow-400">
                              {formatModifier(modifier)}
                            </div>
                            <div className="flex mt-2 space-x-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-xs"
                                onClick={() =>
                                  rollAbilityCheck(
                                    formattedAbility,
                                    score as number,
                                  )
                                }
                              >
                                Check
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-xs"
                                onClick={() =>
                                  rollSavingThrow(
                                    formattedAbility,
                                    score as number,
                                  )
                                }
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Middle Column - Combat Stats */}
            <div className="space-y-6">
              <Card className="bg-gray-700">
                <CardHeader>
                  <CardTitle className="text-xl">Combat Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="currentHp">Hit Points</Label>
                        <div className="flex items-center mt-1">
                          <Input
                            id="currentHp"
                            value={character.currentHp}
                            onChange={handleHitPointsChange}
                            type="number"
                            min={0}
                            max={character.maxHp}
                            className="w-20 mr-2"
                          />
                          <span className="text-lg">/ {character.maxHp}</span>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="currentForcePoints">{pointsName}</Label>
                        <div className="flex items-center mt-1">
                          <Input
                            id="currentForcePoints"
                            value={character.currentForcePoints}
                            onChange={handleForcePointsChange}
                            type="number"
                            min={0}
                            max={character.maxForcePoints}
                            className="w-20 mr-2"
                          />
                          <span className="text-lg">
                            / {character.maxForcePoints}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div className="bg-gray-800 p-3 rounded-lg text-center">
                        <div className="uppercase text-xs mb-1">
                          Armor Class
                        </div>
                        <div className="text-2xl font-bold">
                          {character.armorClass || 10}
                        </div>
                      </div>

                      <div className="bg-gray-800 p-3 rounded-lg text-center">
                        <div className="uppercase text-xs mb-1">Initiative</div>
                        <div className="text-2xl font-bold">
                          {formatModifier(calculateInitiativeModifier(character.abilityScores))}
                        </div>
                      </div>

                      <div className="bg-gray-800 p-3 rounded-lg text-center">
                        <div className="uppercase text-xs mb-1">Speed</div>
                        <div className="text-2xl font-bold">
                          {character.speed &&
                          typeof character.speed === "object"
                            ? Object.entries(character.speed)
                                .map(([type, value]) => `${type}: ${value}`)
                                .join(", ")
                            : character.speed}
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-800 p-3 rounded-lg text-center">
                      <div className="uppercase text-xs mb-1">
                        Proficiency Bonus
                      </div>
                      <div className="text-2xl font-bold">
                        {formatModifier(proficiencyBonus)}
                      </div>
                    </div>

                    <div className="bg-gray-800 p-3 rounded-lg text-center">
                      <div className="uppercase text-xs mb-1">
                        Passive Perception
                      </div>
                      <div className="text-2xl font-bold">
                        {passivePerception}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4" data-testid="sheet-progress">
                      <div className="bg-gray-800 p-3 rounded-lg text-center">
                        <div className="uppercase text-xs mb-1">Hit Dice</div>
                        <div className="text-2xl font-bold">
                          {hitDiceLeft}/{level}
                          {klass && <span className="text-sm text-gray-400"> d{klass.hitDie}</span>}
                        </div>
                      </div>
                      <div className="bg-gray-800 p-3 rounded-lg text-center">
                        <div className="uppercase text-xs mb-1">Experience</div>
                        <div className="text-2xl font-bold">{character.experience ?? 0}</div>
                      </div>
                    </div>

                    {(character.conditions ?? []).length > 0 && (
                      <div className="bg-red-900/40 p-3 rounded-lg text-center" data-testid="sheet-conditions">
                        <div className="uppercase text-xs mb-1">Conditions</div>
                        <div className="font-bold">{character.conditions!.join(", ")}</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {rollResult && (
                <Card className="bg-yellow-900 border-yellow-600">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm">{rollResult.type}</div>
                      <div className="text-2xl font-bold">
                        {rollResult.result}
                      </div>
                      {rollResult.details && (
                        <div className="text-xs mt-1">{rollResult.details}</div>
                      )}
                    </div>
                    <Dice size={48} />
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column - Background & Notes */}
            <div className="space-y-6">
              <Card className="bg-gray-700">
                <CardHeader>
                  <CardTitle className="text-xl">Background</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label>Backstory</Label>
                      <Textarea
                        placeholder="Where your character comes from, and what drives them..."
                        className="min-h-24 mt-1"
                        value={character.backstory || ""}
                        onChange={(event) => onUpdate?.({ backstory: event.target.value })}
                      />
                    </div>

                    {listed("Appearance", [
                      [character.appearance?.gender, character.appearance?.age && `${character.appearance.age} years`, character.appearance?.height, character.appearance?.weight].filter(Boolean).join(", "),
                      character.appearance?.description,
                    ].filter(Boolean) as string[])}
                    {listed("Personality Traits", character.personalityTraits)}
                    {listed("Ideals", character.ideals)}
                    {listed("Bonds", character.bonds)}
                    {listed("Flaws", character.flaws)}

                    {onUpdate && (
                      <Button size="sm" variant="outline" onClick={() => setShowPersonality(true)}>
                        Edit personality
                      </Button>
                    )}
                    {showPersonality && (
                      <PersonalityTraitForm
                        background={getBackgroundById(character.background)}
                        initialData={{ traits: character.personalityTraits ?? [], ideals: character.ideals ?? [], bonds: character.bonds ?? [], flaws: character.flaws ?? [], backstory: character.backstory ?? "", appearance: character.appearance?.description ?? "" }}
                        onSave={(data) => onUpdate?.({ personalityTraits: data.traits ?? [], ideals: data.ideals ?? [], bonds: data.bonds ?? [], flaws: data.flaws ?? [], backstory: data.backstory ?? "", appearance: { ...(character.appearance ?? {}), description: data.appearance ?? "" } })}
                        onClose={() => setShowPersonality(false)}
                      />
                    )}

                    <div>
                      <Label>Starting Location</Label>
                      <div className="bg-gray-800 p-3 rounded-lg mt-1">
                        {character.startingLocation || "Not specified"}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-700">
                <CardHeader>
                  <CardTitle className="text-xl">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Add notes about your character, encounters, or important information..."
                    className="min-h-32"
                    value={character.notes || ""}
                    onChange={handleNotesChange}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Skills Tab */}
        <TabsContent value="skills" className="space-y-6">
          <Card className="bg-gray-700">
            <CardHeader>
              <CardTitle className="text-xl">Skills</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {skills.map((skill) => {
                  const abilityScore = character.abilityScores[skill.ability as keyof typeof character.abilityScores];
                  const isProficient = hasSkill(skill.name);
                  const skillBonus = calculateSkillModifier(character.abilityScores, skill, proficiencyBonus, isProficient, false);

                  return (
                    <div
                      key={skill.name}
                      className="flex items-center justify-between p-2 bg-gray-800 rounded-lg"
                    >
                      <div className="flex items-center">
                        {isProficient && (
                          <CheckCircle
                            size={16}
                            className="text-green-500 mr-2"
                          />
                        )}
                        <span>{skill.name}</span>
                        <span className="text-gray-400 ml-2">
                          ({skill.ability.substring(0, 3)})
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline">
                          {formatModifier(skillBonus)}
                        </Badge>
                        <div className="flex space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              rollSkillCheck(
                                skill.name,
                                skill.ability,
                                abilityScore,
                              )
                            }
                          >
                            Roll
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              rollSkillCheck(
                                skill.name,
                                skill.ability,
                                abilityScore,
                                "advantage",
                              )
                            }
                            className="text-green-500"
                          >
                            Adv
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              rollSkillCheck(
                                skill.name,
                                skill.ability,
                                abilityScore,
                                "disadvantage",
                              )
                            }
                            className="text-red-500"
                          >
                            Dis
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Combat Tab */}
        <TabsContent value="combat" className="space-y-6">
          <Card className="bg-gray-700">
            <CardHeader>
              <CardTitle className="text-xl">Weapons & Attacks</CardTitle>
            </CardHeader>
            <CardContent>
              {weapons.length > 0 ? (
                <div className="space-y-4" data-testid="sheet-weapons">
                  {weapons.map((weapon) => (
                    <div key={weapon.name} className="p-3 bg-gray-800 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold text-lg">{weapon.name}</h3>
                        <Button size="sm" variant="outline" onClick={() => rollAttack(weapon)}>
                          Roll Attack
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-400">Type:</span> {weapon.type}
                        </div>
                        <div>
                          <span className="text-gray-400">Attack Bonus:</span> {formatModifier(weapon.attackBonus)}
                          {!weapon.proficient && <span className="text-yellow-400"> (not proficient)</span>}
                        </div>
                        <div>
                          <span className="text-gray-400">Damage:</span> {weapon.dice} {formatModifier(weapon.damageBonus)} {weapon.damageType}
                        </div>
                        <div>
                          <span className="text-gray-400">Ability:</span> <span className="capitalize">{weapon.ability}</span>
                        </div>
                        {weapon.properties.length > 0 && (
                          <div className="col-span-2">
                            <span className="text-gray-400">Properties:</span> {weapon.properties.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-4 text-gray-400">
                  No weapons carried. An unarmed strike deals {Math.max(1, 1 + getAbilityModifier(character.abilityScores.strength))} kinetic damage.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gray-700">
            <CardHeader>
              <CardTitle className="text-xl">Combat Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-gray-800 rounded-lg">
                  <h3 className="font-bold mb-2">Standard Actions</h3>
                  <ul className="space-y-1 text-sm">
                    <li>Attack (weapon, unarmed, or special)</li>
                    <li>Cast a Power</li>
                    <li>Dash (double movement)</li>
                    <li>Disengage (avoid opportunity attacks)</li>
                    <li>Dodge (disadvantage to attacks against you)</li>
                    <li>Help (give advantage to an ally)</li>
                    <li>Hide (make a Stealth check)</li>
                    <li>Use an Object</li>
                  </ul>
                </div>

                <div className="p-3 bg-gray-800 rounded-lg">
                  <h3 className="font-bold mb-2">Bonus Actions</h3>
                  <ul className="space-y-1 text-sm">
                    <li>Offhand attack</li>
                    <li>Cast a power (if casting time is bonus action)</li>
                    <li>Class features (varies)</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Equipment Tab */}
        <TabsContent value="equipment" className="space-y-6">
          <Card className="bg-gray-700">
            <CardHeader>
              <CardTitle className="text-xl">Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              {inventory.length > 0 ? (
                <div className="space-y-2" data-testid="sheet-equipment">
                  {inventory.map(({ name, quantity, item }) => (
                    <div key={name} className="p-3 bg-gray-800 rounded-lg flex justify-between items-center gap-2">
                      <div>
                        <div className="font-medium">{name}</div>
                        <div className="text-sm text-gray-400">
                          {item
                            ? [item.kind.replace(/([a-z])([A-Z])/g, "$1 $2"), item.damage, item.armorClass && `AC ${item.armorClass}`, ...(item.properties ?? [])].filter(Boolean).join(", ")
                            : "Not in the equipment data"}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 shrink-0">
                        {item?.weight && <div className="text-sm text-gray-400">{item.weight} lb</div>}
                        <Badge variant="outline">Qty: {quantity}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-4 text-gray-400">
                  Nothing carried. Add equipment on the Inventory tab.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gray-700">
            <CardHeader>
              <CardTitle className="text-xl">Currency</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                <div className="p-3 bg-gray-800 rounded-lg text-center">
                  <div className="text-xs mb-1">Credits</div>
                  <div className="text-lg font-bold">
                    {character.credits || 0}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Powers Tab: force and tech powers known */}
        <TabsContent value="force" className="space-y-6">
          <Card className="bg-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xl">Powers</CardTitle>
              <Badge variant="outline">
                {pointsName}: {character.currentForcePoints}/{character.maxForcePoints}
              </Badge>
            </CardHeader>
            <CardContent>
              {knownPowers.length > 0 ? (
                <div className="space-y-4" data-testid="sheet-powers">
                  {knownPowers.map((power) => {
                    const stats = castingStats(character.abilityScores, level, power);
                    const effect = powerEffect(power, level);
                    const cost = powerCost(power);
                    return (
                      <div key={power.name} className="p-3 bg-gray-800 rounded-lg">
                        <div className="flex justify-between items-center mb-2 gap-2">
                          <h3 className="font-bold text-lg">{power.name}</h3>
                          <Badge variant="outline" className="shrink-0">
                            {power.level ? `Level ${power.level}, ${cost} pts` : "At-will"}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                          <div>
                            <span className="text-gray-400">Type:</span>{" "}
                            {"forceAlignment" in power ? `Force (${power.forceAlignment})` : "Tech"}
                          </div>
                          <div>
                            <span className="text-gray-400">Casting Time:</span> {power.castingTime}
                          </div>
                          <div>
                            <span className="text-gray-400">Range:</span> {power.range}
                          </div>
                          <div>
                            <span className="text-gray-400">Duration:</span> {power.duration}
                            {power.concentration ? " (concentration)" : ""}
                          </div>
                          <div className="col-span-2">
                            <span className="text-gray-400">Your numbers:</span> attack {formatModifier(stats.attack)}, save DC {stats.dc}
                            {effect.kind !== "other" ? `; ${effect.summary}` : ""}
                          </div>
                        </div>
                        <details>
                          <summary className="cursor-pointer text-sm text-gray-400">Description</summary>
                          <div className="text-sm mt-2 whitespace-pre-line">{power.description}</div>
                        </details>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center p-4 text-gray-400">
                  {klass && klass.casterType === "None"
                    ? `${klass.name}s do not learn powers from their class.`
                    : "No powers known yet. Powers are chosen in creation and when a level grants them."}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}