
import React, { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calculateModifier } from "@/lib/sw5e/rules";
import { abilities } from "@/lib/sw5e/abilities";

export default function AbilityScores() {
  const { control, watch, setValue } = useFormContext();
  const abilityScores = watch("abilityScores") || {};
  const [pointsRemaining, setPointsRemaining] = useState(27); // Standard point buy
  const [initialScores, setInitialScores] = useState<Record<string, number>>({});

  const MIN_SCORE = 8;
  const MAX_SCORE = 15;

  // Initialize scores on component mount
  useEffect(() => {
    const defaultScores = {
      strength: 8,
      dexterity: 8,
      constitution: 8,
      intelligence: 8,
      wisdom: 8,
      charisma: 8,
    };

    if (!abilityScores.strength) {
      setValue("abilityScores", defaultScores);
      setInitialScores(defaultScores);
    } else {
      setInitialScores(abilityScores);
    }
  }, []);

  // Calculate points used
  useEffect(() => {
    if (Object.keys(initialScores).length === 0) return;

    let pointsUsed = 0;
    Object.values(abilityScores).forEach((score: number) => {
      if (score > 8) {
        // Point costs: 9=1, 10=2, 11=3, 12=4, 13=5, 14=7, 15=9
        if (score <= 13) {
          pointsUsed += score - 8;
        } else if (score === 14) {
          pointsUsed += 7;
        } else if (score === 15) {
          pointsUsed += 9;
        }
      }
    });

    setPointsRemaining(27 - pointsUsed);
  }, [abilityScores, initialScores]);

  const handleScoreChange = (ability: string, value: number) => {
    // Calculate point cost for the new value
    let newValue = Math.max(MIN_SCORE, Math.min(MAX_SCORE, value));
    
    // Create a new ability scores object with the updated value
    const newScores = { ...abilityScores, [ability]: newValue };
    
    // Calculate points that would be used with the new scores
    let pointsUsed = 0;
    Object.entries(newScores).forEach(([key, score]) => {
      if (score > 8) {
        if (score <= 13) {
          pointsUsed += score - 8;
        } else if (score === 14) {
          pointsUsed += 7;
        } else if (score === 15) {
          pointsUsed += 9;
        }
      }
    });
    
    // Only allow the change if there are enough points
    if (pointsUsed <= 27) {
      setValue(`abilityScores.${ability}`, newValue);
    }
  };

  const getScoreCost = (score: number): number => {
    if (score <= 8) return 0;
    if (score <= 13) return score - 8;
    if (score === 14) return 7;
    return 9; // score === 15
  };

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h3 className="text-lg font-medium text-yellow-400">Ability Scores</h3>
        <p className="text-sm text-gray-400">
          Distribute your ability scores using the point buy system.
          You have {pointsRemaining} points remaining.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {abilities.map((ability) => (
          <FormField
            key={ability.id}
            control={control}
            name={`abilityScores.${ability.id}`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex justify-between">
                  <span>{ability.name}</span>
                  <span className="text-yellow-400">
                    {field.value ? `+${calculateModifier(field.value)}` : "+0"}
                  </span>
                </FormLabel>
                <div className="flex items-center space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={field.value <= MIN_SCORE}
                    onClick={() => handleScoreChange(ability.id, (field.value || 0) - 1)}
                  >
                    -
                  </Button>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      className="text-center"
                      min={MIN_SCORE}
                      max={MAX_SCORE}
                      onChange={(e) => handleScoreChange(ability.id, parseInt(e.target.value))}
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      field.value >= MAX_SCORE ||
                      pointsRemaining <= 0 ||
                      (field.value >= 13 && pointsRemaining < 2) ||
                      (field.value === 14 && pointsRemaining < 2)
                    }
                    onClick={() => handleScoreChange(ability.id, (field.value || 0) + 1)}
                  >
                    +
                  </Button>
                  <span className="text-sm text-gray-400">
                    Cost: {getScoreCost(field.value || 0)}
                  </span>
                </div>
                <FormMessage />
                <p className="text-xs text-gray-500 mt-1">{ability.description}</p>
              </FormItem>
            )}
          />
        ))}
      </div>
    </div>
  );
}
