import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dice } from "@/components/ui/dice";
import { Sword, Shield, Target, Crosshair, RotateCcw } from "lucide-react";
import { useCombat } from "@/lib/stores/useCombat";
import { useCharacter } from "@/lib/stores/useCharacter";
import { rollDice } from "@/lib/sw5e/dice";
import { toast } from "sonner";
import InitiativeTracker from "./InitiativeTracker";

export default function CombatTracker() {
  const { 
    combatants, 
    currentTurn, 
    inCombat, 
    attackRoll,
    damageRoll,
    nextTurn,
    endCombat
  } = useCombat();
  const { character } = useCharacter();
  
  const [diceResult, setDiceResult] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [attackType, setAttackType] = useState<"melee" | "ranged" | "force">("melee");
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  
  // Get the current combatant
  const currentCombatant = combatants[currentTurn];
  
  // Check if it's the player's turn
  const isPlayerTurn = currentCombatant?.id === character?.id;
  
  // Filter enemies (non-player characters)
  const enemies = combatants.filter(c => c.id !== character?.id);
  
  // Simulate dice roll
  const performDiceRoll = (diceType: number, modifier: number = 0) => {
    setIsRolling(true);
    
    // Show rolling animation
    const rollDuration = 1000; // 1 second
    const rollInterval = setInterval(() => {
      setDiceResult(Math.floor(Math.random() * diceType) + 1);
    }, 50);
    
    // Stop the animation after a delay
    setTimeout(() => {
      clearInterval(rollInterval);
      const finalResult = rollDice(1, diceType) + modifier;
      setDiceResult(finalResult);
      setIsRolling(false);
      return finalResult;
    }, rollDuration);
  };
  
  // Handle attack
  const handleAttack = async () => {
    if (!isPlayerTurn || selectedTarget === null) return;
    
    // Get target
    const target = enemies.find(e => e.id === selectedTarget);
    if (!target) return;
    
    // Calculate attack modifier based on attack type and character stats
    let attackModifier = 0;
    if (attackType === "melee") {
      attackModifier = Math.floor((character.abilityScores.strength - 10) / 2) + 2; // +2 is proficiency
    } else if (attackType === "ranged") {
      attackModifier = Math.floor((character.abilityScores.dexterity - 10) / 2) + 2;
    } else if (attackType === "force") {
      attackModifier = Math.floor((character.abilityScores.wisdom - 10) / 2) + 2;
    }
    
    // Roll for attack
    setIsRolling(true);
    
    // Visual rolling
    const rollInterval = setInterval(() => {
      setDiceResult(Math.floor(Math.random() * 20) + 1);
    }, 50);
    
    // Actual roll calculation
    setTimeout(() => {
      clearInterval(rollInterval);
      
      // Calculate the actual roll
      const rollResult = rollDice(1, 20);
      setDiceResult(rollResult);
      setIsRolling(false);
      
      const totalAttackRoll = rollResult + attackModifier;
      
      // Check if it hits
      if (rollResult === 20) {
        // Critical hit!
        toast.success("Critical hit!");
        
        // Roll damage (doubled for crit)
        const damageValue = damageRoll(attackType, true);
        attackRoll(selectedTarget, totalAttackRoll, damageValue, true);
      } else if (totalAttackRoll >= target.armorClass) {
        // Hit
        toast.success(`Hit! (${totalAttackRoll} vs AC ${target.armorClass})`);
        
        // Roll damage
        const damageValue = damageRoll(attackType, false);
        attackRoll(selectedTarget, totalAttackRoll, damageValue, false);
      } else {
        // Miss
        toast.error(`Miss! (${totalAttackRoll} vs AC ${target.armorClass})`);
        attackRoll(selectedTarget, totalAttackRoll, 0, false);
      }
      
      // Reset selected target
      setSelectedTarget(null);
    }, 1000);
  };
  
  // End turn
  const handleEndTurn = () => {
    nextTurn();
  };
  
  // Enemy AI turn
  useEffect(() => {
    if (!currentCombatant || isPlayerTurn || !character) return;
    
    // Enemy's turn - simple AI
    const enemyTurnTimeout = setTimeout(() => {
      // Calculate attack roll
      const attackRollValue = rollDice(1, 20) + 3; // +3 as a simple modifier
      
      // Roll damage if it hits
      if (attackRollValue >= character.armorClass) {
        const damageValue = rollDice(1, 6) + 1;
        toast.error(`${currentCombatant.name} hits you for ${damageValue} damage!`);
        
        // Update character's HP
        if (character.currentHp - damageValue <= 0) {
          toast.error("You have been defeated!");
          // Could add game over logic here
        }
      } else {
        toast.info(`${currentCombatant.name} misses!`);
      }
      
      // End enemy turn
      nextTurn();
    }, 1500);
    
    return () => clearTimeout(enemyTurnTimeout);
  }, [currentTurn, isPlayerTurn, currentCombatant, character, nextTurn]);
  
  if (!inCombat) return null;
  
  return (
    <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-10 w-full max-w-4xl">
      <Card className="bg-gray-800 bg-opacity-90 text-white">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl text-yellow-400">Combat</CardTitle>
            <Button variant="destructive" size="sm" onClick={endCombat}>
              End Combat
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Initiative Order</h3>
              <InitiativeTracker />
              
              {isPlayerTurn ? (
                <div className="mt-4 space-y-4">
                  <div className="bg-yellow-900 bg-opacity-50 p-2 rounded">
                    <h4 className="font-semibold">Your Turn</h4>
                    
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <Button 
                        variant={attackType === "melee" ? "default" : "outline"} 
                        size="sm"
                        onClick={() => setAttackType("melee")}
                      >
                        <Sword className="h-4 w-4 mr-1" />
                        Melee
                      </Button>
                      <Button 
                        variant={attackType === "ranged" ? "default" : "outline"} 
                        size="sm"
                        onClick={() => setAttackType("ranged")}
                      >
                        <Crosshair className="h-4 w-4 mr-1" />
                        Ranged
                      </Button>
                      <Button 
                        variant={attackType === "force" ? "default" : "outline"} 
                        size="sm"
                        onClick={() => setAttackType("force")}
                      >
                        <Target className="h-4 w-4 mr-1" />
                        Force
                      </Button>
                    </div>
                    
                    <div className="flex mt-4 justify-between">
                      <Button 
                        onClick={handleAttack}
                        disabled={selectedTarget === null}
                        className="w-32"
                      >
                        Attack
                      </Button>
                      
                      <Button variant="outline" onClick={handleEndTurn}>
                        End Turn
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 py-4 px-2 text-center">
                  <div className="animate-pulse">
                    {currentCombatant?.name}'s turn...
                  </div>
                </div>
              )}
              
              {isRolling && (
                <div className="mt-4 flex justify-center">
                  <Dice size={60} result={diceResult || undefined} rolling={true} />
                </div>
              )}
              
              {!isRolling && diceResult && (
                <div className="mt-4 flex justify-center">
                  <Dice size={60} result={diceResult} />
                </div>
              )}
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-2">Enemies</h3>
              <div className="space-y-3">
                {enemies.map((enemy) => (
                  <Card 
                    key={enemy.id} 
                    className={`bg-gray-700 border ${selectedTarget === enemy.id ? 'border-yellow-400' : 'border-gray-600'}`}
                    onClick={() => isPlayerTurn && setSelectedTarget(enemy.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex justify-between items-center">
                        <div className="font-medium">{enemy.name}</div>
                        <div className="text-xs">
                          AC: {enemy.armorClass}
                        </div>
                      </div>
                      
                      <div className="mt-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span>HP</span>
                          <span>{enemy.hp}/{enemy.maxHp}</span>
                        </div>
                        <Progress 
                          value={(enemy.hp / enemy.maxHp) * 100} 
                          className="h-2 bg-gray-600"
                          indicatorClassName="bg-red-600"
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
