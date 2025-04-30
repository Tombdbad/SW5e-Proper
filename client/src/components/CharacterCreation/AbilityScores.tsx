import { useState } from "react";
import { FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dice } from "@/components/ui/dice";
import { rollDice } from "@/lib/sw5e/dice";
import { calculateModifier } from "@/lib/sw5e/rules";

export default function AbilityScores({ form, maxPoints }: { form: any, maxPoints?: number }) {
  const [rollResults, setRollResults] = useState<number[][]>([]);
  const [totalResults, setTotalResults] = useState<number[]>([]);
  const [assigned, setAssigned] = useState<Record<string, boolean>>({});

  const abilities = [
    { id: "strength", name: "Strength", description: "Physical power and athleticism" },
    { id: "dexterity", name: "Dexterity", description: "Agility, reflexes, and balance" },
    { id: "constitution", name: "Constitution", description: "Endurance, stamina, and health" },
    { id: "intelligence", name: "Intelligence", description: "Knowledge, reasoning, and memory" },
    { id: "wisdom", name: "Wisdom", description: "Perception, intuition, and insight" },
    { id: "charisma", name: "Charisma", description: "Force of personality and persuasion" },
  ];

  const rollAbilityScores = () => {
    // Roll 4d6, drop lowest for each ability
    const rolls: number[][] = [];
    const totals: number[] = [];
    
    for (let i = 0; i < 6; i++) {
      const roll = [
        rollDice(1, 6),
        rollDice(1, 6),
        rollDice(1, 6),
        rollDice(1, 6),
      ];
      
      // Sort and drop the lowest value
      roll.sort((a, b) => a - b);
      const rolledValues = roll.slice(1);
      
      // Calculate total
      const total = rolledValues.reduce((sum, val) => sum + val, 0);
      
      rolls.push(roll);
      totals.push(total);
    }
    
    setRollResults(rolls);
    setTotalResults(totals);
    setAssigned({});
  };
  
  const assignAbilityScore = (abilityId: string, score: number) => {
    // Check if this score is already assigned
    const isAssigned = Object.values(assigned).includes(score);
    if (isAssigned) return;
    
    // Assign the score to the ability
    form.setValue(`abilityScores.${abilityId}`, score);
    
    // Mark this score as assigned
    setAssigned(prev => ({
      ...prev,
      [score]: true,
    }));
  };

  return (
    <div className="space-y-6">
      <div className="text-lg font-medium">Determine your character's ability scores:</div>
      
      <div className="grid grid-cols-1 gap-6">
        <div className="flex justify-center mb-4">
          <Button onClick={rollAbilityScores}>
            Roll 4d6 (drop lowest) for Each Ability
          </Button>
        </div>
        
        {totalResults.length > 0 && (
          <Card className="bg-gray-700">
            <CardContent className="p-4">
              <div className="text-center mb-4">
                <div className="font-semibold mb-2">Your Rolls:</div>
                <div className="flex flex-wrap justify-center gap-4">
                  {totalResults.map((total, index) => (
                    <div key={index} className="text-lg font-mono bg-gray-600 px-3 py-1 rounded">
                      {total}
                      <div className="text-xs text-gray-400">
                        {rollResults[index].map((die, i) => (
                          <span key={i} className={i === 0 ? "line-through" : ""}>
                            {die}{i < 3 ? "+" : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-sm text-gray-400 mt-2">
                  (Lowest die in each roll is crossed out)
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {abilities.map((ability) => (
            <FormField
              key={ability.id}
              control={form.control}
              name={`abilityScores.${ability.id}`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-lg">{ability.name}</FormLabel>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 flex items-center justify-center bg-gray-700 text-2xl font-bold rounded-lg">
                      {field.value}
                    </div>
                    <div className="flex-1">
                      <FormDescription>{ability.description}</FormDescription>
                      
                      {totalResults.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {totalResults.map((total, index) => (
                            <Button
                              key={index}
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={assigned[total]}
                              onClick={() => assignAbilityScore(ability.id, total)}
                            >
                              {total}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>
        
        <div className="mt-6">
          <Dice size={64} />
        </div>
      </div>
    </div>
  );
}
