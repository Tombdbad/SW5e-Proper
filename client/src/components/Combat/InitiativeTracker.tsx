import { useCombat } from "@/lib/stores/useCombat";
import { useCharacter } from "@/lib/stores/useCharacter";

export default function InitiativeTracker() {
  const { combatants, currentTurn } = useCombat();
  const { character } = useCharacter();

  // Sort combatants by initiative (highest first)
  const sortedCombatants = [...combatants].sort((a, b) => b.initiative - a.initiative);

  return (
    <div className="bg-gray-700 rounded-md overflow-hidden">
      {sortedCombatants.map((combatant, index) => (
        <div 
          key={combatant.id}
          className={`
            flex justify-between items-center px-3 py-2
            ${index !== sortedCombatants.length - 1 ? 'border-b border-gray-600' : ''}
            ${combatants[currentTurn]?.id === combatant.id ? 'bg-yellow-900 bg-opacity-50' : ''}
          `}
        >
          <div className="flex items-center">
            <div className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-800 text-xs mr-2">
              {combatant.initiative}
            </div>
            <span className={combatant.id === character?.id ? "font-bold text-yellow-400" : ""}>
              {combatant.name}
            </span>
          </div>
          <div className="text-xs text-gray-400">
            HP: {combatant.hp}/{combatant.maxHp}
          </div>
        </div>
      ))}
    </div>
  );
}
