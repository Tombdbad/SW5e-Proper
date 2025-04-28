
import React from 'react';
import { useFormContext } from 'react-hook-form';
import LoreTooltip from './LoreTooltip';

const alignments = [
  { id: 'lawful_light', name: 'Lawful Light', description: 'Follows a strict code focused on justice, order, and protection of the innocent.' },
  { id: 'neutral_light', name: 'Neutral Light', description: 'Believes in the greater good but allows for flexibility in approach.' },
  { id: 'chaotic_light', name: 'Chaotic Light', description: 'Values freedom and individual expression while fighting for good.' },
  { id: 'lawful_neutral', name: 'Lawful Neutral', description: 'Follows rules and traditions without moral judgment.' },
  { id: 'true_neutral', name: 'True Neutral', description: 'Maintains balance and avoids extremes.' },
  { id: 'chaotic_neutral', name: 'Chaotic Neutral', description: 'Follows personal freedom above all else.' },
  { id: 'lawful_dark', name: 'Lawful Dark', description: 'Believes in order through domination and strict hierarchy.' },
  { id: 'neutral_dark', name: 'Neutral Dark', description: 'Values self-interest and power without needless cruelty.' },
  { id: 'chaotic_dark', name: 'Chaotic Dark', description: 'Embraces destruction, discord, and operates on pure selfishness.' },
];

const BasicInfo: React.FC = () => {
  const { register, formState: { errors } } = useFormContext();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-yellow-400">Basic Information</h2>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-yellow-200 mb-1">
            Character Name
          </label>
          <input
            id="name"
            type="text"
            {...register('name')}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 text-white"
            placeholder="Enter character name"
          />
          {errors.name && (
            <p className="mt-1 text-red-400 text-sm">{errors.name.message as string}</p>
          )}
        </div>

        <div>
          <label className="block text-yellow-200 mb-2">
            Alignment
            <span className="ml-2">
              <LoreTooltip 
                title="Force Alignment" 
                content="Your alignment reflects your character's moral compass and approach to the Force. Light side users draw power from peace and harmony, while Dark side users channel emotions like anger and passion."
              />
            </span>
          </label>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {alignments.map((alignment) => (
              <label 
                key={alignment.id}
                className="relative flex items-center p-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md cursor-pointer"
              >
                <input
                  type="radio"
                  {...register('alignment')}
                  value={alignment.id}
                  className="h-4 w-4 text-yellow-500 focus:ring-yellow-500 border-gray-500 bg-gray-700"
                />
                <span className="ml-2 block">
                  <span className="block text-sm font-medium">{alignment.name}</span>
                  <span className="block text-xs text-gray-400">{alignment.description}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.alignment && (
            <p className="mt-1 text-red-400 text-sm">{errors.alignment.message as string}</p>
          )}
        </div>

        <div>
          <label htmlFor="backstory" className="block text-yellow-200 mb-1">
            Personal Backstory (Optional)
          </label>
          <textarea
            id="backstory"
            {...register('backstory')}
            rows={4}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 text-white"
            placeholder="Share your character's history..."
          />
        </div>
      </div>
    </div>
  );
};

export default BasicInfo;
