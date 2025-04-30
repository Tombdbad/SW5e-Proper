
import React, { useState } from 'react';
import { createEffect } from '../../lib/sw5e/effectParser';
import { StatusEffect } from '../../lib/sw5e/statusEffects';

interface EffectInputProps {
  onSubmit: (effect: StatusEffect) => void;
  className?: string;
}

export default function EffectInput({ onSubmit, className = '' }: EffectInputProps) {
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!description.trim()) {
      setMessage('Please enter an effect description');
      return;
    }
    
    const effect = createEffect(description);
    if (effect) {
      onSubmit(effect);
      setDescription('');
      setMessage(`Applied effect: ${effect.name}`);
      setTimeout(() => setMessage(''), 3000);
    } else {
      setMessage('Could not parse effect. Try a different description.');
    }
  };
  
  return (
    <div className={`p-4 ${className}`}>
      <h3 className="text-lg font-semibold mb-2">Apply Effect</h3>
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <textarea
            className="w-full p-2 bg-gray-800 text-white border border-gray-600 rounded"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the effect (e.g., 'Stunned for 2 rounds', 'Resistance to fire damage')"
            rows={3}
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Parse & Apply
        </button>
        {message && (
          <div className="mt-2 text-sm text-gray-300">{message}</div>
        )}
      </form>
    </div>
  );
}
