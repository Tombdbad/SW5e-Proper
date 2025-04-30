import React, { useState, useEffect } from 'react';
import { useCombat } from '../../stores/useCombat';
import InitiativeTracker from './InitiativeTracker';
import StatusEffectManager from './StatusEffectManager';
import TranslucentPane from '../ui/TranslucentPane';

export default function CombatTracker() {
  const { 
    combatants, 
    addCombatant, 
    removeCombatant, 
    updateCombatant,
    currentTurn,
    nextTurn,
    endCombat
  } = useCombat();

  const [activeTab, setActiveTab] = useState<'initiative' | 'effects'>('initiative');

  return (
    <TranslucentPane className="p-6">
      <h2 className="text-2xl font-bold text-yellow-400 mb-4">Combat Tracker</h2>

      <div className="flex mb-4">
        <button
          onClick={() => setActiveTab('initiative')}
          className={`px-4 py-2 rounded-l ${
            activeTab === 'initiative' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
          }`}
        >
          Initiative
        </button>
        <button
          onClick={() => setActiveTab('effects')}
          className={`px-4 py-2 rounded-r ${
            activeTab === 'effects' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
          }`}
        >
          Status Effects
        </button>
      </div>

      {activeTab === 'initiative' ? (
        <InitiativeTracker 
          combatants={combatants}
          currentTurn={currentTurn}
          onAddCombatant={addCombatant}
          onRemoveCombatant={removeCombatant}
          onUpdateCombatant={updateCombatant}
          onNextTurn={nextTurn}
          onEndCombat={endCombat}
        />
      ) : (
        <StatusEffectManager 
          combatants={combatants}
          updateCombatant={updateCombatant}
          currentTurn={currentTurn}
        />
      )}
    </TranslucentPane>
  );
}