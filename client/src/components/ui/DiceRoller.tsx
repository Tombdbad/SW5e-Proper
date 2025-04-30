
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { rollDice } from '../../lib/sw5e/dice';

interface DiceRollerProps {
  className?: string;
}

export default function DiceRoller({ className = '' }: DiceRollerProps) {
  const [diceType, setDiceType] = useState<number>(20);
  const [modifier, setModifier] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);
  const [results, setResults] = useState<number[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [rollHistory, setRollHistory] = useState<Array<{
    dice: string;
    results: number[];
    total: number;
    timestamp: Date;
  }>>([]);
  
  const diceOptions = [4, 6, 8, 10, 12, 20, 100];
  
  const handleRoll = () => {
    setIsRolling(true);
    
    // Animate rolling effect
    setTimeout(() => {
      const rollResults = rollDice(quantity, diceType);
      const sum = rollResults.reduce((acc, val) => acc + val, 0) + modifier;
      
      setResults(rollResults);
      setTotal(sum);
      
      // Add to history
      setRollHistory(prev => [
        {
          dice: `${quantity}d${diceType}${modifier !== 0 ? (modifier > 0 ? '+' + modifier : modifier) : ''}`,
          results: rollResults,
          total: sum,
          timestamp: new Date()
        },
        ...prev.slice(0, 9) // Keep only the last 10 rolls
      ]);
      
      setIsRolling(false);
    }, 500);
  };
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  return (
    <div className={`bg-gray-800 bg-opacity-80 rounded-lg p-4 ${className}`}>
      <h2 className="text-xl font-bold text-yellow-400 mb-4">Dice Roller</h2>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Dice Type</label>
          <div className="flex flex-wrap gap-1">
            {diceOptions.map(die => (
              <button
                key={die}
                className={`px-2 py-1 text-sm rounded ${
                  diceType === die ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-300'
                }`}
                onClick={() => setDiceType(die)}
              >
                d{die}
              </button>
            ))}
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Quantity</label>
          <input
            type="number"
            min={1}
            max={20}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
            className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded"
          />
        </div>
      </div>
      
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-1">Modifier</label>
        <div className="flex items-center">
          <button
            className="px-3 py-1 bg-gray-700 text-white rounded-l"
            onClick={() => setModifier(prev => prev - 1)}
          >
            -
          </button>
          <input
            type="number"
            value={modifier}
            onChange={(e) => setModifier(parseInt(e.target.value) || 0)}
            className="w-16 p-1 text-center bg-gray-700 text-white border-y border-gray-600"
          />
          <button
            className="px-3 py-1 bg-gray-700 text-white rounded-r"
            onClick={() => setModifier(prev => prev + 1)}
          >
            +
          </button>
        </div>
      </div>
      
      <button
        className="w-full py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-600"
        onClick={handleRoll}
        disabled={isRolling}
      >
        {isRolling ? 'Rolling...' : `Roll ${quantity}d${diceType}${modifier !== 0 ? (modifier > 0 ? '+' + modifier : modifier) : ''}`}
      </button>
      
      {total !== null && (
        <div className="mt-4 text-center">
          <div className="mb-2">
            <span className="text-gray-300">Result: </span>
            <motion.span
              initial={{ scale: 1.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-2xl font-bold text-yellow-400"
            >
              {total}
            </motion.span>
          </div>
          <div className="text-sm text-gray-400">
            Dice: {results.join(', ')}
            {modifier !== 0 && ` ${modifier > 0 ? '+' : ''}${modifier}`}
          </div>
        </div>
      )}
      
      {rollHistory.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Roll History</h3>
          <div className="max-h-40 overflow-y-auto">
            <table className="w-full text-sm text-gray-300">
              <thead className="text-xs text-gray-400">
                <tr>
                  <th className="text-left py-1">Time</th>
                  <th className="text-left py-1">Roll</th>
                  <th className="text-right py-1">Result</th>
                </tr>
              </thead>
              <tbody>
                {rollHistory.map((roll, index) => (
                  <tr key={index} className="border-t border-gray-700">
                    <td className="py-1">{formatTime(roll.timestamp)}</td>
                    <td className="py-1">{roll.dice}</td>
                    <td className="text-right py-1 font-medium">{roll.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
