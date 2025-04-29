            import { useState } from "react";
            import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
            import { Input } from "@/components/ui/input";
            import { Textarea } from "@/components/ui/textarea";
            import { Label } from "@/components/ui/label";
            import { Button } from "@/components/ui/button";
            import { Separator } from "@/components/ui/separator";
            import { Dice } from "@/components/ui/dice";
            import { useCharacter } from "@/lib/stores/useCharacter";
            import { rollDice } from "@/lib/sw5e/dice";
            import { toast } from "sonner";
            import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
            import { Badge } from "@/components/ui/badge";
            import { CheckCircle } from "lucide-react";

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
              speed: number;
              backstory?: string;
              startingLocation?: string;
              notes?: string;
              savingThrowProficiencies?: string[];
              skillProficiencies?: string[];
              weapons?: Weapon[];
              equipment?: Equipment[];
              forcePowers?: ForcePower[];
            }

            interface Weapon {
              name: string;
              type: string;
              damage: string;
              properties?: string[];
              ability: string;
              proficient: boolean;
            }

            interface Equipment {
              name: string;
              quantity: number;
              weight?: number;
              description?: string;
            }

            interface ForcePower {
              name: string;
              level: number;
              castingTime: string;
              range: string;
              description: string;
            }

            interface CharacterSheetProps {
              character: Character;
              isPreview?: boolean;
            }

            export default function CharacterSheet({ character, isPreview = false }: CharacterSheetProps) {
              const { updateCharacter } = useCharacter();
              const [rollResult, setRollResult] = useState<{type: string, result: number, details?: string} | null>(null);
              const [activeTab, setActiveTab] = useState("stats");

              // Calculate ability modifiers
              const getAbilityModifier = (score: number) => {
                return Math.floor((score - 10) / 2);
              };

              // Format modifier for display (+2, -1, etc.)
              const formatModifier = (modifier: number) => {
                return modifier >= 0 ? `+${modifier}` : `${modifier}`;
              };

              // Calculate proficiency bonus based on level
              const getProficiencyBonus = (level: number) => {
                return Math.floor((level - 1) / 4) + 2;
              };

              // Handle ability check rolls
              const rollAbilityCheck = (ability: string, score: number, advantage: "none" | "advantage" | "disadvantage" = "none") => {
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
                  details
                });

                toast.info(`${ability} Check: ${result} (${details})`);
              };

              // Handle saving throw rolls
              const rollSavingThrow = (ability: string, score: number, advantage: "none" | "advantage" | "disadvantage" = "none") => {
                const modifier = getAbilityModifier(score);
                const proficiencyBonus = getProficiencyBonus(character.level);

                // Check if character is proficient in this saving throw
                const isProficient = character.savingThrowProficiencies?.includes(ability.toLowerCase()) || false;
                const bonus = isProficient ? modifier + proficiencyBonus : modifier;

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
                  details
                });

                toast.info(`${ability} Save: ${result} (${details})`);
              };

              // Roll skill check
              const rollSkillCheck = (skill: string, ability: string, score: number, advantage: "none" | "advantage" | "disadvantage" = "none") => {
                const modifier = getAbilityModifier(score);
                const proficiencyBonus = getProficiencyBonus(character.level);

                // Check if character is proficient in this skill
                const isProficient = character.skillProficiencies?.includes(skill.toLowerCase()) || false;
                const bonus = isProficient ? modifier + proficiencyBonus : modifier;

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
                  details
                });

                toast.info(`${skill} Check: ${result} (${details})`);
              };

              // Roll attack
              const rollAttack = (weapon: Weapon) => {
                const abilityScore = character.abilityScores[weapon.ability.toLowerCase() as keyof typeof character.abilityScores];
                const modifier = getAbilityModifier(abilityScore);
                const proficiencyBonus = getProficiencyBonus(character.level);

                const attackBonus = weapon.proficient ? modifier + proficiencyBonus : modifier;
                const attackRoll = rollDice(1, 20);
                const attackTotal = attackRoll + attackBonus;

                // Parse damage dice (e.g., "1d8+3")
                const damageMatch = weapon.damage.match(/(\d+)d(\d+)(?:\+(\d+))?/);
                if (!damageMatch) return;

                const [_, diceCount, diceSides, bonusStr] = damageMatch;
                const damageBonus = bonusStr ? parseInt(bonusStr) : modifier;

                let damageRoll = 0;
                for (let i = 0; i < parseInt(diceCount); i++) {
                  damageRoll += rollDice(1, parseInt(diceSides));
                }

                const damageTotal = damageRoll + damageBonus;

                setRollResult({
                  type: `${weapon.name} Attack`,
                  result: attackTotal,
                  details: `Attack: ${attackTotal} (1d20 + ${attackBonus})\nDamage: ${damageTotal} (${weapon.damage})`
                });

                toast.info(`${weapon.name} Attack: ${attackTotal} | Damage: ${damageTotal}`);
              };

              // Update character notes
              const handleNotesChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
                updateCharacter({
                  ...character,
                  notes: event.target.value
                });
              };

              // Update hit points
              const handleHitPointsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
                const newHp = parseInt(event.target.value) || 0;
                updateCharacter({
                  ...character,
                  currentHp: newHp
                });
              };

              // Update force points
              const handleForcePointsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
                const newFp = parseInt(event.target.value) || 0;
                updateCharacter({
                  ...character,
                  currentForcePoints: newFp
                });
              };

              // Calculate passive perception (10 + wisdom modifier + proficiency if proficient)
              const passivePerception = 10 + getAbilityModifier(character.abilityScores.wisdom) + 
                (character.skillProficiencies?.includes("perception") ? getProficiencyBonus(character.level) : 0);

              // Skills and their associated abilities
              const skills = [
                { name: "Acrobatics", ability: "Dexterity" },
                { name: "Animal Handling", ability: "Wisdom" },
                { name: "Athletics", ability: "Strength" },
                { name: "Deception", ability: "Charisma" },
                { name: "Insight", ability: "Wisdom" },
                { name: "Intimidation", ability: "Charisma" },
                { name: "Investigation", ability: "Intelligence" },
                { name: "Lore", ability: "Intelligence" },
                { name: "Medicine", ability: "Wisdom" },
                { name: "Nature", ability: "Intelligence" },
                { name: "Perception", ability: "Wisdom" },
                { name: "Performance", ability: "Charisma" },
                { name: "Persuasion", ability: "Charisma" },
                { name: "Piloting", ability: "Dexterity" },
                { name: "Sleight of Hand", ability: "Dexterity" },
                { name: "Stealth", ability: "Dexterity" },
                { name: "Survival", ability: "Wisdom" },
                { name: "Technology", ability: "Intelligence" }
              ];

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
                        <span className="text-gray-400">HP:</span> {character.currentHp}/{character.maxHp}
                      </div>
                      <div>
                        <span className="text-gray-400">AC:</span> {character.armorClass}
                      </div>
                      <div>
                        <span className="text-gray-400">Force Points:</span> {character.currentForcePoints}/{character.maxForcePoints}
                      </div>
                      <div>
                        <span className="text-gray-400">Speed:</span> {character.speed}
                      </div>
                    </div>
                  </div>
                );
              }

              // Full character sheet
              return (
                <div className="space-y-6">
                  {/* Tabs Navigation */}
                  <Tabs defaultValue="stats" value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid grid-cols-5 mb-4">
                      <TabsTrigger value="stats">Character</TabsTrigger>
                      <TabsTrigger value="skills">Skills</TabsTrigger>
                      <TabsTrigger value="combat">Combat</TabsTrigger>
                      <TabsTrigger value="equipment">Equipment</TabsTrigger>
                      <TabsTrigger value="force">Force Powers</TabsTrigger>
                    </TabsList>

                    {/* Stats Tab */}
                    <TabsContent value="stats" className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Left Column - Basic Info */}
                        <div className="space-y-6">
                          <Card className="bg-gray-700">
                            <CardHeader>
                              <CardTitle className="text-xl">Character Information</CardTitle>
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
                                    <div>{character.species}</div>
                                  </div>
                                  <div>
                                    <Label>Class</Label>
                                    <div>{character.class}</div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <Label>Background</Label>
                                    <div>{character.background}</div>
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
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="bg-gray-700">
                            <CardHeader>
                              <CardTitle className="text-xl">Ability Scores</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="grid grid-cols-2 gap-4">
                                {Object.entries(character.abilityScores).map(([ability, score]) => {
                                  const formattedAbility = ability.charAt(0).toUpperCase() + ability.slice(1);
                                  const modifier = getAbilityModifier(score as number);
                                  return (
                                    <div key={ability} className="bg-gray-800 p-3 rounded-lg text-center">
                                      <div className="uppercase text-xs mb-1">{formattedAbility}</div>
                                      <div className="text-2xl font-bold mb-1">{score}</div>
                                      <div className="text-lg text-yellow-400">
                                        {formatModifier(modifier)}
                                      </div>
                                      <div className="flex mt-2 space-x-1">
                                        <Button 
                                          size="sm" 
                                          variant="outline" 
                                          className="flex-1 text-xs"
                                          onClick={() => rollAbilityCheck(formattedAbility, score as number)}
                                        >
                                          Check
                                        </Button>
                                        <Button 
                                          size="sm" 
                                          variant="outline" 
                                          className="flex-1 text-xs"
                                          onClick={() => rollSavingThrow(formattedAbility, score as number)}
                                        >
                                          Save
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
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
                                    <Label htmlFor="currentForcePoints">Force Points</Label>
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
                                      <span className="text-lg">/ {character.maxForcePoints}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4 mt-4">
                                  <div className="bg-gray-800 p-3 rounded-lg text-center">
                                    <div className="uppercase text-xs mb-1">Armor Class</div>
                                    <div className="text-2xl font-bold">{character.armorClass || 10}</div>
                                  </div>

                                  <div className="bg-gray-800 p-3 rounded-lg text-center">
                                    <div className="uppercase text-xs mb-1">Initiative</div>
                                    <div className="text-2xl font-bold">
                                      {formatModifier(getAbilityModifier(character.abilityScores.dexterity))}
                                    </div>
                                  </div>

                                  <div className="bg-gray-800 p-3 rounded-lg text-center">
                                    <div className="uppercase text-xs mb-1">Speed</div>
                                    <div className="text-2xl font-bold">{character.speed || 30}</div>
                                  </div>
                                </div>

                                <div className="bg-gray-800 p-3 rounded-lg text-center">
                                  <div className="uppercase text-xs mb-1">Proficiency Bonus</div>
                                  <div className="text-2xl font-bold">
                                    {formatModifier(getProficiencyBonus(character.level))}
                                  </div>
                                </div>

                                <div className="bg-gray-800 p-3 rounded-lg text-center">
                                  <div className="uppercase text-xs mb-1">Passive Perception</div>
                                  <div className="text-2xl font-bold">{passivePerception}</div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          {rollResult && (
                            <Card className="bg-yellow-900 border-yellow-600">
                              <CardContent className="p-4 flex items-center justify-between">
                                <div>
                                  <div className="text-sm">{rollResult.type}</div>
                                  <div className="text-2xl font-bold">{rollResult.result}</div>
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
                                  <div className="bg-gray-800 p-3 rounded-lg mt-1 min-h-16">
                                    {character.backstory || "No backstory provided."}
                                  </div>
                                </div>

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
                            {skills.map(skill => {
                              const abilityScore = character.abilityScores[skill.ability.toLowerCase() as keyof typeof character.abilityScores];
                              const modifier = getAbilityModifier(abilityScore);
                              const proficiencyBonus = getProficiencyBonus(character.level);
                              const isProficient = character.skillProficiencies?.includes(skill.name.toLowerCase()) || false;
                              const skillBonus = isProficient ? modifier + proficiencyBonus : modifier;

                              return (
                                <div key={skill.name} className="flex items-center justify-between p-2 bg-gray-800 rounded-lg">
                                  <div className="flex items-center">
                                    {isProficient && <CheckCircle size={16} className="text-green-500 mr-2" />}
                                    <span>{skill.name}</span>
                                    <span className="text-gray-400 ml-2">({skill.ability.substring(0, 3)})</span>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Badge variant="outline">{formatModifier(skillBonus)}</Badge>
                                    <div className="flex space-x-1">
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        onClick={() => rollSkillCheck(skill.name, skill.ability, abilityScore)}
                                      >
                                        Roll
                                      </Button>
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        onClick={() => rollSkillCheck(skill.name, skill.ability, abilityScore, "advantage")}
                                        className="text-green-500"
                                      >
                                        Adv
                                      </Button>
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        onClick={() => rollSkillCheck(skill.name, skill.ability, abilityScore, "disadvantage")}
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
                          {character.weapons && character.weapons.length > 0 ? (
                            <div className="space-y-4">
                              {character.weapons.map((weapon, index) => {
                                const abilityScore = character.abilityScores[weapon.ability.toLowerCase() as keyof typeof character.abilityScores];
                                const modifier = getAbilityModifier(abilityScore);
                                const proficiencyBonus = getProficiencyBonus(character.level);
                                const attackBonus = weapon.proficient ? modifier + proficiencyBonus : modifier;

                                return (
                                  <div key={index} className="p-3 bg-gray-800 rounded-lg">
                                    <div className="flex justify-between items-center mb-2">
                                      <h3 className="font-bold text-lg">{weapon.name}</h3>
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        onClick={() => rollAttack(weapon)}
                                      >
                                        Roll Attack
                                      </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                      <div><span className="text-gray-400">Type:</span> {weapon.type}</div>
                                      <div><span className="text-gray-400">Attack Bonus:</span> {formatModifier(attackBonus)}</div>
                                      <div><span className="text-gray-400">Damage:</span> {weapon.damage}</div>
                                      <div><span className="text-gray-400">Ability:</span> {weapon.ability}</div>
                                      {weapon.properties && (
                                        <div className="col-span-2">
                                          <span className="text-gray-400">Properties:</span> {weapon.properties.join(", ")}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center p-4 text-gray-400">
                              No weapons added. Add weapons to your character to see them here.
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
                  </Tabs>

                  {/* Mobile Roll Controls */}
                  <div className="md:hidden mt-4">
                    <Card className="bg-gray-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Quick Roll</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-2">
                          <Button size="sm" onClick={() => rollDice(1, 20)}>
                            d20
                          </Button>
                          <Button size="sm" onClick={() => rollDice(1, 8)}>
                            d8
                          </Button>
                          <Button size="sm" onClick={() => rollDice(1, 6)}>
                            d6
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>,       
                    {/* Equipment Tab */}
                    <TabsContent value="equipment" className="space-y-6">
                      <Card className="bg-gray-700">
                        <CardHeader>
                          <CardTitle className="text-xl">Inventory</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {character.equipment && character.equipment.length > 0 ? (
                            <div className="space-y-2">
                              {character.equipment.map((item, index) => (
                                <div key={index} className="p-3 bg-gray-800 rounded-lg flex justify-between items-center">
                                  <div>
                                    <div className="font-medium">{item.name}</div>
                                    {item.description && (
                                      <div className="text-sm text-gray-400">{item.description}</div>
                                    )}
                                  </div>
                                  <div className="flex items-center space-x-4">
                                    {item.weight && (
                                      <div className="text-sm text-gray-400">{item.weight} lbs</div>
                                    )}
                                    <Badge variant="outline">Qty: {item.quantity}</Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center p-4 text-gray-400">
                              No equipment added. Add equipment to your character to see it here.
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
                              <div className="text-lg font-bold">{character.credits || 0}</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    {/* Force Powers Tab */}
                    <TabsContent value="force" className="space-y-6">
                      <Card className="bg-gray-700">
                        <CardHeader>
                          <CardTitle className="text-xl">Force Powers</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {character.forcePowers && character.forcePowers.length > 0 ? (
                            <div className="space-y-4">
                              {character.forcePowers.map((power, index) => (
                                <div key={index} className="p-4 bg-gray-800 rounded-lg">
                                  <div className="flex justify-between items-center mb-2">
                                    <h3 className="font-bold text-lg">{power.name}</h3>
                                    <Badge variant={power.level === 0 ? "outline" : "default"}>
                                      {power.level === 0 ? "At-Will" : `Level ${power.level}`}
                                    </Badge>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                                    <div><span className="text-gray-400">Casting Time:</span> {power.castingTime}</div>
                                    <div><span className="text-gray-400">Range:</span> {power.range}</div>
                                  </div>
                                  <div className="text-sm">{power.description}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center p-4 text-gray-400">
                              No force powers added. Add force powers to your character to see them here.
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="bg-gray-700">
                        <CardHeader>
                          <CardTitle className="text-xl">Force Stats</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-gray-800 rounded-lg">
                              <div className="text-sm text-gray-400 mb-1">Force Alignment</div>
                              <div className="text-lg">
                                {character.forceAlignment || "Balanced"}
                              </div>
                            </div>

                            <div className="p-3 bg-gray-800 rounded-lg">
                              <div className="text-sm text-gray-400 mb-1">Force Save DC</div>
                              <div className="text-lg font-bold">
                                {8 + getProficiencyBonus(character.level) + 
                                  getAbilityModifier(character.abilityScores.wisdom)}
                              </div>
                            </div>

                            <div className="p-3 bg-gray-800 rounded-lg">
                              <div className="text-sm text-gray-400 mb-1">Force Attack Bonus</div>
                              <div className="text-lg font-bold">
                                {formatModifier(getProficiencyBonus(character.level) + 
                                  getAbilityModifier(character.abilityScores.wisdom))}
                              </div>
                            </div>
                          </div>
                        </CardContent>