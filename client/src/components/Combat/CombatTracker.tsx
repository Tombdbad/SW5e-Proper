
import React, { useState } from 'react';
import { useCombat } from '@/lib/stores/useCombat';
import InitiativeTracker from './InitiativeTracker';
import StatusEffectManager from './StatusEffectManager';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TranslucentPane from '../ui/TranslucentPane';
import { Badge } from '@/components/ui/badge';

export default function CombatTracker() {
  const {
    combatants,
    currentTurn,
    round,
    nextTurn,
    endCombat,
    combatType,
    setCombatType,
  } = useCombat();

  const [activeTab, setActiveTab] = useState<'initiative' | 'effects'>('initiative');

  const handleCombatTypeChange = (type: 'personal' | 'starship' | 'vehicle') => {
    setCombatType(type);
    endCombat();
  };

  return (
    <TranslucentPane className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-yellow-400">Combat Tracker</h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            Round {round}
          </Badge>
          <Button variant="outline" onClick={endCombat} size="sm">
            End Combat
          </Button>
        </div>
      </div>

      <Tabs value={combatType} onValueChange={handleCombatTypeChange} className="mb-4">
        <TabsList>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="starship">Starship</TabsTrigger>
          <TabsTrigger value="vehicle">Vehicle</TabsTrigger>
        </TabsList>
      </Tabs>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="initiative">Initiative</TabsTrigger>
          <TabsTrigger value="effects">Status Effects</TabsTrigger>
        </TabsList>

        <TabsContent value="initiative" className="mt-4">
          <InitiativeTracker />
          {combatants.length > 0 && (
            <Button 
              onClick={nextTurn}
              className="w-full mt-4"
              variant="default"
            >
              Next Turn
            </Button>
          )}
        </TabsContent>

        <TabsContent value="effects" className="mt-4">
          <StatusEffectManager />
        </TabsContent>
      </Tabs>
    </TranslucentPane>
  );
}
