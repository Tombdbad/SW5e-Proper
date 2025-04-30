
import React, { useState } from 'react';
import { StatusEffect } from '../../lib/sw5e/statusEffects';
import EffectInput from '../ui/EffectInput';

interface EffectsPanelProps {
  targetId: string;
  targetName: string;
  effects: StatusEffect[];
  onApplyEffect: (targetId: string, effect: StatusEffect) => void;
  onRemoveEffect: (targetId: string, effectId: string) => void;
}

export default function EffectsPanel({
  targetId,
  targetName,
  effects,
  onApplyEffect,
  onRemoveEffect
}: EffectsPanelProps) {
  const [showInput, setShowInput] = useState(false);
  
  const handleApplyEffect = (effect: StatusEffect) => {
    onApplyEffect(targetId, effect);
    setShowInput(false);
  };
  
  const getDurationText = (duration: number | "permanent") => {
    if (duration === "permanent") return "Permanent";
    return `${duration} round${duration !== 1 ? 's' : ''}`;
  };
  
  // Group effects by type for better organization
  const groupedEffects: Record<string, StatusEffect[]> = {
    conditions: [],
    buffs: [],
    debuffs: [],
    damage: [],
    other: []
  };
  
  effects.forEach(effect => {
    const id = effect.id.toLowerCase();
    if (id.includes('stun') || id.includes('charm') || id.includes('fear') || 
        id.includes('blind') || id.includes('prone') || id.includes('incapacit')) {
      groupedEffects.conditions.push(effect);
    } else if (id.includes('advantage') || id.includes('bonus')) {
      groupedEffects.buffs.push(effect);
    } else if (id.includes('disadvantage') || id.includes('penalty')) {
      groupedEffects.debuffs.push(effect);
    } else if (id.includes('damage')) {
      groupedEffects.damage.push(effect);
    } else {
      groupedEffects.other.push(effect);
    }
  });
  
  return (
    <div className="bg-gray-800 rounded-lg shadow-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-yellow-400">Effects on {targetName}</h2>
        <button
          onClick={() => setShowInput(!showInput)}
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {showInput ? 'Cancel' : 'Add Effect'}
        </button>
      </div>
      
      {showInput && (
        <EffectInput onSubmit={handleApplyEffect} className="mb-4" />
      )}
      
      {effects.length === 0 ? (
        <p className="text-gray-400 italic">No active effects</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedEffects).map(([category, categoryEffects]) => 
            categoryEffects.length > 0 && (
              <div key={category}>
                <h3 className="text-md font-semibold text-gray-300 capitalize mb-2">{category}</h3>
                <div className="grid grid-cols-1 gap-2">
                  {categoryEffects.map(effect => (
                    <div key={effect.id} className="flex items-center justify-between p-2 bg-gray-700 rounded">
                      <div>
                        <div className="font-medium">{effect.name}</div>
                        <div className="text-sm text-gray-400">
                          {effect.description.substring(0, 60)}
                          {effect.description.length > 60 ? '...' : ''}
                        </div>
                        <div className="text-xs text-gray-500">
                          Duration: {getDurationText(effect.duration)}
                        </div>
                      </div>
                      <button
                        onClick={() => onRemoveEffect(targetId, effect.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
