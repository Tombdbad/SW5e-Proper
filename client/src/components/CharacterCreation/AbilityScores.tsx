import { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { calculateModifier } from "@/lib/sw5e/rules";
import { useCharacter } from "@/lib/stores/useCharacter";

export default function AbilityScores({ pointsRemaining = 27 }: { pointsRemaining?: number } = {}) {
  const { getValues, setValue } = useFormContext();
  const updateCharacter = useCharacter(state => state.updateCharacter);

  const [abilities, setAbilities] = useState({
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  });
  const [points, setPoints] = useState(pointsRemaining);
  const [method, setMethod] = useState<'standard' | 'pointbuy'>('standard');

  // Initialize from form if available
  useEffect(() => {
    const currentAbilities = getValues("abilityScores");
    if (currentAbilities && Object.keys(currentAbilities).length) {
      setAbilities(currentAbilities);
    }
  }, [getValues]);

  // Calculate point cost
  const getPointCost = (score: number): number => {
    if (score <= 13) return score - 8;
    if (score === 14) return 7;
    if (score === 15) return 9;
    return 0; // should not happen
  };

  // Sync form with state
  useEffect(() => {
    setValue("abilityScores", abilities, {
      shouldValidate: true,
      shouldDirty: true,
    });

    // Update the character store
    updateCharacter({ abilityScores: abilities });
  }, [abilities, setValue, updateCharacter]);

  const handleScoreChange = (ability: string, newValue: string) => {
    const value = parseInt(newValue);
    if (isNaN(value) || value < 8 || value > 15) return;

    if (method === 'pointbuy') {
      // Calculate point difference
      const oldValue = abilities[ability as keyof typeof abilities];
      const oldCost = getPointCost(oldValue);
      const newCost = getPointCost(value);
      const pointDiff = newCost - oldCost;

      if (points - pointDiff < 0) return; // Not enough points

      setPoints(prev => prev - pointDiff);
    }

    setAbilities(prev => ({
      ...prev,
      [ability]: value
    }));
  };

  const renderAbilityModifier = (score: number) => {
    const modifier = calculateModifier(score);
    return `${modifier >= 0 ? '+' : ''}${modifier}`;
  };

  const handleMethodChange = (newMethod: 'standard' | 'pointbuy') => {
    setMethod(newMethod);
    if (newMethod === 'pointbuy') {
      // Reset to default point buy values
      setAbilities({
        strength: 8,
        dexterity: 8,
        constitution: 8,
        intelligence: 8,
        wisdom: 8,
        charisma: 8,
      });
      setPoints(pointsRemaining);
    } else {
      // Reset to standard array
      setAbilities({
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-yellow-400">Ability Scores</h2>
        <div className="flex space-x-2">
          <Button 
            variant={method === 'standard' ? "default" : "outline"} 
            onClick={() => handleMethodChange('standard')}
          >
            Standard Array
          </Button>
          <Button 
            variant={method === 'pointbuy' ? "default" : "outline"} 
            onClick={() => handleMethodChange('pointbuy')}
          >
            Point Buy
          </Button>
        </div>
      </div>

      {method === 'pointbuy' && (
        <div className="text-center text-yellow-400 font-medium">
          Points Remaining: {points}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Object.entries(abilities).map(([ability, score]) => (
          <Card key={ability} className="bg-gray-800 border-gray-700">
            <CardContent className="p-4">
              <Label htmlFor={ability} className="text-yellow-400 uppercase text-sm block mb-2">
                {ability}
              </Label>
              <div className="flex items-center space-x-2">
                <Input
                  id={ability}
                  type="number"
                  min={8}
                  max={15}
                  value={score}
                  onChange={(e) => handleScoreChange(ability, e.target.value)}
                  className="w-16 text-center bg-gray-700 border-gray-600"
                />
                <div className="text-lg font-bold text-white">
                  {renderAbilityModifier(score)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="text-sm text-gray-400">
        {method === 'pointbuy' ? (
          <p>
            Using point buy, you can customize your ability scores. Each score starts at 8, and you have 27 points to spend.
            Scores up to 13 cost 1 point per increase. A score of 14 costs 7 points, and 15 costs 9 points.
          </p>
        ) : (
          <p>
            Using standard array, your scores are set to recommended defaults. You can adjust them as needed.
          </p>
        )}
      </div>
    </div>
  );
}