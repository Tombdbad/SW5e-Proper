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

interface CharacterSheetProps {
  character: any;
}

export default function CharacterSheet({ character }: CharacterSheetProps) {
  const { updateCharacter } = useCharacter();
  const [rollResult, setRollResult] = useState<{type: string, result: number} | null>(null);

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
  const rollAbilityCheck = (ability: string, score: number) => {
    const modifier = getAbilityModifier(score);
    const result = rollDice(1, 20) + modifier;
    
    setRollResult({
      type: `${ability} Check`,
      result
    });
    
    toast.info(`${ability} Check: ${result} (1d20 + ${formatModifier(modifier)})`);
  };

  // Handle saving throw rolls
  const rollSavingThrow = (ability: string, score: number) => {
    const modifier = getAbilityModifier(score);
    const proficiencyBonus = getProficiencyBonus(character.level);
    
    // Check if character is proficient in this saving throw
    const isProficient = character.savingThrowProficiencies?.includes(ability.toLowerCase()) || false;
    const bonus = isProficient ? modifier + proficiencyBonus : modifier;
    
    const result = rollDice(1, 20) + bonus;
    
    setRollResult({
      type: `${ability} Save`,
      result
    });
    
    toast.info(`${ability} Save: ${result} (1d20 + ${formatModifier(bonus)})`);
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Left Column - Basic Info and Ability Scores */}
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
              {Object.entries(character.abilityScores).map(([ability, score]) => (
                <div key={ability} className="bg-gray-800 p-3 rounded-lg text-center">
                  <div className="uppercase text-xs mb-1">{ability}</div>
                  <div className="text-2xl font-bold mb-1">{score}</div>
                  <div className="text-lg text-yellow-400">
                    {formatModifier(getAbilityModifier(score as number))}
                  </div>
                  <div className="flex mt-2 space-x-1">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 text-xs"
                      onClick={() => rollAbilityCheck(ability, score as number)}
                    >
                      Check
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 text-xs"
                      onClick={() => rollSavingThrow(ability, score as number)}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ))}
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
                  {character.startingLocation}
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
              className="min-h-[150px]"
              value={character.notes || ""}
              onChange={handleNotesChange}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
