import React, { useState, useEffect } from "react";
import TranslucentPane from "../ui/TranslucentPane";
import { getAbilityModifier } from "@/lib/sw5e/rules";

interface AbilityScoresProps {
  form: any;
}

export default function AbilityScores({ form }: AbilityScoresProps) {
  const { register, watch, setValue } = form;
  const [pointsRemaining, setPointsRemaining] = useState(27);
  const [method, setMethod] = useState<"pointbuy" | "standard" | "manual">(
    "pointbuy"
  );

  // Initialize default ability scores if they don't exist
  useEffect(() => {
    const currentAbilityScores = watch("abilityScores");

    // Initialize ability scores with default values if they don't exist or are incomplete
    if (!currentAbilityScores || 
        !currentAbilityScores.strength || 
        !currentAbilityScores.dexterity || 
        !currentAbilityScores.constitution || 
        !currentAbilityScores.intelligence || 
        !currentAbilityScores.wisdom || 
        !currentAbilityScores.charisma) {

      const defaultScores = {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      };

      // Set default values for any missing ability scores
      setValue("abilityScores", {
        ...defaultScores,
        ...currentAbilityScores
      });

      console.log("Initialized ability scores:", defaultScores);
    }
  }, [setValue, watch]);

  const abilityScores = watch("abilityScores") || {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10
  };

  // Log ability scores to verify they are persisting
  useEffect(() => {
    console.log("Current ability scores:", abilityScores);
  }, [abilityScores]);

  const abilities = [
    { key: "strength", name: "Strength" },
    { key: "dexterity", name: "Dexterity" },
    { key: "constitution", name: "Constitution" },
    { key: "intelligence", name: "Intelligence" },
    { key: "wisdom", name: "Wisdom" },
    { key: "charisma", name: "Charisma" },
  ];

  const standardArray = [15, 14, 13, 12, 10, 8];

  // Point buy costs: 8 (0), 9 (1), 10 (2), 11 (3), 12 (4), 13 (5), 14 (7), 15 (9)
  const pointCosts = {
    8: 0,
    9: 1,
    10: 2,
    11: 3,
    12: 4,
    13: 5,
    14: 7,
    15: 9,
  };

  const handlePointBuy = (ability: string, value: number) => {
    const oldValue = abilityScores[ability as keyof typeof abilityScores] || 8;
    const oldCost = pointCosts[oldValue as keyof typeof pointCosts] || 0;
    const newCost = pointCosts[value as keyof typeof pointCosts] || 0;

    const pointsChange = newCost - oldCost;
    const newPointsRemaining = pointsRemaining - pointsChange;

    if (newPointsRemaining < 0 || value < 8 || value > 15) {
      return;
    }

    setValue(`abilityScores.${ability}`, value);
    setPointsRemaining(newPointsRemaining);
  };

  const useStandardArray = () => {
    setMethod("standard");
    let remainingArray = [...standardArray];

    abilities.forEach((ability) => {
      if (remainingArray.length === 0) return;
      const value = remainingArray.shift() || 10;
      setValue(`abilityScores.${ability.key}`, value);
    });
  };

  const resetPointBuy = () => {
    setMethod("pointbuy");
    setPointsRemaining(27);
    abilities.forEach((ability) => {
      setValue(`abilityScores.${ability.key}`, 8);
    });
  };

  const switchToManual = () => {
    setMethod("manual");
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-yellow-400">Ability Scores</h2>

      <div className="flex space-x-2 mb-4">
        <button
          type="button"
          onClick={resetPointBuy}
          className={`${
            method === "pointbuy" ? "bg-yellow-800" : "bg-gray-700"
          } text-white px-4 py-1 rounded`}
        >
          Point Buy
        </button>
        <button
          type="button"
          onClick={useStandardArray}
          className={`${
            method === "standard" ? "bg-yellow-800" : "bg-gray-700"
          } text-white px-4 py-1 rounded`}
        >
          Standard Array
        </button>
        <button
          type="button"
          onClick={switchToManual}
          className={`${
            method === "manual" ? "bg-yellow-800" : "bg-gray-700"
          } text-white px-4 py-1 rounded`}
        >
          Manual Entry
        </button>
      </div>

      {method === "pointbuy" && (
        <div className="bg-gray-800 p-2 rounded">
          <p className="text-yellow-300 text-sm font-bold">
            Points Remaining: {pointsRemaining}
          </p>
        </div>
      )}

      <TranslucentPane className="grid grid-cols-2 md:grid-cols-3 gap-4 p-6">
        {abilities.map((ability) => {
          const score = abilityScores[ability.key as keyof typeof abilityScores] || 10;
          const modifier = getAbilityModifier(score);

          return (
            <div
              key={ability.key}
              className="bg-gray-800 p-4 rounded-lg text-center"
            >
              <div className="text-yellow-400 mb-1">{ability.name}</div>

              <div className="relative mb-2">
                <input
                  type="number"
                  {...register(`abilityScores.${ability.key}`)}
                  min={3}
                  max={18}
                  className="w-16 h-16 text-2xl text-center bg-gray-700 rounded-md mx-auto"
                  disabled={method !== "manual"}
                  value={score}
                  onChange={(e) => {
                    if (method === "pointbuy") {
                      handlePointBuy(ability.key, parseInt(e.target.value));
                    } else {
                      setValue(
                        `abilityScores.${ability.key}`,
                        parseInt(e.target.value)
                      );
                    }
                  }}
                />
              </div>

              <div className="text-white">
                Modifier: {modifier >= 0 ? "+" : ""}
                {modifier}
              </div>

              {method === "pointbuy" && (
                <div className="flex justify-center space-x-2 mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      handlePointBuy(ability.key, Math.max(8, score - 1))
                    }
                    className="w-8 h-8 bg-gray-700 rounded-full"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handlePointBuy(ability.key, Math.min(15, score + 1))
                    }
                    className="w-8 h-8 bg-gray-700 rounded-full"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </TranslucentPane>

      <div className="bg-gray-800 bg-opacity-50 p-4 rounded-md">
        <h3 className="text-yellow-400 text-lg mb-2">Ability Score Bonuses</h3>
        <p className="text-white text-sm">
          Racial ability score improvements will be applied automatically based
          on your species selection.
        </p>
      </div>
    </div>
  );
}