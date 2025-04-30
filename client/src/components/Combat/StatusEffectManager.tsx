
import React, { useEffect, useState } from 'react';
import { StatusEffect } from '../../lib/sw5e/statusEffects';
import { Combatant } from '../../stores/useCombat';
import EffectsPanel from './EffectsPanel';

interface StatusEffectManagerProps {
  combatants: Combatant[];
  updateCombatant: (id: string, updates: Partial<Combatant>) => void;
  currentTurn: number;
}

export default function StatusEffectManager({ 
  combatants, 
  updateCombatant,
  currentTurn 
}: StatusEffectManagerProps) {
  const [effectsByEntity, setEffectsByEntity] = useState<Record<string, StatusEffect[]>>({});
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  
  // Initialize effects for new combatants
  useEffect(() => {
    const newEffectsByEntity = { ...effectsByEntity };
    let updated = false;
    
    combatants.forEach(combatant => {
      if (!newEffectsByEntity[combatant.id]) {
        newEffectsByEntity[combatant.id] = [];
        updated = true;
      }
    });
    
    // Clean up effects for removed combatants
    Object.keys(newEffectsByEntity).forEach(id => {
      if (!combatants.some(c => c.id === id)) {
        delete newEffectsByEntity[id];
        updated = true;
      }
    });
    
    if (updated) {
      setEffectsByEntity(newEffectsByEntity);
    }
  }, [combatants]);
  
  // Process turn effects
  useEffect(() => {
    if (currentTurn >= 0 && combatants.length > 0) {
      const currentCombatant = combatants[currentTurn % combatants.length];
      if (!currentCombatant) return;
      
      // Process start of turn effects
      const effects = effectsByEntity[currentCombatant.id] || [];
      effects.forEach(effect => {
        if (effect.onTurnStart) {
          effect.onTurnStart(currentCombatant);
        }
      });
      
      // Create a new effects array with updated durations
      const updatedEffects = effects.map(effect => {
        if (effect.duration !== "permanent" && effect.duration > 0) {
          return { ...effect, duration: effect.duration - 1 };
        }
        return effect;
      }).filter(effect => effect.duration === "permanent" || effect.duration > 0);
      
      // Apply end of turn effects for effects that are still active
      updatedEffects.forEach(effect => {
        if (effect.onTurnEnd) {
          effect.onTurnEnd(currentCombatant);
        }
      });
      
      // Remove expired effects
      const expiredEffects = effects.filter(
        effect => effect.duration !== "permanent" && effect.duration <= 1
      );
      
      // Apply onRemove handlers for expired effects
      expiredEffects.forEach(effect => {
        if (effect.onRemove) {
          effect.onRemove(currentCombatant);
        }
      });
      
      // Update the effects
      setEffectsByEntity(prev => ({
        ...prev,
        [currentCombatant.id]: updatedEffects
      }));
      
      // Update the combatant if needed
      if (expiredEffects.length > 0) {
        updateCombatant(currentCombatant.id, { ...currentCombatant });
      }
    }
  }, [currentTurn, combatants]);
  
  const applyEffect = (targetId: string, effect: StatusEffect) => {
    const target = combatants.find(c => c.id === targetId);
    if (!target) return;
    
    // Apply the effect handler if exists
    if (effect.onApply) {
      effect.onApply(target);
      updateCombatant(targetId, { ...target });
    }
    
    // Add the effect to the entity's effects
    setEffectsByEntity(prev => ({
      ...prev,
      [targetId]: [...(prev[targetId] || []), effect]
    }));
  };
  
  const removeEffect = (targetId: string, effectId: string) => {
    const effects = effectsByEntity[targetId] || [];
    const effectToRemove = effects.find(e => e.id === effectId);
    
    if (effectToRemove) {
      const target = combatants.find(c => c.id === targetId);
      
      // Apply the remove handler if exists
      if (target && effectToRemove.onRemove) {
        effectToRemove.onRemove(target);
        updateCombatant(targetId, { ...target });
      }
      
      // Remove the effect
      setEffectsByEntity(prev => ({
        ...prev,
        [targetId]: prev[targetId].filter(e => e.id !== effectId)
      }));
    }
  };
  
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-yellow-400 mb-2">Status Effects</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {combatants.map(combatant => {
            const effects = effectsByEntity[combatant.id] || [];
            const hasEffects = effects.length > 0;
            
            return (
              <button
                key={combatant.id}
                onClick={() => setSelectedEntity(combatant.id)}
                className={`
                  p-2 rounded text-left text-sm
                  ${selectedEntity === combatant.id ? 'bg-blue-600' : 'bg-gray-700'}
                  ${hasEffects ? 'border-l-4 border-yellow-400' : ''}
                `}
              >
                <div className="font-medium truncate">{combatant.name}</div>
                {hasEffects && (
                  <div className="text-xs text-gray-300">{effects.length} effect(s)</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
      
      {selectedEntity && (
        <div className="mt-4">
          {combatants.map(combatant => 
            combatant.id === selectedEntity && (
              <EffectsPanel
                key={combatant.id}
                targetId={combatant.id}
                targetName={combatant.name}
                effects={effectsByEntity[combatant.id] || []}
                onApplyEffect={applyEffect}
                onRemoveEffect={removeEffect}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
