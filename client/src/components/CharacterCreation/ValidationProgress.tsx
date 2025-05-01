import React from 'react';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import { getAbilityModifier, getProficiencyBonus } from '../../lib/sw5e/rules';

interface Step {
  id: number;
  name: string;
  component: React.FC;
}

interface ValidationProgressProps {
  steps: Step[];
  currentStep: number;
  completedSteps: Record<number, boolean>;
}

export const ValidationProgress: React.FC<ValidationProgressProps> = ({
  steps,
  currentStep,
  completedSteps,
}) => {
  const calculateProgress = (): number => {
    const completedCount = Object.values(completedSteps).filter(Boolean).length;
    return (completedCount / steps.length) * 100;
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-yellow-400">Character Progress</h3>
      <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
        <div
          className="bg-green-500 h-full transition-all duration-300 ease-in-out"
          style={{ width: `${calculateProgress()}%` }}
        ></div>
      </div>

      <div className="space-y-2 mt-4">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex items-center p-2 rounded-md ${
              currentStep === step.id ? 'bg-gray-700 border-l-4 border-yellow-400' : ''
            }`}
          >
            <span className="mr-2">
              {completedSteps[step.id] ? (
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
              ) : (
                <XCircleIcon className="h-5 w-5 text-gray-500" />
              )}
            </span>
            <span className={`text-sm ${completedSteps[step.id] ? 'text-green-400' : 'text-gray-400'}`}>
              {step.name}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-gray-800 rounded-md border border-gray-700">
        <h4 className="text-sm font-medium text-yellow-400 mb-2">Character Stats Preview</h4>
        <CharacterStatsPreview />
      </div>
    </div>
  );
};

// New component to show real-time stat calculations
const CharacterStatsPreview: React.FC = () => {
  // In a real implementation, you would get this from your character store
  const characterData = useCharacterPreviewData();

  if (!characterData || !characterData.abilityScores) {
    return (
      <div className="text-gray-500 text-sm">
        Complete ability scores to see character stats preview
      </div>
    );
  }

  const { abilityScores, level = 1 } = characterData;
  const proficiencyBonus = getProficiencyBonus(level);

  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex justify-between">
          <span className="text-gray-400">Level:</span>
          <span className="text-white">{level}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Proficiency:</span>
          <span className="text-white">+{proficiencyBonus}</span>
        </div>

        {abilityScores && Object.entries(abilityScores).map(([ability, score]) => (
          <div key={ability} className="flex justify-between">
            <span className="text-gray-400">{ability.charAt(0).toUpperCase() + ability.slice(1).substring(0, 2)}:</span>
            <span className="text-white">
              {score} ({getAbilityModifier(score) >= 0 ? '+' : ''}{getAbilityModifier(score)})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Custom hook to get character preview data from store
const useCharacterPreviewData = () => {
  // This would connect to your character store in a real implementation
  // For now returning mock data
  const characterData = {
    abilityScores: {
      strength: 12,
      dexterity: 14,
      constitution: 13,
      intelligence: 10,
      wisdom: 16,
      charisma: 8
    },
    level: 3
  };

  return characterData;
};

// Placeholder functions -  These need to be implemented based on your actual ruleset
const getAbilityModifier = (score: number): number => Math.floor((score - 10) / 2);
const getProficiencyBonus = (level: number): number => Math.floor((level + 3) / 4);


export default ValidationProgress;